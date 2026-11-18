import { baseEmbed, replyEmbed } from '../functions/embeds.js';
import { prefixFor } from '../functions/prefix.js';

export default {
  config: {
    name: 'help',
    description: 'List every command, or show details for one command.',
    usage: '[command]',
    cooldown: 3000,
    available: true,
    aliases: ['h', 'commands'],
  },
  run: async (client, message, args, db) => {
    const prefix = prefixFor(client, db);
    const requested = args[0]?.toLowerCase();
    const isOwner = client.config.owners?.includes(message.author.id);
    const visible = (entry) =>
      entry.config.available !== false && (entry.config.available !== 'Owner' || isOwner);
    const commands = client.commands.filter(visible);
    const listed = commands.filter((entry) => entry.config.available !== 'Owner');
    const command = requested
      ? client.commands.get(requested) ||
        [...commands.values()].find((entry) => entry.config.aliases?.includes(requested))
      : null;

    if (command && visible(command)) {
      const usage = typeof command.config.usage === 'string' ? command.config.usage : '';

      const embed = baseEmbed(client)
        .setTitle(`Command: ${command.config.name}`)
        .setDescription(command.config.description ?? 'No description.')
        .addFields(
          {
            name: 'Availability',
            value: command.config.available === 'Owner' ? 'Owner' : 'Available',
            inline: true,
          },
          { name: 'Cooldown', value: `${(command.config.cooldown ?? 0) / 1000}s`, inline: true },
          {
            name: 'Permissions',
            value: command.config.permissions?.name ?? 'None',
            inline: true,
          },
        );

      if (command.config.aliases?.length) {
        embed.addFields({
          name: 'Aliases',
          value: command.config.aliases.map((alias) => `\`${alias}\``).join(', '),
          inline: false,
        });
      }

      const guide =
        typeof command.config.help === 'function'
          ? command.config.help(client, prefix)
          : null;

      embed.addFields({
        name: guide ? 'Usage & Subcommands' : 'Usage',
        value: guide
          ? String(guide).slice(0, 1024)
          : `\`\`\`\n${prefix}${command.config.name} ${usage}\n\`\`\``,
        inline: false,
      });

      return replyEmbed(client, message, embed);
    }

    const names = [...listed.values()]
      .map((entry) => `\`${entry.config.name}\``)
      .join(', ');

    const sections = [`Available Commands\n${names}`];
    sections.push(`To get more information about a command, type \`${prefix}help [command]\``);

    return replyEmbed(client, message, baseEmbed(client).setDescription(sections.join('\n\n')));
  },
};
