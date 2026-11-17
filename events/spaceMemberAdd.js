export default async (client, member) => {
  if (!member || member.user?.bot) return;

  const db = await client.database.getGuild(member.space.id).catch(() => null);
  if (!db?.joinRoles?.length) return;

  await Promise.all(
    db.joinRoles.map((roleId) => member.roles.add(roleId).catch(() => null)),
  );
};
