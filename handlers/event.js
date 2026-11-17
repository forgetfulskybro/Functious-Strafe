import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import color from '../functions/colorCodes.js';

export default async (client) => {
  const dir = fileURLToPath(new URL('../events', import.meta.url));
  const events = readdirSync(dir).filter((file) => file.endsWith('.js'));

  for (const file of events) {
    const name = file.split('.')[0];
    const evt = (await import(`../events/${file}`)).default;
    client.event.set(name, evt.bind(null, client));
    client.on(name, evt.bind(null, client));
  }

  console.log(color('%', `%b[Event_Handler]%7 :: Loaded %e${client.event.size} %7events`));
};
