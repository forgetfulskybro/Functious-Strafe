import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import color from '../functions/colorCodes.js';

export default async (client) => {
  const dir = fileURLToPath(new URL('../functions', import.meta.url));
  const functions = readdirSync(dir).filter((file) => file.endsWith('.js'));

  for (const file of functions) {
    const fn = (await import(`../functions/${file}`)).default;
    client.functions.set(file.split('.')[0], fn);
  }

  console.log(color('%', `%b[Function_Handler]%7 :: Loaded %e${client.functions.size} %7functions`));
};
