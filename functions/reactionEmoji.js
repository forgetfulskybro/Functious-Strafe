const SPACE_RULE =
  'Only standard emojis and custom emojis that belong to this space can be used on reaction role panels.';

export function emojiSpaceError(reaction, reason) {
  const emoji = reaction?.emoji?.toString?.() || 'That emoji';

  if (reason === 'inaccessible') {
    return `I can't add ${emoji} because it belongs to a space I don't have access to. ${SPACE_RULE}`;
  }

  return `I can't add ${emoji} because it belongs to a different space. ${SPACE_RULE}`;
}

export async function validateReactionEmojiSpace(client, reaction, spaceId) {
  const emoji = reaction?.emoji;
  if (!emoji?.id) return { ok: true };

  let resolved = client.emojis?.cache?.get?.(emoji.id) ?? null;
  if (!resolved) {
    resolved = await client.emojis?.fetch?.(emoji.id).catch(() => null);
    if (!resolved) return { ok: true };
  }

  const ownerId = resolved.spaceId ?? resolved.space?.id ?? null;
  if (!ownerId) return { ok: false, reason: 'inaccessible' };
  if (spaceId && String(ownerId) !== String(spaceId)) {
    return { ok: false, reason: 'different' };
  }

  return { ok: true };
}

export async function removeReactionIfPossible(reaction, userId) {
  try {
    await reaction?.users?.remove?.(userId);
    return;
  } catch {
    // Strafe can only remove the bot's own reaction.
  }

  if (reaction?.me) await reaction.remove().catch(() => {});
}
