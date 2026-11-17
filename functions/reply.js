export async function resolveRoom(client, roomId) {
  const id = String(roomId);
  return client.rooms.cache.get(id) ?? client.rooms.fetch(id);
}

export function sendTo(client, roomId, options) {
  return resolveRoom(client, roomId).then((room) => room.send(options));
}

export default function reply(client, message, content, options = {}) {
  return message.reply({ content, ...options }).catch(() => {});
}
