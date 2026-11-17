import color from '../functions/colorCodes.js';

export default async (client, message) => {
  console.log(color('%', `%e[Gateway]%7 :: ${message}`));
};
