import { PermissionFlagsBits } from '@strafechat/strafe.js';
import Polls, { collectTooMuch } from '../functions/poll.js';
import dhms from '../functions/dhms.js';
import PollDB from '../models/polls.js';
import { handleNew, handleDelete, endPollEarly } from '../functions/checkPolls.js';
import Paginator from '../functions/pagination.js';
import { baseEmbed, replyEmbed, replyError } from '../functions/embeds.js';
import { prefixFor } from '../functions/prefix.js';
import { resolveRoom } from '../functions/reply.js';

async function canManagePolls(client, message, db) {
  if (!message.inSpace?.()) {
    await replyError(client, message, 'This command only works inside a space room.');
    return false;
  }

  if (client.config.owners?.includes(message.author.id)) return true;

  const member =
    message.member ??
    (await message.space.members.fetch(message.author.id).catch(() => null));
  if (!member) return false;

  if (member.permissions.has(PermissionFlagsBits.ManageSpace)) return true;

  const bypasses = [];
  for (const entry of Array.isArray(db.bypassRoles) ? db.bypassRoles : []) {
    if (entry?.role && member.roles.cache.has(entry.role)) {
      bypasses.push(...(entry.commands ?? []));
    }
  }

  if (bypasses.includes('all') || bypasses.includes('polls')) return true;

  await replyError(client, message, 'You need the **Manage Space** permission to manage polls.');
  return false;
}

function helpText(client, prefix) {
  const numbers = [
    client.config.emojis?.one,
    client.config.emojis?.two,
    client.config.emojis?.three,
  ]
    .filter(Boolean)
    .join(' ');

  return [
    '**Usage**',
    `\`${prefix}poll <time> | <question> | <option> | <option>\``,
    'Time accepts `s`, `m`, `h` and `d` (for example `5m` or `1h 30m`), from 30 seconds to 30 days. Polls need at least 2 and at most 10 options, separated by `|`.',
    '',
    '**Thread mode**',
    `\`${prefix}poll thread <time> | <question> | <option> | <option>\``,
    'Posts the poll in the room and opens a discussion thread on it.',
    '',
    '**Other**',
    `\`${prefix}poll view\` - Lists the polls you currently have running.`,
    `\`${prefix}poll delete <number>\` - Ends one of your polls early.`,
    `\`${prefix}poll toggle\` - Requires **Manage Space** before anyone can create a poll.`,
    '',
    `Vote with ${numbers || 'the number emojis'}, up to 10 options. Reactions have a 3 second cooldown, and the poll owner can end the poll early with ${client.config.emojis?.stop ?? 'the stop emoji'}.`,
  ].join('\n');
}

function helpEmbed(client, prefix) {
  return baseEmbed(client).setTitle('Polls').setDescription(helpText(client, prefix));
}

