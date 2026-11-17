import 'dotenv/config';
import { Client, Collection } from '@strafechat/strafe.js';
import ReactionCollector from './functions/reactionCollector.js';
import DatabaseHandler from './handlers/database.js';
import config from './config.js';
import color from './functions/colorCodes.js';

const client = new Client({
  instance: process.env.STRAFE_INSTANCE || 'app.strafe.chat',
  presence: { status: 'online', customStatus: 'Looking for f!help' },
});

client.config = config;
client.database = new DatabaseHandler(process.env.MONGODB);
client.database.connectToDatabase();
client.database.cacheSweeper(client);
client.database.guildSweeper(client);
client.createReactionCollector = (options) => new ReactionCollector(client, options);

['used', 'timeout', 'messageCollector', 'messageEdit', 'reactions', 'paginate'].forEach((x) => (client[x] = new Map()));
['aliases', 'commands', 'event', 'functions', 'reactionCollectors'].forEach((x) => (client[x] = new Collection()));

for (const handler of ['command', 'event', 'function']) {
  const mod = await import(`./handlers/${handler}.js`);
  await mod.default(client);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    client
      .destroy()
      .catch(() => {})
      .finally(() => process.exit(0));
  });
}

process.on('unhandledRejection', (reason) => {
  console.log(color('%', '%4[Error_Handling]%7 :: Unhandled Rejection/Catch%c'));
  console.log(reason);
});
process.on('uncaughtException', (err) => {
  console.log(color('%', '%4[Error_Handling]%7 :: Uncaught Exception/Catch%c'));
  console.log(err);
});
process.on('uncaughtExceptionMonitor', (err) => {
  console.log(color('%', '%4[Error_Handling]%7 :: Uncaught Exception/Catch (MONITOR)%c'));
  console.log(err);
});

await client.login(process.env.TOKEN);
