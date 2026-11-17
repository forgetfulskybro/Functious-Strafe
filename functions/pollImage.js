import { Routes, resolveFile } from '@strafechat/strafe.js';

/**
 * Uploads a rendered poll image to the room's own attachment storage and returns the
 * uploaded attachment (`{ id, url, ... }`). This replaces the old CDN upload: the image
 * lives on the Strafe instance, and the embed points at it with setImage.
 */
export async function uploadPollImage(client, roomId, buffer, name = 'Poll.png') {
  const resolved = await resolveFile(buffer, name, client.rest.options.makeRequest);
  const file = { name: resolved.name, data: resolved.data, key: 'file' };
  if (resolved.contentType !== undefined) file.contentType = resolved.contentType;

  return client.rest.post(Routes.roomAttachments(roomId), { files: [file] });
}
