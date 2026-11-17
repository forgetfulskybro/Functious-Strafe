import collectorHandler from '../reactionHandlers/collector.js';
import editCollectorHandler from '../reactionHandlers/editCollector.js';
import roleReaction from '../reactionHandlers/roleReaction.js';
import pollHandler from '../reactionHandlers/poll.js';

export default async (client, reaction, user) => {
  if (!reaction || !user) return;
  if (user.bot || user.id === client.user?.id) return;

  if (client.messageCollector.has(user.id)) {
    const handled = await collectorHandler(client, reaction, user, 'remove').catch(() => false);
    if (handled) return;
  }

  if (client.messageEdit.has(user.id)) {
    const handled = await editCollectorHandler(client, reaction, user, 'remove').catch(() => false);
    if (handled) return;
  }

  const pollCheck = client.polls.get(String(reaction.message?.id));
  if (pollCheck) {
    await pollHandler(client, reaction, user, pollCheck, 'remove').catch(() => {});
    return;
  }

  await roleReaction(client, reaction, user, 'remove').catch(() => {});

  const collectors = client.reactionCollectors.get(String(reaction.message.id));
  if (collectors) for (const collector of [...collectors]) collector.handle('MESSAGE_REACTION_REMOVE', reaction, user);
};
