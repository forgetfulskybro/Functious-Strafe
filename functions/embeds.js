import { EmbedBuilder } from '@strafechat/strafe.js';

export const THEME = '#A52F05';
export const ERROR = '#FF0000';
export const ERROR_DELETE_MS = 7000;

export function themeColor(client) {
  return client.config.theme ?? THEME;
}

export function baseEmbed(client, color = themeColor(client)) {
  return new EmbedBuilder().setColor(color);
}

export function infoEmbed(client, description) {
  return baseEmbed(client).setDescription(description);
}

export function successEmbed(client, description) {
  return baseEmbed(client).setDescription(description);
}

export function errorEmbed(client, description) {
  return baseEmbed(client, ERROR).setDescription(description);
}

export function panelEmbed(client, description) {
  return baseEmbed(client).setDescription(description || 'React below to get a role.');
}

export function deleteAfter(message, delay = ERROR_DELETE_MS) {
  if (message?.delete) {
    const timer = setTimeout(() => message.delete().catch(() => {}), delay);
    timer.unref?.();
  }

  return message;
}

export async function replyEmbed(client, message, embed) {
  try {
    return await message.reply({ embeds: [embed] });
  } catch {
    const data = embed?.data ?? {};
    const fields = (data.fields ?? []).map((field) => `**${field.name}**\n${field.value}`).join('\n');
    const text = [data.title, data.description, fields].filter(Boolean).join('\n').slice(0, 4000);
    return message.reply(text || 'Something went wrong.').catch(() => {});
  }
}

export async function replyError(client, message, description) {
  const sent = await replyEmbed(client, message, errorEmbed(client, description));
  return deleteAfter(sent);
}
