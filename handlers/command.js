import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import color from '../functions/colorCodes.js';

export default async (client) => {
  const dir = fileURLToPath(new URL('../commands', import.meta.url));
  const commands = readdirSync(dir).filter((file) => file.endsWith('.js'));

  for (const file of commands) {
    const pull = (await import(`../commands/${file}`)).default;
    client.commands.set(pull.config.name, pull);
    if (pull.config.aliases) pull.config.aliases.forEach((alias) => client.aliases.set(alias, pull.config.name));
  }

  console.log(color('%', `%b[Command_Handler]%7 :: Loaded %e${client.commands.size} %7commands`));
};
