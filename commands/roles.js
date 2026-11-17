import { PermissionFlagsBits } from '@strafechat/strafe.js';
import { extractRolesAndReplace } from '../functions/messageEdit.js';
import Paginator from '../functions/pagination.js';
import syncReactions from '../functions/syncReactions.js';
import { panelsForSpace, getPanel, removePanel, updatePanel } from '../functions/panels.js';
import { baseEmbed, replyError, successEmbed, replyEmbed } from '../functions/embeds.js';
import { resolveRoom, sendTo } from '../functions/reply.js';

const ROOM_MENTION = /<#(\d+)>/;
const SETUP_TIMEOUT = 600_000;
const MANAGE_SUBCOMMANDS = ['create', 'edit', 'delete', 'fix', 'reactionfix', 'reactionsfix', 'exclusive'];

const SETUP_EXAMPLE =
  '```\n**This is an example message**\n\n{mention}\nColor Roles:\n{role:Blue}\n{role:Red}\n{role:Purple}\n```';

function helpEmbed(client) {
  const p = client.config.prefix;

  return baseEmbed(client).setTitle('Reaction Roles').setDescription(
    `**Explanation**\nWhen you create a reaction message (\`${p}roles create\`), you will need to provide it with roles (format: \`{role:Blue}\`) and I will copy your message. React to my message to automatically update the roles and once you are finished, react with ${client.config.emojis.check} to complete it.\n\n` +
      `**Creating**\n\`${p}roles create [content | embed] [#room]\`\n\n` +
      `**Editing**\n\`${p}roles edit <messageId>\`\n\n` +
      `**Viewing**\n\`${p}roles view\`\n\n` +
      `**Deleting**\n\`${p}roles delete <messageId>\`\n\n` +
      `**Reactions Fix**\nThis sub-command fixes the reactions on a reaction role message.\n\`${p}roles fix <messageId>\`\n\n` +
      `**Exclusive Mode Toggle**\nExclusive mode limits the reaction message to only give the user one role.\n\`${p}roles exclusive <messageId>\`\n\n` +
      `**Role Mentions**\nAdd \`{mention}\` to your message to use role mentions (<@&ID>) instead of role names when emojis are added. The \`{mention}\` text will be removed from the final message.`,
  );
}

function setupEmbed(client, preview) {
  const text =
    `Send a message you would like to be as your reaction role message. Make sure to put roles following this format: \`{role:Blue}\` in your message wherever you would like them to be at. To cancel this reaction role collector, react with ${client.config.emojis.cross} to stop it!\n\n` +
    `**Example**:\n${SETUP_EXAMPLE}\nOnce the bot replaces your message, react to that new message with emojis in order of the first roles in your message. So if you reacted with :blue_circle:, it will replace \`{role:blue}\` with ":blue_circle: Blue"\n\n` +
    `After you reacted with all of your emojis, react with ${client.config.emojis.check} to complete the reaction collector.\n\n` +
    `**Role Mentions:** include \`{mention}\` anywhere in your message and the bot will mention roles instead of only putting the role's name.`;

  return baseEmbed(client).setDescription(
    preview ? `${text}\n\n\`\`\`txt\n${preview}\n\`\`\`` : text,
  );
}

async function deleteMessage(client, roomId, messageId) {
  if (!messageId) return;
  const room = await resolveRoom(client, roomId).catch(() => null);
  await room?.messages.delete(messageId).catch(() => {});
}

async function requirePermissions(client, message) {
  if (!message.inSpace?.()) {
    await replyError(client, message, 'Reaction roles only work inside a space room.');
    return false;
  }

  const space = message.space;
  const member = message.member ?? (await space.members.fetch(message.author.id).catch(() => null));

  if (!member?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await replyError(client, message, 'You need the **Manage Roles** permission to manage reaction role panels.');
    return false;
  }

  const me = space.members.me ?? (await space.members.fetchMe().catch(() => null));
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await replyError(
      client,
      message,
      'I need the **Manage Roles** permission, and my highest role must be above the roles I hand out.',
    );
    return false;
  }

  const missing = [
    ['SendMessages', 'Send Messages'],
    ['EmbedLinks', 'Embed Links'],
    ['AddReactions', 'Add Reactions'],
  ]
    .filter(([flag]) => !me.permissions.has(PermissionFlagsBits[flag]))
    .map(([, name]) => name);

  if (missing.length) {
    await replyError(
      client,
      message,
      `I need the following permissions to build role panels: ${missing.join(', ')}.`,
    );
    return false;
  }

  return true;
}

