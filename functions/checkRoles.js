import { resolveRoom } from './reply.js';

export default async function checkRoles(client) {
  if (!client.database) return;

  const guilds = await client.database.getAll().catch(() => []);

  for (const guild of guilds) {
    const panels = Array.isArray(guild.roles) ? guild.roles : [];

    for (const panel of panels) {
      const room = await resolveRoom(client, panel.chanId).catch(() => null);
      if (!room) continue;

      await room.messages.fetch(String(panel.msgId)).catch(() => {});
    }
  }
}

export { reactionKey } from './syncReactions.js';
