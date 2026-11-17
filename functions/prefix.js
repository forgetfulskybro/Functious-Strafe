export function prefixFor(client, db) {
  return db?.prefix || client.config.prefix;
}
