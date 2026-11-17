import color from '../functions/colorCodes.js';

export default async (client, error) => {
  console.log(color('%', '%4[Error_Handling]%7 :: Client/Websocket Error%c'));
  console.error(error);
};
