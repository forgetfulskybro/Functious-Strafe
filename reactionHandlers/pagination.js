import { resolveRoom } from '../functions/reply.js';

export default async function pagination(client, reaction, user) {
  const state = client.paginate.get(user.id);
  if (!state || state.message !== reaction.message.id) return false;

  const { pages } = state;
  let page = state.page;

  const edit = (index) =>
    resolveRoom(client, state.room)
      .then((room) => room.messages.edit(state.message, { embeds: [pages[index]] }))
      .catch(() => {});

  switch (reaction.emoji.toString()) {
    case '⏪':
      if (page !== 0) {
        state.page = 0;
        await edit(0);
      }
      return true;
    case '⬅️':
      if (pages[page - 1]) {
        page -= 1;
        state.page = page;
        await edit(page);
      }
      return true;
    case '➡️':
      if (pages[page + 1]) {
        page += 1;
        state.page = page;
        await edit(page);
      }
      return true;
    case '⏩':
      if (page !== pages.length - 1) {
        state.page = pages.length - 1;
        await edit(pages.length - 1);
      }
      return true;
    default:
      return false;
  }
}
