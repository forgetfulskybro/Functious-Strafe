import mongoose from 'mongoose';

export default async function pings(client) {
  const start = Date.now();
  let databasePing = null;

  try {
    if (mongoose.connection.db) {
      await mongoose.connection.db.admin().ping();
      databasePing = Date.now() - start;
    }
  } catch {
    databasePing = null;
  }

  return {
    gatewayPing: typeof client.ws?.ping === 'number' ? client.ws.ping : -1,
    databasePing,
  };
}
