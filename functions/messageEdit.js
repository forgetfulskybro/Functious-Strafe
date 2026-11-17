import getRoles from './getRoles.js';
import { panelEmbed, replyEmbed, replyError, successEmbed } from './embeds.js';

const ROLE_TOKEN = /\{role:\s*(.*?)\s*\}/gi;

export function extractRolesAndReplace(text, roles, useMention = false) {
  let result = String(text ?? '');
  for (const entry of roles ?? []) {
    const display = useMention ? `<@&${entry.roleId ?? entry.role}>` : `${entry.name}`;
    result = result.split(`${entry.emoji} ${display}`).join(`{role:${entry.name}}`);
  }
  return result;
}

export default async function editCollector(client, message) {
  const session = client.messageEdit.get(message.author.id);
  if (!session) return;

  if (message.content.toLowerCase() === `${client.config.prefix}roles stop`) {
    clearTimeout(session.timer);
    client.messageEdit.delete(message.author.id);
    return replyEmbed(
      client,
      message,
      successEmbed(client, 'Successfully stopped your current reaction role collector!'),
    );
  }

  const found = message.content.match(ROLE_TOKEN);
  if (!found || found.length === 0) {
    return replyError(
      client,
      message,
      `No roles found. Use \`{role:Red}\` placeholders.\n\nType \`${client.config.prefix}roles stop\` to cancel.`,
    );
  }

  const roles = found.map((token) => token.match(/\{role:\s*(.*?)\s*\}/i)[1]);
  if (roles.length > 30) {
    return replyError(client, message, 'You can only add up to 30 roles per panel.');
  }

  const resolved = await getRoles(roles, message, client);
  if (!resolved) return;

  session.regex = roles;
  session.roles = resolved.roles;
  session.spaceId = resolved.spaceId;
  session.useMention = /\{mention\}/i.test(message.content);
  session.rolePosition = 0;

  const content =
    message.content
      .replace(/\{role:\s*(.*?)\s*\}/gi, '{role:$1}')
      .replace(/\{mention\}/gi, '')
      .trim() || 'React below to get a role.';

  await message.delete().catch(() => {});

  const staging = await message.room.send(
    session.type === 'content'
      ? { content }
      : { embeds: [panelEmbed(client, content)] },
  );
  session.panelMessageId = staging.id;
  session.panelRoomId = message.roomId;
  session.panelText = content;
  return staging;
}
