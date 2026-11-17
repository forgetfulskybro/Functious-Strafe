import { baseEmbed } from '../functions/embeds.js';
import pings from '../functions/pings.js';

export default {
  config: {
    name: 'ping',
    description: 'Check the gateway, database and round-trip latency.',
    usage: false,
    cooldown: 4500,
    available: true,
    aliases: ['p'],
  },
  run: async (client, message) => {
    const start = Date.now();
    const { gatewayPing, databasePing } = await pings(client);

    const gateway = gatewayPing >= 0 ? `${Math.round(gatewayPing)}ms` : '502 bad Gateway';
    const database = databasePing === null ? 'unavailable' : `${databasePing}ms`;
    const title = `${client.user?.username ?? 'Strafe'} Pong`;

    const embed = (roundTrip) =>
      baseEmbed(client)
        .setTitle(title)
        .addFields(
          { name: '**Gateway**', value: `\`${gateway}\``, inline: true },
          { name: '**Database**', value: `\`${database}\``, inline: true },
          { name: '**Round-trip**', value: `\`${roundTrip}\``, inline: true },
        );

    const sent = await message.reply({ embeds: [embed('...')] });

    await sent.edit({ embeds: [embed(`${Date.now() - start}ms`)] });
  },
};
