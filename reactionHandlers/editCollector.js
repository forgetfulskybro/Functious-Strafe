import syncReactions from '../functions/syncReactions.js';
import { updatePanel } from '../functions/panels.js';
import { deleteAfter, errorEmbed, panelEmbed, successEmbed } from '../functions/embeds.js';
import { resolveRoom, sendTo } from '../functions/reply.js';
import {
  emojiSpaceError,
  removeReactionIfPossible,
  validateReactionEmojiSpace,
} from '../functions/reactionEmoji.js';

const FIRST_ROLE = /\{role:\s*.*?\s*\}/i;
const FEEDBACK_MS = 7000;
const explainCooldown = new Map();

function panelPayload(client, session, text = '') {
  return session.type === 'content'
    ? { content: text || 'React below to get a role.' }
    : { embeds: [panelEmbed(client, text)] };
}

async function deleteMessage(client, roomId, messageId) {
  if (!messageId) return;
  const room = await resolveRoom(client, roomId).catch(() => null);
  await room?.messages.delete(messageId).catch(() => {});
}

async function cleanup(client, session) {
  await deleteMessage(client, session.roomId, session.setupMessageId);
  await deleteMessage(client, session.panelRoomId, session.panelMessageId);
}

async function explainReactionIssue(client, session, userId, content, type = 'general') {
  const key = `${userId}_${session.setupMessageId}_${type}`;
  const now = Date.now();
  const last = explainCooldown.get(key);
  if (last && now - last <= FEEDBACK_MS) return;

  explainCooldown.set(key, now);

  const room = await resolveRoom(client, session.roomId).catch(() => null);
  const botMessage = session.panelMessageId
    ? await room?.messages.fetch(String(session.panelMessageId)).catch(() => null)
    : null;

  const explanation = botMessage
    ? await botMessage.reply({ content }).catch(() => null)
    : await sendTo(client, session.roomId, { content }).catch(() => null);

  setTimeout(() => {
    explanation?.delete?.().catch(() => {});
    explainCooldown.delete(key);
  }, FEEDBACK_MS);
}

async function explainWrongReaction(client, session, userId) {
  return explainReactionIssue(
    client,
    session,
    userId,
    'Make sure to react to this message instead.',
    'wrong-message',
  );
}

async function finalize(client, session, userId) {
  if (
    session.roles.length > 0 ||
    session.regex.length > 0 ||
    session.rolesDone.length === 0
  ) {
    return;
  }

  const room = await resolveRoom(client, session.targetRoomId).catch(() => null);
  const old = room
    ? await room.messages.fetch(String(session.oldMessageId)).catch(() => null)
    : null;

  if (!old) {
    await cleanup(client, session);
    const notice = await sendTo(client, session.roomId, {
      embeds: [
        errorEmbed(
          client,
          "I couldn't find the original message to edit. It may have been deleted.",
        ),
      ],
    }).catch(() => null);
    deleteAfter(notice);
    client.messageEdit.delete(userId);
    return;
  }

  const useEmbed = session.type === 'embed';
  const editPayload = useEmbed
    ? { embeds: [panelEmbed(client, session.panelText)] }
    : { content: session.panelText };

  await room.messages.edit(session.oldMessageId, editPayload).catch(() => {});

  const refreshed = await room.messages.fetch(String(session.oldMessageId)).catch(() => null);

  await syncReactions(
    client,
    session.targetRoomId,
    session.oldMessageId,
    refreshed ?? old,
    session.rolesDone.map((entry) => entry.emoji),
    { removeExtra: true },
  );

  await updatePanel(client, session.spaceId, session.oldMessageId, {
    chanId: session.targetRoomId,
    exclusive: session.exclusive ?? false,
    type: useEmbed ? 'embed' : 'content',
    useMention: session.useMention,
    roles: session.rolesDone.map((entry) => ({
      emoji: entry.emoji,
      roleId: entry.roleId,
      name: entry.name,
      position: entry.position,
    })),
  });

  await cleanup(client, session);
  client.messageEdit.delete(userId);

  await sendTo(client, session.roomId, {
    embeds: [successEmbed(client, 'Successfully updated the roles/emojis on this panel.')],
  }).catch(() => {});
}

async function cancel(client, session, userId) {
  client.messageEdit.delete(userId);
  await deleteMessage(client, session.roomId, session.setupMessageId);
  await sendTo(client, session.roomId, {
    embeds: [successEmbed(client, 'Successfully stopped reaction collector!')],
  }).catch(() => {});
}

export default async function editCollector(client, reaction, user, event = 'add') {
  const session = client.messageEdit.get(user.id);
  if (!session) return false;

  const emoji = reaction.emoji.toString();
  const emojiKey = reaction.identifier ?? emoji;
  const messageId = reaction.message.id;

  if (messageId === session.setupMessageId) {
    if (event === 'add' && emoji !== client.config.emojis.check && emoji !== client.config.emojis.cross) {
      await explainWrongReaction(client, session, user.id);
      return true;
    }

    if (emoji === client.config.emojis.check) {
      await finalize(client, session, user.id);
      return true;
    }

    if (emoji === client.config.emojis.cross) {
      await cancel(client, session, user.id);
      return true;
    }

    return false;
  }

  if (messageId === session.panelMessageId) {
    if (event === 'add') {
      const spaceCheck = await validateReactionEmojiSpace(client, reaction, session.spaceId);
      if (!spaceCheck.ok) {
        await explainReactionIssue(
          client,
          session,
          user.id,
          emojiSpaceError(reaction, spaceCheck.reason),
          'emoji-space',
        );
        await removeReactionIfPossible(reaction, user.id);
        return true;
      }
    }

    if (event === 'add' && session.roles.length > 0) {
      const role = session.roles.shift();
      session.regex.shift();

      if (!role.oldPosition) session.rolePosition = (session.rolePosition ?? 0) + 1;
      const position = role.oldPosition ?? session.rolePosition;
      const display = session.useMention ? `<@&${role.id}>` : `${role.name}`;
      session.panelText = session.panelText.replace(FIRST_ROLE, `${emoji} ${display}`);
      session.rolesDone.push({
        emoji,
        emojiKey,
        roleId: role.id,
        name: role.name,
        position,
      });

      const room = await resolveRoom(client, session.panelRoomId).catch(() => null);
      await room?.messages
        .edit(session.panelMessageId, panelPayload(client, session, session.panelText))
        .catch(() => {});
      return true;
    }

    if (event === 'remove') {
      const index = session.rolesDone.findIndex(
        (entry) => entry.emojiKey === emojiKey || entry.emoji === emoji,
      );
      if (index === -1) return false;

      const [entry] = session.rolesDone.splice(index, 1);
      const display = session.useMention ? `<@&${entry.roleId}>` : `${entry.name}`;
      session.panelText = session.panelText.replace(
        `${entry.emoji} ${display}`,
        `{role:${entry.name}}`,
      );
      session.roles.unshift({
        id: entry.roleId,
        name: entry.name,
        oldPosition: entry.position,
      });
      session.regex.unshift(entry.name);

      const room = await resolveRoom(client, session.panelRoomId).catch(() => null);
      await room?.messages
        .edit(session.panelMessageId, panelPayload(client, session, session.panelText))
        .catch(() => {});
      return true;
    }
  }

  return false;
}
