import { EmbedBuilder } from '@strafechat/strafe.js';
import PollDB from '../models/polls.js';
import Polls, { collectTooMuch } from './poll.js';
import { uploadPollImage } from './pollImage.js';
import { resolveRoom } from './reply.js';

const MAX_TIMEOUT = 2_147_000_000;
const timers = new Map();
let clientRef = null;

function endTime(poll) {
  return Number(poll.now) + Number(poll.time);
}

function clearTimer(messageId) {
  const timer = timers.get(messageId);
  if (timer) clearTimeout(timer);
  timers.delete(messageId);
}

function schedule(client, poll) {
  const messageId = poll.messageId;
  if (!messageId) return;

  clearTimer(messageId);

  const remaining = endTime(poll) - Date.now();
  if (remaining <= 0) {
    endPoll(client, messageId).catch(() => {});
    return;
  }

  const timer = setTimeout(() => {
    timers.delete(messageId);
    schedule(client, poll);
  }, Math.min(remaining, MAX_TIMEOUT));
  timer.unref?.();
  timers.set(messageId, timer);
}

async function removeBotReactions(message) {
  if (!message?.reactions?.cache) return;

  for (const reaction of [...message.reactions.cache.values()]) {
    await reaction.remove().catch(() => {});
  }
}

async function endPoll(client, messageId, earlyOwnerId = null) {
  clearTimer(messageId);

  const poll = await PollDB.findOne({ messageId });
  if (!poll || poll.ended) {
    client.polls.delete(messageId);
    return null;
  }

  await PollDB.findOneAndUpdate({ messageId }, { ended: true });

  const instance = new Polls({
    time: 0,
    client,
    name: { name: '', description: poll.desc },
    options: poll.options,
    votes: poll.votes,
    users: poll.users,
    owner: poll.owner,
    lang: poll.lang,
  });
  await instance.update();

  const room = await resolveRoom(client, poll.channelId).catch(() => null);
  const message = await room?.messages?.fetch(poll.messageId).catch(() => null);

  if (message) {
    const tooMuch = collectTooMuch(instance);
    const image = await uploadPollImage(
      client,
      poll.channelId,
      instance.canvas.toBuffer(),
    ).catch(() => null);

    const description = earlyOwnerId
      ? `Owner (<@${earlyOwnerId}>) ended the poll early. These are the final results:${
          tooMuch.length > 0 ? `\n\n${tooMuch.join('\n')}` : ''
        }`
      : `This poll has ended and these are the results${
          tooMuch.length > 0 ? `\n\n${tooMuch.join('\n')}` : ''
        }`;

    const embed = new EmbedBuilder().setDescription(description).setColor('#A52F05');
    if (image?.url) embed.setImage(image.url);

    await message.edit({ embeds: [embed] }).catch(() => {});
    await removeBotReactions(message);
  }

  client.polls.delete(messageId);
  return instance;
}

export function handleNew(pollData) {
  if (!clientRef || !pollData?.messageId) return;
  schedule(clientRef, pollData);
}

export function handleDelete(messageId) {
  clearTimer(messageId);
}

export async function endPollEarly(client, poll) {
  return endPoll(client, poll.messageId);
}

export async function startPolls(client) {
  clientRef = client;

  for (const messageId of [...timers.keys()]) {
    clearTimer(messageId);
  }

  const polls = await PollDB.find({ ended: false });
  const activeIds = new Set(polls.map((poll) => poll.messageId));

  for (const messageId of [...client.polls.keys()]) {
    if (!activeIds.has(messageId)) {
      client.polls.delete(messageId);
    }
  }

  for (const poll of polls) {
    if (!client.polls.has(poll.messageId)) {
      const instance = new Polls({
        time: poll.time,
        client,
        name: { name: '', description: poll.desc },
        options: poll.options,
        votes: poll.votes,
        users: poll.users,
        owner: poll.owner,
        lang: poll.lang,
      });

      client.polls.set(poll.messageId, {
        poll: instance,
        messageId: poll.messageId,
        channelId: poll.channelId,
        roomId: poll.channelId,
        spaceId: poll.serverId,
        owner: poll.owner,
        lang: poll.lang,
      });
    }

    schedule(client, poll);
  }
}

export function stopPolls() {
  for (const messageId of [...timers.keys()]) {
    clearTimer(messageId);
  }
  clientRef = null;
}
