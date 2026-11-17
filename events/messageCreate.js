import Collector from '../functions/messageCollector.js';
import EditCollector from '../functions/messageEdit.js';
import { baseEmbed, replyEmbed } from '../functions/embeds.js';
import color from '../functions/colorCodes.js';

const BOT_ID = '2122536912249364480';
const BOT_MENTION = new RegExp(`<@!?${BOT_ID}>`);

export default async (client, message) => {
  if (!message?.content) return;
  if (message.authorId === '0' || !message.author) return;
  if (message.author.bot) return;

  const userId = message.author.id;
  const roomId = message.roomId;

  const session = client.messageCollector.get(userId);
  if (session && !session.panelMessageId && session.roomId === roomId) {
    return Collector(client, message);
  }

  const editSession = client.messageEdit.get(userId);
  if (editSession && !editSession.panelMessageId && editSession.roomId === roomId) {
    return EditCollector(client, message);
  }

  const prefix = client.config.prefix;

  if (!message.content.startsWith(prefix) && BOT_MENTION.test(message.content)) {
    return replyEmbed(
      client,
      message,
      baseEmbed(client).setDescription(
        `My prefix is \`${prefix}\`. Use \`${prefix}help\` to see the commands.`,
      ),
    );
  }

  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/g);
  const cmd = args.shift()?.toLowerCase();
  if (!cmd) return;

  const command = client.commands.get(cmd) || client.commands.get(client.aliases.get(cmd));
  if (!command) return;

  const usedKey = `${userId}-${cmd}`;
  const used = client.used.get(usedKey);
  if (used) {
    if (client.timeout.get(usedKey)) return;
    client.timeout.set(usedKey, used);
    setTimeout(() => client.timeout.delete(usedKey), used);

    const sent = await replyEmbed(
      client,
      message,
      baseEmbed(client).setDescription(
        `<@${userId}>, wait \`${Math.ceil(used / 1000)}s\` before using \`${cmd}\` again`,
      ),
    );

    if (sent?.delete) setTimeout(() => sent.delete().catch(() => {}), used);
    return sent;
  }

  const cooldown = command.config.cooldown ?? 0;
  client.used.set(usedKey, cooldown);
  setTimeout(() => client.used.delete(usedKey), cooldown);

  try {
    return await command.run(client, message, args);
  } catch (error) {
    console.error(color('%', '%4[Command_Error]%7 ::'), error);
  }
};
