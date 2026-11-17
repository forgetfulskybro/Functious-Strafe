import { PermissionFlagsBits } from '@strafechat/strafe.js';
import getRoles from '../functions/getRoles.js';
import { baseEmbed, replyEmbed, replyError } from '../functions/embeds.js';
import { prefixFor } from '../functions/prefix.js';

function helpEmbed(client, prefix) {
  return baseEmbed(client)
    .setTitle('Viewing Autoroles Help')
    .setDescription(
      '**Explanation**\nThis is a help menu to show all available sub-commands this command has. Use these to setup autoroles in your community.\n\n' +
        '**View**\nThis sub-command lets you view all your autorole settings.\n\n' +
        '**Join Roles**\nThis sub-command setups join roles where it adds roles to users when they join.\n\n' +
        `\`${prefix}autoroles view\`\n\n` +
        `\`${prefix}autoroles join add [role names, e.g. Member, Bot Updates]\`\n` +
        `\`${prefix}autoroles join remove [role names, e.g. Member, Bot Updates]\``,
    );
}

function viewEmbed(client, db) {
  const joinRoles = Array.isArray(db.joinRoles) ? db.joinRoles : [];

  return baseEmbed(client)
    .setTitle('Viewing Autoroles')
    .setDescription(
      `**Join Roles**: ${
        joinRoles.length > 0
          ? `\n${joinRoles.map((roleId) => `<@&${roleId}>`).join(', ')}`
          : 'None'
      }`,
    );
}

function roleList(roleOptions) {
  return roleOptions
    .join(' ')
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);
}

async function requireManageSpace(client, message) {
  if (!message.inSpace?.()) {
    await replyError(client, message, 'This command only works inside a space room.');
    return false;
  }

  const member =
    message.member ??
    (await message.space.members.fetch(message.author.id).catch(() => null));

  if (!member?.permissions.has(PermissionFlagsBits.ManageSpace)) {
    await replyError(client, message, 'You need the **Manage Space** permission to manage autoroles.');
    return false;
  }

  return true;
}

export default {
  config: {
    name: 'autoroles',
    description: 'Set roles that are given when members join.',
    usage: 'help',
    cooldown: 2000,
    available: true,
    permissions: {
      name: 'Manage Space',
      bitField: PermissionFlagsBits.ManageSpace,
    },
    aliases: ['autorole', 'ar'],
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

    const prefix = prefixFor(client, db);
    const sub = (args[0] ?? 'help').toLowerCase();

    switch (sub) {
      case 'view':
        return replyEmbed(client, message, viewEmbed(client, db));

      case 'join': {
        const action = args[1]?.toLowerCase();
        const roleOptions = roleList(args.slice(2));

        if (action === 'add') {
          if (!roleOptions[0]) {
            return replyError(
              client,
              message,
              `Provide role names to be added to autoroles.\nExample: \`${prefix}autoroles join add Member, Color Roles\``,
            );
          }

          const resolved = await getRoles(roleOptions, message, client, prefix);
          if (!resolved) return;

          const existing = Array.isArray(db.joinRoles) ? db.joinRoles : [];
          if (resolved.roles.length > 20 || resolved.roles.length + existing.length > 20) {
            return replyError(
              client,
              message,
              'You provided too many roles. Join roles can only have a maximum of 20 roles in total.',
            );
          }

          const duplicates = resolved.roles.filter((role) => existing.includes(role.id));
          const additions = resolved.roles.filter((role) => !existing.includes(role.id));
          const newRoles = existing.concat(additions.map((role) => role.id));

          if (additions.length === 0 && duplicates.length > 0) {
            return replyError(
              client,
              message,
              `All of the roles you provided are duplicates, please provide new roles.\nRoles: ${duplicates
                .map((role) => `<@&${role.id}>`)
                .join(', ')}`,
            );
          }

          await client.database.updateGuild(message.spaceId, { joinRoles: newRoles });

          const added = additions.map((role) => `<@&${role.id}>`).join(', ');
          const duplicateText =
            additions.length > 0 && duplicates.length > 0
              ? `\n\nDuplicate join roles you provided: ${duplicates
                  .map((role) => `<@&${role.id}>`)
                  .join(', ')}`
              : '';

          return replyEmbed(
            client,
            message,
            baseEmbed(client).setDescription(
              `Successfully added autoroles when users join.\nRoles: ${added}${duplicateText}`,
            ),
          );
        }

        if (action === 'remove') {
          if (!roleOptions[0]) {
            return replyError(
              client,
              message,
              `Provide role names to be removed from autoroles.\nExample: \`${prefix}autoroles join remove Member, Color Roles\``,
            );
          }

          const resolved = await getRoles(roleOptions, message, client, prefix);
          if (!resolved) return;

          const existing = Array.isArray(db.joinRoles) ? db.joinRoles : [];
          const resolvedIds = resolved.roles.map((role) => role.id);
          const errored = resolved.roles.filter((role) => !existing.includes(role.id));
          const remaining = existing.filter((roleId) => !resolvedIds.includes(roleId));

          if (remaining.length === existing.length && errored.length > 0) {
            return replyError(
              client,
              message,
              `None of the roles you provided are join roles, please provide join roles.\nRoles: ${errored
                .map((role) => `<@&${role.id}>`)
                .join(', ')}`,
            );
          }

          await client.database.updateGuild(message.spaceId, { joinRoles: remaining });

          const removed = resolved.roles
            .filter((role) => existing.includes(role.id))
            .map((role) => `<@&${role.id}>`)
            .join(', ');
          const erroredText =
            errored.length > 0
              ? `\n\nErrored join roles you provided: ${errored
                  .map((role) => `<@&${role.id}>`)
                  .join(', ')}`
              : '';

          return replyEmbed(
            client,
            message,
            baseEmbed(client).setDescription(
              `Successfully removed autoroles when users join.\nRoles: ${removed}${erroredText}`,
            ),
          );
        }

        return replyError(
          client,
          message,
          `Provide role names to be added to autoroles.\nExample: \`${prefix}autoroles join add Member, Color Roles\``,
        );
      }

      case 'help':
      default:
        return replyEmbed(client, message, helpEmbed(client, prefix));
    }
  },
};
