import { replyError } from './embeds.js';
import { resolveRoom } from './reply.js';

const ROLE_MENTION = /^<@&(\d+)>$/;
const SNOWFLAKE = /^\d+$/;

export default async function getRoles(roles, message, client) {
  let room;
  try {
    room = await resolveRoom(client, message.roomId);
  } catch {
    replyError(client, message, 'I could not read this room or its roles.');
    return null;
  }

  const space = room.space;
  if (!space) {
    replyError(client, message, 'I could not read this room or its roles.');
    return null;
  }

  const spaceRoles = space.roles.cache;
  const resolved = [];
  const unknown = [];

  for (const raw of roles) {
    const value = String(raw).trim();
    const mention = value.match(ROLE_MENTION);
    let found;

    if (mention) found = spaceRoles.get(mention[1]);
    else if (value === '@everyone') found = space.everyoneRoleId ? spaceRoles.get(space.everyoneRoleId) : undefined;
    else if (SNOWFLAKE.test(value)) found = spaceRoles.get(value);
    else found = spaceRoles.find((role) => role.name.toLowerCase() === value.toLowerCase());

    if (found) resolved.push(found);
    else unknown.push(value);
  }

  if (unknown.length) {
    replyError(
      client,
      message,
      `Unknown roles:\n${unknown.map((u) => `\`{role:${u}}\``).join(', ')}\n\nType \`${client.config.prefix}roles stop\` to cancel.`,
    );
    return null;
  }

  const seen = new Set();
  const duplicates = [];
  for (const role of resolved) {
    if (seen.has(role.id)) duplicates.push(role);
    else seen.add(role.id);
  }

  if (duplicates.length) {
    replyError(
      client,
      message,
      `Duplicate roles:\n${duplicates.map((r) => `\`{role:${r.name.trim()}}\``).join(', ')}\n\nType \`${client.config.prefix}roles stop\` to cancel.`,
    );
    return null;
  }

  return { roles: resolved, spaceId: room.spaceId, roomId: message.roomId };
}
