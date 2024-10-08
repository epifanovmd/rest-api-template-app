import { createClient } from "redis";

import { config } from "../../config";

const { REDIS_HOST, REDIS_PORT, REDIS_PASS } = config;

export const redisClient = createClient({
  password: REDIS_PASS,
  url: `redis://localhost:${REDIS_PORT}`,
});

//
// redisClient.on("connect", () => {
//   console.log("Redis connection has been established successfully.");
// });
//
// redisClient.connect().catch(err => {
//   console.log("ERROR CONNECT REDIS", err);
// });