export default {
  config: {
    name: 'roles',
    description: 'Create and manage reaction role panels.',
    usage: 'help',
    cooldown: 7000,
    available: true,
    aliases: ['reactionroles', 'reactions', 'reactroles', 'reactionrole', 'rr'],
  },
  run: async (client, message, args) => {
    const userId = message.author.id;
    const roomId = message.roomId;
    const sub = (args[0] ?? 'help').toLowerCase();

    if (MANAGE_SUBCOMMANDS.includes(sub) && !(await requirePermissions(client, message))) return;

    let roomCache;
    const currentRoom = async () => {
      if (roomCache === undefined) roomCache = await resolveRoom(client, roomId).catch(() => null);
      return roomCache;
    };

    switch (sub) {
      case 'help':
        return replyEmbed(client, message, helpEmbed(client));

      case 'stop': {
        const collector = client.messageCollector.get(userId);
        const editor = client.messageEdit.get(userId);
        if (!collector && !editor) {
          return replyError(client, message, 'You have not started a reaction role collector yet!');
        }
        if (collector) {
          clearTimeout(collector.timer);
          client.messageCollector.delete(userId);
        }
        if (editor) {
          clearTimeout(editor.timer);
          client.messageEdit.delete(userId);
          await deleteMessage(client, editor.roomId, editor.setupMessageId);
          await deleteMessage(client, editor.panelRoomId, editor.panelMessageId);
        }
        return replyEmbed(
          client,
          message,
          successEmbed(client, 'Successfully stopped your current reaction role collector!'),
        );
      }

      case 'create': {
        if (client.messageCollector.has(userId)) {
          return replyError(
            client,
            message,
            `You already have an active message collector going on! Finish that first before starting a new one. If you would like to turn that collector off, run \`${client.config.prefix}roles stop\``,
          );
        }

        let targetRoomId = roomId;
        let type = 'content';
        const createArgs = args.slice(1);
        const mention = createArgs.join(' ').match(ROOM_MENTION);
        if (mention) targetRoomId = mention[1];
        const typeArg = createArgs.find((arg) =>
          ['content', 'embed'].includes(arg.toLowerCase()),
        );
        if (typeArg) type = typeArg.toLowerCase();

        const room = await resolveRoom(client, targetRoomId).catch(() => null);
        if (!room) return replyError(client, message, 'I cannot access that room.');

        await message.delete().catch(() => {});
        const setup = await sendTo(client, roomId, { embeds: [setupEmbed(client)] });
        await setup.react(client.config.emojis.check).catch(() => {});
        await setup.react(client.config.emojis.cross).catch(() => {});

        const timer = setTimeout(() => client.messageCollector.delete(userId), SETUP_TIMEOUT);
        timer.unref?.();

        client.messageCollector.set(userId, {
          userId,
          roomId,
          spaceId: room.spaceId,
          targetRoomId,
          setupMessageId: setup.id,
          panelMessageId: null,
          panelRoomId: null,
          panelText: null,
          roles: [],
          regex: [],
          rolesDone: [],
          useMention: false,
          type,
          rolePosition: 0,
          timer,
        });
        return;
      }

      case 'view': {
        const room = await currentRoom();
        if (!room) return replyError(client, message, 'I cannot read this room.');

        const panels = await panelsForSpace(client, room.spaceId);
        if (panels.length === 0) {
          return replyError(
            client,
            message,
            `There are no reaction role messages setup currently. To add some, type \`${client.config.prefix}roles\`.`,
          );
        }

        const paginator = new Paginator({ user: userId, client, timeout: 100_000 });
        for (let i = 0; i < panels.length; i += 3) {
          const entries = await Promise.all(
            panels.slice(i, i + 3).map(async (panel) => {
              const panelRoom = await resolveRoom(client, panel.chanId).catch(() => null);
              const jump = panelRoom?.url ? `[Jump](${panelRoom.url})` : `<#${panel.chanId}>`;
              const exclusive = panel.exclusive ? ' | **Exclusive**: On' : '';

              return `**ID**: ${panel.msgId}\n**Roles**: ${panel.roles?.length ?? 0}${exclusive}\n${jump}`;
            }),
          );

          paginator.add(baseEmbed(client).setDescription(`Reaction Roles\n\n${entries.join('\n\n')}`));
        }
        return paginator.start(roomId);
      }

      case 'edit': {
        if (client.messageCollector.has(userId) || client.messageEdit.has(userId)) {
          return replyError(
            client,
            message,
            `You already have an active message collector going on! Finish that first before starting a new one. If you would like to turn that collector off, run \`${client.config.prefix}roles stop\``,
          );
        }
        if (!args[1]) {
          return replyError(client, message, 'Provide an ID for the reaction role message to edit it');
        }

        const room = await currentRoom();
        if (!room) return replyError(client, message, 'I cannot read this room.');

        const panel = await getPanel(client, room.spaceId, args[1]);
        if (!panel) return replyError(client, message, 'I could not find that panel.');

        const fetched = await resolveRoom(client, panel.chanId)
          .then((panelRoom) => panelRoom.messages.fetch(String(panel.msgId)))
          .catch(() => null);
        if (!fetched) return replyError(client, message, 'I could not find that panel message.');

        const type = fetched.content?.trim() ? 'content' : 'embed';
        const preview = extractRolesAndReplace(
          type === 'content' ? fetched.content : fetched.embeds[0]?.description ?? fetched.content ?? '',
          panel.roles,
          panel.useMention,
        );

        const setup = await sendTo(client, panel.chanId, { embeds: [setupEmbed(client, preview)] });
        await setup.react(client.config.emojis.check).catch(() => {});
        await setup.react(client.config.emojis.cross).catch(() => {});

        const timer = setTimeout(() => client.messageEdit.delete(userId), SETUP_TIMEOUT);
        timer.unref?.();

        client.messageEdit.set(userId, {
          userId,
          roomId: panel.chanId,
          spaceId: room.spaceId,
          targetRoomId: panel.chanId,
          oldMessageId: panel.msgId,
          setupMessageId: setup.id,
          panelMessageId: null,
          panelRoomId: null,
          panelText: null,
          roles: [],
          regex: [],
          rolesDone: [],
          useMention: panel.useMention,
          exclusive: panel.exclusive ?? false,
          type,
          timer,
        });
        return;
      }

      case 'delete': {
        if (!args[1]) {
          return replyError(client, message, 'Provide an ID for the reaction role message to delete it');
        }
        const room = await currentRoom();
        if (!room) return replyError(client, message, 'I cannot read this room.');

        const panel = await getPanel(client, room.spaceId, args[1]);
        if (!panel) return replyError(client, message, 'I could not find that panel.');

        await deleteMessage(client, panel.chanId, panel.msgId);
        await removePanel(client, room.spaceId, panel.msgId);
        return replyEmbed(client, message, successEmbed(client, 'Successfully deleted that reaction role message.'));
      }

      case 'fix':
      case 'reactionfix':
      case 'reactionsfix': {
        if (!args[1]) {
          return replyError(
            client,
            message,
            'Provide an ID for a reaction role message to fix the reactions on it',
          );
        }
        const room = await currentRoom();
        if (!room) return replyError(client, message, 'I cannot read this room.');

        const panel = await getPanel(client, room.spaceId, args[1]);
        if (!panel) return replyError(client, message, 'I could not find that panel.');

        const fetched = await resolveRoom(client, panel.chanId)
          .then((panelRoom) => panelRoom.messages.fetch(String(panel.msgId)))
          .catch(() => null);
        if (!fetched) return replyError(client, message, 'I could not find that panel message.');

        const { failed } = await syncReactions(
          client,
          panel.chanId,
          panel.msgId,
          fetched,
          panel.roles.map((role) => role.emoji),
          { removeExtra: true },
        );
        if (failed.length) {
          return replyError(client, message, `Failed to add: ${failed.join(', ')}`);
        }

        return replyEmbed(
          client,
          message,
          successEmbed(client, `Successfully fixed reactions on \`${panel.msgId}\`.`),
        );
      }

      case 'exclusive': {
        if (!args[1]) {
          return replyError(
            client,
            message,
            'Provide a message ID to toggle exclusive mode.',
          );
        }
        const room = await currentRoom();
        if (!room) return replyError(client, message, 'I cannot read this room.');

        const panel = await getPanel(client, room.spaceId, args[1]);
        if (!panel) return replyError(client, message, 'I could not find that panel.');

        const exclusive = !panel.exclusive;
        await updatePanel(client, room.spaceId, panel.msgId, { exclusive });
        return replyEmbed(
          client,
          message,
          successEmbed(
            client,
            `Successfully turned exclusive mode **${exclusive ? 'On' : 'Off'}** for \`${panel.msgId}\`.`,
          ),
        );
      }

      default:
        return replyEmbed(client, message, helpEmbed(client));
    }
  },
};
