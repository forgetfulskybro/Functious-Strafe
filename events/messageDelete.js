import PollDB from '../models/polls.js';
import { handleDelete } from '../functions/checkPolls.js';

export default async (client, message) => {
  const messageId = message?.id;
  if (!messageId || !client.polls?.has(messageId)) return;

  handleDelete(messageId);
  client.polls.delete(messageId);

  await PollDB.findOneAndUpdate({ messageId }, { ended: true }).catch(() => {});
};
