import color from '../functions/colorCodes.js';

export default async (client) => {
  console.log(color('%', '%e[Gateway]%7 :: Connection dropped, reconnecting'));
};
