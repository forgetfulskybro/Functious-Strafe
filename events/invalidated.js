import color from '../functions/colorCodes.js';

export default async (client, reason) => {
  console.error(color('%', `%4[Gateway]%7 :: Session invalidated (${reason})`));

  await client.destroy().catch(() => {});
  process.exit(1);
};
