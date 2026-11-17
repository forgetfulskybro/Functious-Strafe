import checkRoles from '../functions/checkRoles.js';
import color from '../functions/colorCodes.js';

export default async (client) => {
  console.log(color('%', `%2[Bot_Ready]%7 :: ${client.user.username} is ready`));

  await checkRoles(client).catch(() => {});
};
