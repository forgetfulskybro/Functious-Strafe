import { createRequire } from 'node:module';
import { baseEmbed, replyEmbed } from '../functions/embeds.js';
import pings from '../functions/pings.js';

const require = createRequire(import.meta.url);
const { dependencies } = require('../package.json');

function formatUptime(milliseconds) {
  let totalSeconds = milliseconds / 1000;
  const years = Math.floor(totalSeconds / 31536000);
  totalSeconds %= 31536000;
  const days = Math.floor(totalSeconds / 86400);
  totalSeconds %= 86400;
  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds %= 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const parts = [];
  if (years) parts.push(`${years}y`);
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(', ');
}

export default {
  config: {
    name: 'info',
    description: 'Stats on the bot.',
    usage: false,
    cooldown: 15000,
    available: true,
    permissions: {},
    aliases: ['stats', 'botinfo', 'bi'],
  },
  run: async (client, message) => {
    const { gatewayPing, databasePing } = await pings(client);
    const uptime = formatUptime(Math.floor(process.uptime() * 1000));
    const memory = Number((process.memoryUsage().heapUsed / 1048576).toFixed(2));
    const gateway = gatewayPing >= 0 ? `${Math.round(gatewayPing)}ms` : 'unavailable';
    const database = databasePing === null ? 'unavailable' : `${databasePing}ms`;
    const communities = client.spaces.cache.size;
    const library = dependencies['@strafechat/strafe.js'] ?? 'unknown';

    const embed = baseEmbed(client)
      .setAuthor({ name: 'Information' })
      .addFields(
        {
          name: '**Statistics**',
          value: [
            `> **Spaces**: \`${communities.toLocaleString()}\``,
            `> **Library**: [Strafe.js](https://strafe.js.org) \`${library}\``,
          ].join('\n'),
          inline: true,
        },
        {
          name: '**System**',
          value: [
            `> **Uptime**: \`${uptime}\``,
            `> **Ping**: \`${gateway}\``,
            `> **Memory**: \`${memory} MB\``,
            `> **Database**: \`${database}\``,
            `> **Node.js**: \`${process.version}\``,
          ].join('\n'),
          inline: true,
        },
      )
      .addFields({
        name: '**Links**',
        value: [
          '[GitHub](https://github.com/forgetfulskybro/functious-strafe)',
          '[Ko-Fi](https://ko-fi.com/forgetfulskybro)',
        ].join(' • '),
        inline: false,
      });

    return replyEmbed(client, message, embed);
  },
};
