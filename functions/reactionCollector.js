import { EventEmitter } from 'node:events';

export default class ReactionCollector extends EventEmitter {
  constructor(client, options = {}) {
    super();

    const { messageId, roomId, time = 60_000, max = Infinity, filter = () => true } = options;
    if (!messageId || !roomId) throw new TypeError('ReactionCollector requires a messageId and a roomId');

    this.client = client;
    this.messageId = String(messageId);
    this.roomId = String(roomId);
    this.time = time;
    this.max = max;
    this.filter = filter;
    this.collected = 0;
    this.users = new Set();
    this.ended = false;

    this.timer = setTimeout(() => this.stop('time'), time);
    this.timer.unref?.();

    const existing = client.reactionCollectors.get(this.messageId);
    if (existing) existing.add(this);
    else client.reactionCollectors.set(this.messageId, new Set([this]));
  }

  handle(type, reaction, user) {
    if (this.ended) return false;
    if (String(reaction?.message?.id) !== this.messageId) return false;
    if (String(reaction?.message?.roomId) !== this.roomId) return false;
    if (!user || user.bot) return false;
    if (!this.filter(reaction, user)) return false;

    if (type === 'MESSAGE_REACTION_ADD') {
      this.collected += 1;
      this.users.add(user.id);
      this.emit('collect', reaction, user);
      if (this.collected >= this.max) this.stop('limit');
    } else {
      this.users.delete(user.id);
      this.emit('remove', reaction, user);
    }

    return true;
  }

  stop(reason = 'manual') {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.timer);

    const collectors = this.client.reactionCollectors.get(this.messageId);
    if (collectors) {
      collectors.delete(this);
      if (collectors.size === 0) this.client.reactionCollectors.delete(this.messageId);
    }

    this.emit('end', reason);
  }
}
