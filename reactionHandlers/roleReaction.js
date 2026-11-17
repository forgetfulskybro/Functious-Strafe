import { getPanel } from '../functions/panels.js';
import { reactionKey } from '../functions/syncReactions.js';

function displayEmoji(reaction, emojiId) {
  const emoji = reaction.emoji;
  if (!emoji) return emojiId;

  if (emoji.id) {
    return `<${emoji.animated ? 'a' : ''}:${emoji.name ?? '_'}:${emoji.id}>`;
  }

  return emoji.name ?? emojiId;
}

function findRole(panel, display, reaction, emojiId) {
  let role = panel.roles.find((entry) => entry.emoji === display);

  if (!role && reaction.emoji?.id) {
    const fallback = reaction.emoji.animated
      ? `<:${reaction.emoji.name ?? '_'}:${reaction.emoji.id}>`
      : `<a:${reaction.emoji.name ?? '_'}:${reaction.emoji.id}>`;
    role = panel.roles.find((entry) => entry.emoji === fallback);
  }

  if (!role && emojiId) role = panel.roles.find((entry) => entry.emoji === emojiId);

  if (!role) {
    const key = reactionKey(display);
    role = panel.roles.find((entry) => reactionKey(entry.emoji) === key);
  }

  return role;
}

export default async function roleReaction(client, reaction, user, event = 'add') {
  const message = reaction.message;
  const room = message?.room;
  const space = room?.space;
  if (!space) return;

  const panel = await getPanel(client, space.id, message.id);
  if (!panel) return;

  const emojiId = reaction.emoji?.name ?? reaction.identifier;
  const display = displayEmoji(reaction, emojiId);
  const role = findRole(panel, display, reaction, emojiId);
  if (!role) return;

  const member = await space.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const roleId = role.roleId ?? role.role;
  if (!roleId) return;

  const hasRole = member.roles.cache.has(roleId);
  if (event === 'add' && hasRole) return;
  if (event === 'remove' && !hasRole) return;

  if (event === 'add') {
    let error = false;

    await member.roles.add(roleId).catch(() => {
      error = true;
    });

    if (panel.exclusive && !error) {
      const others = panel.roles.filter(
        (entry) =>
          entry.emoji !== role.emoji &&
          (entry.roleId ?? entry.role) &&
          member.roles.cache.has(entry.roleId ?? entry.role),
      );

      for (const otherRole of others) {
        await member.roles.remove(otherRole.roleId ?? otherRole.role).catch(() => {
          error = true;
        });
      }
    }
  } else {
    await member.roles.remove(roleId).catch(() => {});
  }
}
