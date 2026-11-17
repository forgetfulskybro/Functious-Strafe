function rolesOf(guild) {
  return Array.isArray(guild?.roles) ? guild.roles : [];
}

export async function panelsForSpace(client, spaceId) {
  const guild = await client.database.getGuild(String(spaceId));
  return rolesOf(guild);
}

export async function getPanel(client, spaceId, msgId) {
  const guild = await client.database.getGuild(String(spaceId));
  return rolesOf(guild).find((panel) => panel.msgId === String(msgId)) ?? null;
}

export async function addPanel(client, spaceId, panel) {
  const guild = await client.database.getGuild(String(spaceId), true);
  const roles = rolesOf(guild).filter((entry) => entry.msgId !== panel.msgId);
  roles.push(panel);
  await client.database.updateGuild(String(spaceId), { roles });
  return panel;
}

export async function updatePanel(client, spaceId, msgId, patch) {
  const guild = await client.database.getGuild(String(spaceId));
  const roles = rolesOf(guild).map((entry) =>
    entry.msgId === String(msgId) ? { ...entry, ...patch } : entry,
  );
  await client.database.updateGuild(String(spaceId), { roles });
  return roles.find((entry) => entry.msgId === String(msgId)) ?? null;
}

export async function removePanel(client, spaceId, msgId) {
  const guild = await client.database.getGuild(String(spaceId));
  const roles = rolesOf(guild).filter((entry) => entry.msgId !== String(msgId));
  await client.database.updateGuild(String(spaceId), { roles });
  return true;
}

export async function getSettings(client, spaceId) {
  const guild = await client.database.getGuild(String(spaceId));
  return { dm: guild?.dm ?? true };
}

export async function updateSettings(client, spaceId, patch) {
  const guild = await client.database.getGuild(String(spaceId), true);
  await client.database.updateGuild(String(spaceId), patch);
  return { dm: guild?.dm ?? true, ...patch };
}

export default {
  panelsForSpace,
  getPanel,
  addPanel,
  updatePanel,
  removePanel,
  getSettings,
  updateSettings,
};
