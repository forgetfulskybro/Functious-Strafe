import { sendTo } from './reply.js';

export default class Paginator {
  constructor({ user, client, timeout = 60_000 }) {
    this.pages = [];
    this.client = client;
    this.user = user;
    this.page = 0;
    this.timeout = timeout;
  }

  add(page) {
    if (Array.isArray(page)) page.forEach((entry) => this.pages.push(entry));
    else this.pages.push(page);
    return this;
  }

  async start(roomId) {
    if (!this.pages.length) return;

    const reactions = ['⏪', '⬅️', '➡️', '⏩'];

    this.pages.forEach((embed, index) => {
      const label = `Page ${index + 1} / ${this.pages.length}`;
      const footer = embed.data?.footer ?? {};
      embed.setFooter({ text: footer.text ? `${footer.text} • ${label}` : label });
    });

    const message = await sendTo(this.client, roomId, { embeds: [this.pages[0]] });

    this.client.paginate.set(this.user, {
      pages: this.pages,
      page: 0,
      message: message.id,
      room: roomId,
      timer: null,
    });

    for (const reaction of reactions) {
      await message.react(reaction).catch(() => {});
    }

    const state = this.client.paginate.get(this.user);
    state.timer = setTimeout(() => this.client.paginate.delete(this.user), this.timeout);
    state.timer.unref?.();

    return message;
  }
}
