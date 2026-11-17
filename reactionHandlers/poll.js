import { EmbedBuilder } from '@strafechat/strafe.js';
import PollDB from '../models/polls.js';
import { handleDelete } from '../functions/checkPolls.js';
import { uploadPollImage } from '../functions/pollImage.js';
import { collectTooMuch, formatDuration } from '../functions/poll.js';

const emojis = [
  { name: '1️⃣', id: 0 },
  { name: '2️⃣', id: 1 },
  { name: '3️⃣', id: 2 },
  { name: '4️⃣', id: 3 },
  { name: '5️⃣', id: 4 },
  { name: '6️⃣', id: 5 },
  { name: '7️⃣', id: 6 },
  { name: '8️⃣', id: 7 },
  { name: '9️⃣', id: 8 },
  { name: '🔟', id: 9 },
  { name: '🛑', id: 'stop' },
];

const COOLDOWN = 3000;

function normalizeEmoji(value) {
  return String(value ?? '').replace(/\uFE0F/g, '');
}

function emojiIndex(reaction) {
  const name = normalizeEmoji(reaction?.emoji?.name ?? reaction?.identifier);
  return emojis.findIndex((entry) => normalizeEmoji(entry.name) === name);
}

function extraText(tooMuch) {
  return tooMuch.length > 0 ? `\n\n${tooMuch.join('\n')}` : '';
}

async function renderPollEmbed(client, pollCheck, description, theme) {
  const roomId = pollCheck.roomId ?? pollCheck.channelId;
  const image = await uploadPollImage(
    client,
    roomId,
    pollCheck.poll.canvas.toBuffer(),
  ).catch(() => null);

  const embed = new EmbedBuilder()
    .setDescription(description)
    .setColor(theme || '#A52F05');

  if (image?.url) embed.setImage(image.url);

  return embed;
}

async function removeBotReactions(message) {
  if (!message?.reactions?.cache) return;

  for (const reaction of [...message.reactions.cache.values()]) {
    await reaction.remove().catch(() => {});
  }
}

export default async function pollHandler(client, reaction, user, pollCheck, event = 'add') {
  const message = reaction.message;
  const userId = user.id;
  const db = await client.database
    .getGuild(message?.spaceId ?? pollCheck.spaceId)
    .catch(() => null);
  const theme = db?.theme ?? client.config.theme ?? '#A52F05';

  if (event === 'remove') {
    if (client.reactions.get(userId)) return;

    const convert = emojiIndex(reaction);
    if (convert < 0 || convert > 9) return;

    const entry = pollCheck.poll.users.find((object) => object.user === userId);
    if (!entry || entry.option !== convert) return;

    client.reactions.set(userId, Date.now() + COOLDOWN);
    setTimeout(() => client.reactions.delete(userId), COOLDOWN).unref?.();

    pollCheck.poll.users = pollCheck.poll.users.filter((object) => object.user !== userId);
    await pollCheck.poll.removeVote(convert, userId, message.id);

    const tooMuch = collectTooMuch(pollCheck.poll);
    const embed = await renderPollEmbed(
      client,
      pollCheck,
      `**Duration**: ${formatDuration(pollCheck.poll.time)}${extraText(tooMuch)}`,
      theme,
    );
    await message.edit({ embeds: [embed] }).catch(() => {});
    return;
  }

  const convert = emojiIndex(reaction);

  if (convert === 10) {
    if (pollCheck.owner !== userId) return;

    handleDelete(message.id);
    await PollDB.findOneAndUpdate({ messageId: message.id }, { ended: true });
    await pollCheck.poll.update();

    const tooMuch = collectTooMuch(pollCheck.poll);
    const embed = await renderPollEmbed(
      client,
      pollCheck,
      `Owner (<@${pollCheck.owner}>) ended the poll early. These are the final results:${extraText(
        tooMuch,
      )}`,
      theme,
    );
    await message.edit({ embeds: [embed] }).catch(() => {});
    await removeBotReactions(message);

    client.polls.delete(message.id);
    return;
  }

  if (convert < 0) return;
  if (client.reactions.get(userId)) return;
  if (pollCheck.poll.users.find((object) => object.user === userId)) return;

  client.reactions.set(userId, Date.now() + COOLDOWN);
  setTimeout(() => client.reactions.delete(userId), COOLDOWN).unref?.();

  const avatar = user.avatarURL?.() ?? user.avatar ?? null;
  pollCheck.poll.users.push({ user: userId, option: convert, avatar });
  await pollCheck.poll.addVote(convert, userId, avatar, message.id);

  const tooMuch = collectTooMuch(pollCheck.poll);
  const embed = await renderPollEmbed(
    client,
    pollCheck,
    `**Duration**: ${formatDuration(pollCheck.poll.time)}${extraText(tooMuch)}`,
    theme,
  );
  await message.edit({ embeds: [embed] }).catch(() => {});
}
