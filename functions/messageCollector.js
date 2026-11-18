import getRoles from './getRoles.js';
import { panelEmbed, replyEmbed, replySetupError, successEmbed } from './embeds.js';

const ROLE_TOKEN = /\{role:\s*(.*?)\s*\}/gi;

export default async function Collector(client, message) {
  const session = client.messageCollector.get(message.author.id);
  if (!session) return;

  const prefix = session.prefix ?? client.config.prefix;

  if (message.content.toLowerCase() === `${prefix}roles stop`) {
    clearTimeout(session.timer);
    client.messageCollector.delete(message.author.id);
    return replyEmbed(
      client,
      message,
      successEmbed(client, 'Successfully stopped your current reaction role collector!'),
    );
  }

  const found = message.content.match(ROLE_TOKEN);
  if (!found || found.length === 0) {
    return replySetupError(
      client,
      message,
      `No roles found. Use \`{role:Red}\` placeholders.\n\nType \`${prefix}roles stop\` to cancel.`,
    );
  }

  const roles = found.map((token) => token.match(/\{role:\s*(.*?)\s*\}/i)[1]);
  if (roles.length > 30) {
    return replySetupError(client, message, 'You can only add up to 30 roles per panel.');
  }

  const resolved = await getRoles(roles, message, client, prefix);
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

  const panel = await message.room.send(
    session.type === 'content'
      ? { content }
      : { embeds: [panelEmbed(client, content)] },
  );
  session.panelMessageId = panel.id;
  session.panelRoomId = message.roomId;
  session.panelText = content;
  return panel;
}
