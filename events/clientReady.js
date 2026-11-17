import checkRoles from '../functions/checkRoles.js';
import { startPolls } from '../functions/checkPolls.js';
import color from '../functions/colorCodes.js';

export default async (client) => {
  console.log(color('%', `%2[Bot_Ready]%7 :: ${client.user.username} is ready`));

  await checkRoles(client).catch(() => {});
  await startPolls(client).catch(() => {});
};
