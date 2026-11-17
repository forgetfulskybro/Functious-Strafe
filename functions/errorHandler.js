import { EmbedBuilder } from '@strafechat/strafe.js';

const ERROR_FOOTER = 'Please report this issue to the bot owner.';

export const DEFAULT_CONFIG = {
  command: {
    title: 'Command Error',
    permissionTitle: 'Permission Error',
    defaultDescription: 'An unexpected error occurred while running this command.',
    permissionFooter: 'Please contact a space admin to resolve this issue.',
    errorFooter: ERROR_FOOTER,
    rateLimitDescription: 'The bot is currently being **Rate Limited**. Please try again in a moment.',
    plainTextFormat:
      '**{title}**\n{description}\n\n**What happened?**\n```{error}```\n\n{footer}',
  },
  event: {
    title: 'Event Error',
    permissionTitle: 'Permission Error',
    defaultDescription: 'An unexpected error occurred while processing this event.',
    permissionFooter: 'Please contact a space admin to resolve this issue.',
    errorFooter: ERROR_FOOTER,
    silent: true,
  },
  function: {
    title: 'Function Error',
    permissionTitle: 'Permission Error',
    defaultDescription: 'An unexpected error occurred while executing a function.',
    permissionFooter: 'Please contact a space admin to resolve this issue.',
    errorFooter: ERROR_FOOTER,
    silent: true,
  },
};

const PERMISSION_MAP = {
  'Message.send': 'Send Messages',
  'TextChannel.send': 'Send Messages',
  '_Message._send': 'Send Messages',
  sendPrepared: 'Send Messages',
  sendMessage: 'Send Messages',
  'VoiceChannel.edit': 'Edit Channels',
  'Guild.createChannel': 'Create Channels',
  '_GuildMember.move': 'Move Members',
};

export function analyzeError(error) {
  const errorMessage = error?.stack || String(error);
  let isPermissionIssue = false;
  let description = null;

  if (errorMessage.includes('permissions required') || errorMessage.includes('Missing Permissions')) {
    isPermissionIssue = true;

    for (const [pattern, permission] of Object.entries(PERMISSION_MAP)) {
      if (errorMessage.includes(pattern)) {
        if (pattern === '_GuildMember.move') {
          description = `The bot errored trying to **${permission}**. This usually happens when the bot tries to move the owner of the space.`;
        } else {
          description = `The bot is missing permission to **${permission}**.`;
        }
        break;
      }
    }
  } else if (errorMessage.includes('rate limited') || errorMessage.includes('RateLimit')) {
    description = 'The bot is currently being **Rate Limited**. Please try again in a moment.';
  }

  return { isPermissionIssue, description, errorMessage };
}

export function createErrorEmbed(options) {
  const { type = 'command', error, config = {} } = options;
  const typeConfig = { ...DEFAULT_CONFIG[type], ...config };
  const { isPermissionIssue, description, errorMessage } = analyzeError(error);

  const embed = new EmbedBuilder()
    .setColor(typeConfig.color || '#FF0000')
    .setTitle(isPermissionIssue ? typeConfig.permissionTitle : typeConfig.title)
    .setDescription(description || typeConfig.defaultDescription)
    .addFields({
      name: 'What happened?',
      value: `\`\`\`\n${errorMessage.slice(0, 1000)}\n\`\`\``,
    })
    .setFooter({
      text: isPermissionIssue ? typeConfig.permissionFooter : typeConfig.errorFooter,
    });

  return { embed, isPermissionIssue, errorMessage, typeConfig };
}

async function sendDM(client, userId, payload) {
  if (!client?.users || !userId) return false;

  try {
    const pm = await client.users.createPM(userId);
    await pm.send(payload);
    return true;
  } catch {
    return false;
  }
}

export default async function errorHandler(options) {
  const {
    type = 'command',
    message,
    error,
    config = {},
    sendInChannel = true,
    client = message?.client,
  } = options;

  const typeConfig = { ...DEFAULT_CONFIG[type], ...config };
  const { isPermissionIssue, description, errorMessage } = analyzeError(error);

  const title = isPermissionIssue ? typeConfig.permissionTitle : typeConfig.title;
  const desc = description || typeConfig.defaultDescription;
  const footer = isPermissionIssue ? typeConfig.permissionFooter : typeConfig.errorFooter;

  const embed = new EmbedBuilder()
    .setColor(typeConfig.color || '#FF0000')
    .setTitle(title)
    .setDescription(desc)
    .addFields({
      name: 'What happened?',
      value: `\`\`\`\n${errorMessage.slice(0, 1000)}\n\`\`\``,
    })
    .setFooter({ text: footer });

  if (!sendInChannel && message) {
    await sendDM(client, message.author?.id, { embeds: [embed] });
    return;
  }

  if (config.client && config.userId) {
    await sendDM(config.client, config.userId, { embeds: [embed] });
  }

  if (message) {
    const authorDMed = await sendDM(client, message.author?.id, { embeds: [embed] });

    try {
      if (errorMessage.includes('sendMessage') || errorMessage.includes('embed')) {
        const plainText = typeConfig.plainTextFormat
          ?.replace(/{title}/g, title)
          ?.replace(/{description}/g, desc)
          ?.replace(/{error}/g, errorMessage.slice(0, 500))
          ?.replace(/{footer}/g, footer);

        if (plainText) {
          await message.reply(plainText);
          return;
        }
      }

      await message.reply({ embeds: [embed] });
    } catch {
      if (!authorDMed) await sendDM(client, message.author?.id, { embeds: [embed] });
    }
  }
}
