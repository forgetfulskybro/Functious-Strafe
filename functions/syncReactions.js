import { resolveRoom } from './reply.js';

export function reactionKey(emoji) {
  const value = String(emoji ?? '').trim();
  const angled = /^<(a?):([^:<>]+):(\d+)>$/.exec(value);
  if (angled) return angled[3];
  const custom = /^custom:(\d+)$/.exec(value);
  if (custom) return custom[1];
  const bare = /^(?:a:)?([A-Za-z0-9_+-]+):(\d{15,20})$/.exec(value);
  if (bare) return bare[2];
  return value;
}

function isRetryable(error) {
  const status = error?.statusCode ?? error?.status;
  if (status === undefined || status === null) return true;
  return status === 429 || status >= 500;
}

async function attempt(fn) {
  try {
    await Promise.resolve().then(fn);
    return null;
  } catch (error) {
    return error || new Error('failed');
  }
}

export default async function syncReactions(
  client,
  roomId,
  messageId,
  message,
  emojis,
  { removeExtra = false } = {},
) {
  let target = message;
  if (!target) {
    const room = await resolveRoom(client, roomId).catch(() => null);
    target = room ? await room.messages.fetch(String(messageId)).catch(() => null) : null;
  }
  if (!target) return { added: [], removed: [], failed: [...(emojis ?? [])] };

  const desired = new Map();
  for (const emoji of emojis ?? []) {
    const value = String(emoji ?? '').trim();
    if (value) desired.set(reactionKey(value), value);
  }

  const present = new Map();
  for (const reaction of target.reactions.cache.values()) {
    present.set(reactionKey(reaction.identifier), reaction);
  }

  const added = [];
  const removed = [];
  const failed = [];

  if (removeExtra) {
    for (const [key, reaction] of present) {
      if (desired.has(key) || !reaction.me) continue;

      let error = await attempt(() => reaction.remove());
      for (let retry = 1; error && retry < 3 && isRetryable(error); retry++) {
        await new Promise((resolve) => setTimeout(resolve, 250 * retry));
        error = await attempt(() => reaction.remove());
      }

      if (!error) removed.push(reaction.emoji.toString());
    }
  }

  for (const [key, emoji] of desired) {
    if (present.has(key)) continue;

    let error = await attempt(() => target.react(emoji));
    for (let retry = 1; error && retry < 3 && isRetryable(error); retry++) {
      await new Promise((resolve) => setTimeout(resolve, 250 * retry));
      error = await attempt(() => target.react(emoji));
    }

    if (error) failed.push(emoji);
    else added.push(emoji);
  }

  return { added, removed, failed };
}