export default {
  config: {
    name: 'polls',
    description: 'Creates a poll. Reactions have 3 second cooldown.',
    usage: '[time] | [question] | [option 1] | [option 2] | [options 3-10 (optional)]',
    help: (client, prefix) => helpText(client, prefix),
    cooldown: 7000,
    available: true,
    aliases: ['poll'],
  },
  run: async (client, message, args, db) => {
    db ??=
      message.spaceId
        ? await client.database.getGuild(message.spaceId).catch(() => null)
        : null;

    if (!db) {
      return replyError(client, message, 'I could not load the settings for this space.');
    }

    const prefix = prefixFor(client, db);
    const subcommand = args[0]?.toLowerCase();

    if (subcommand === 'help') {
      return replyEmbed(client, message, helpEmbed(client, prefix));
    }

    const threadMode = subcommand === 'thread';
    const pollArgs = threadMode ? args.slice(1) : args;

    if (subcommand === 'view') {
      const polls = await PollDB.find({ owner: message.author.id, ended: false }).sort({
        now: 1,
      });

      if (polls.length === 0) {
        return replyError(client, message, 'You have no polls to view.');
      }

      const chunkSize = 3;
      const chunks = [];
      for (let i = 0; i < polls.length; i += chunkSize) {
        chunks.push(polls.slice(i, i + chunkSize));
      }

      const embeds = [];
      for (const [pageIndex, chunk] of chunks.entries()) {
        const embed = baseEmbed(client).setTitle('Polls');

        for (const [index, poll] of chunk.entries()) {
          const room = await resolveRoom(client, poll.channelId).catch(() => null);
          const jump = room?.url ? `[msg](${room.url})` : `<#${poll.channelId}>`;

          embed.addFields({
            name: `#${pageIndex * chunkSize + index + 1}: ${(poll.desc ?? 'Poll').slice(0, 75)}`,
            value: `Message: ${jump}`,
            inline: false,
          });
        }

        embeds.push(embed);
      }

      if (embeds.length === 1) {
        return replyEmbed(client, message, embeds[0]);
      }

      const paginator = new Paginator({
        user: message.author.id,
        client,
        timeout: 60000,
      });

      embeds.forEach((embed) => paginator.add(embed));
      return paginator.start(message.roomId);
    }

    if (subcommand === 'toggle') {
      if (!(await canManagePolls(client, message, db))) return;

      const toggle = db.pollPerm;
      await client.database.updateGuild(message.spaceId, { pollPerm: !toggle });

      return replyEmbed(
        client,
        message,
        baseEmbed(client).setDescription(
          `Poll permission lock ([Manage Space]) is now **${toggle ? 'Off' : 'On'}**`,
        ),
      );
    }

    if (subcommand === 'delete') {
      const pollNumber = parseInt(args[1], 10);
      if (!pollNumber || Number.isNaN(pollNumber) || pollNumber < 1) {
        return replyError(
          client,
          message,
          `Please provide a valid poll number.\nExample: \`${prefix}poll delete 1\``,
        );
      }

      const polls = await PollDB.find({ owner: message.author.id, ended: false }).sort({
        now: 1,
      });
      const poll = polls[pollNumber - 1];

      if (!poll) {
        return replyError(
          client,
          message,
          `Poll #${pollNumber} not found or already ended.`,
        );
      }

      handleDelete(poll.messageId);
      await endPollEarly(client, poll);

      return replyEmbed(
        client,
        message,
        baseEmbed(client).setDescription(`Poll #${pollNumber} has been ended early.`),
      );
    }

    if (db.pollPerm && !(await canManagePolls(client, message, db))) return;

    const check = await PollDB.find({ owner: message.author.id, ended: false });
    if (check.length >= 5) {
      return replyError(
        client,
        message,
        'You already have 5 polls running. Wait for one to end before creating anymore.',
      );
    }

    const options = pollArgs
      .join(' ')
      .split('|')
      .map((x) => x.trim())
      .filter((x) => x);

    if (!options[0]) {
      return replyError(
        client,
        message,
        `Please provide a valid time.\nExample: \`${prefix}polls 5m | How are you? | Good | Bad\``,
      );
    }

    const time = dhms(options[0]);
    if (!time || time === 0) {
      return replyError(
        client,
        message,
        `Please provide a valid time.\nExample: \`${prefix}polls 5m | How are you? | Good | Bad\``,
      );
    }

    if (time < 30000) {
      return replyError(
        client,
        message,
        `Please provide a time longer than 30 seconds.\nExample: \`${prefix}polls 5m | How are you? | Good | Bad\``,
      );
    }

    if (time > 2592000000) {
      return replyError(
        client,
        message,
        `Please provide a time shorter than 30 days.\nExample: \`${prefix}polls 5m | How are you? | Good | Bad\``,
      );
    }

    if (!options[1]) {
      return replyError(
        client,
        message,
        `Please provide a question.\nExample: \`${prefix}polls 5m | How are you? | Good | Bad\``,
      );
    }

    if (!options[2]) {
      return replyError(
        client,
        message,
        `Please provide the first option for the question. Maximum of 10 options.\nExample: \`${prefix}polls 5m | How are you? | Good | Bad\``,
      );
    }

    if (!options[3]) {
      return replyError(
        client,
        message,
        `Please provide the second option for the question. Maximum of 10 options.\nExample: \`${prefix}polls 5m | How are you? | Good | Bad\``,
      );
    }

    if (options.length >= 13) {
      return replyError(
        client,
        message,
        `Please provide a maximum of 10 options.\nExample: \`${prefix}polls 5m | How are you? | Good | Bad\``,
      );
    }

    const names = [
      options[2],
      options[3],
      options[4] ? options[4] : null,
      options[5] ? options[5] : null,
      options[6] ? options[6] : null,
      options[7] ? options[7] : null,
      options[8] ? options[8] : null,
      options[9] ? options[9] : null,
      options[10] ? options[10] : null,
      options[11] ? options[11] : null,
    ];

    const reactions = [
      client.config.emojis.one,
      client.config.emojis.two,
      options[4] ? client.config.emojis.three : null,
      options[5] ? client.config.emojis.four : null,
      options[6] ? client.config.emojis.five : null,
      options[7] ? client.config.emojis.six : null,
      options[8] ? client.config.emojis.seven : null,
      options[9] ? client.config.emojis.eight : null,
      options[10] ? client.config.emojis.nine : null,
      options[11] ? client.config.emojis.ten : null,
      client.config.emojis.stop,
    ];

    const poll = new Polls({
      time,
      client,
      name: {
        name: 'Polls',
        description: options[1],
      },
      options: { name: names.filter((a) => a) },
      owner: message.author.id,
      lang: db.language,
    });
    await poll.update();

    const tooMuch = collectTooMuch(poll);

    const loading = await message.room.send({
      embeds: [baseEmbed(client).setDescription('Loading poll...')],
    });

    for (const reaction of reactions.filter((e) => e)) {
      await loading.react(reaction).catch(() => {});
    }

    const pollData = await poll.start(loading, poll, { tooMuch });
    if (pollData) handleNew(pollData);

    if (threadMode) {
      await loading.startThread({ name: options[1].slice(0, 100) }).catch(() => {});
    }

    await message.delete().catch(() => {});
  },
};
