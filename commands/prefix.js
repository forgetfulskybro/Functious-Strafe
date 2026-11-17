import { PermissionFlagsBits } from '@strafechat/strafe.js';
import { baseEmbed, replyEmbed, replyError } from '../functions/embeds.js';
import { prefixFor } from '../functions/prefix.js';

async function requireManageSpace(client, message) {
  if (!message.inSpace?.()) {
    await replyError(client, message, 'This command only works inside a space room.');
    return false;
  }

  const member =
    message.member ??
    (await message.space.members.fetch(message.author.id).catch(() => null));

  if (!member?.permissions.has(PermissionFlagsBits.ManageSpace)) {
    await replyError(client, message, 'You need the **Manage Space** permission to change the prefix.');
    return false;
  }

  return true;
}

export default {
  config: {
    name: 'prefix',
    description: 'Change the prefix used for commands in this space.',
    usage: 'change <text>',
    cooldown: 3000,
    available: true,
    permissions: {
      name: 'Manage Space',
      bitField: PermissionFlagsBits.ManageSpace,
    },
    aliases: [],
  },
  run: async (client, message, args, db) => {
    db ??=
      message.spaceId
        ? await client.database.getGuild(message.spaceId).catch(() => null)
        : null;

    if (!db) {
      return replyError(client, message, 'I could not load the settings for this space.');
    }

    if (!(await requireManageSpace(client, message))) return;

    const current = prefixFor(client, db);
    const embed = baseEmbed(client).setDescription(
      `Prefix: \`${current}\`\n\nTo change the prefix, use\n\`${current}prefix change <new prefix>\` | \`${current}prefix set <new prefix>\``,
    );

    const option = args[0]?.toLowerCase();
    const next = args[1];

    if (!option || !['set', 'change'].includes(option) || !next || next === current) {
      return replyEmbed(client, message, embed);
    }

    if (next.length > 8) {
      return replyError(client, message, 'Prefix cannot be longer than 8 characters.');
    }

    await client.database.updateGuild(message.spaceId, { prefix: next });

    return replyEmbed(
      client,
      message,
      baseEmbed(client).setDescription(`Prefix successfully changed to \`${next}\``),
    );
  },
};
