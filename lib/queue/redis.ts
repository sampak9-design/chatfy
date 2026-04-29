import IORedis from "ioredis";

let connection: IORedis | null = null;

export function getRedis(): IORedis {
  if (connection) return connection;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL not set");
  connection = new IORedis(url, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
  });
  return connection;
}
