import { injectable as Injectable } from "inversify";
import { createClient } from "redis";

import { ApiError } from "../../common";

const rediscl = createClient({
  password: "redisPass",
  url: "redis://redis:6379",
});

rediscl.connect().catch(err => {
  console.log("EROR CONNECT REDIS", err);
});

rediscl.on("connect", () => {
  console.log("Redis connected.");
});

@Injectable()
export class RedisService {
  async set<Data>(key: string, data: Data) {
    const status = await rediscl.set(key, JSON.stringify(data));

    await rediscl.persist(key);

    if (status === "OK") {
      return data;
    }

    throw new ApiError("Ошибка записи в базу данных", 500);
  }

  async get<Data>(key: string) {
    const data = await rediscl.get(key);

    if (data) {
      return JSON.parse(data) as Data;
    } else {
      return null;
    }
  }

  delete(key: string) {
    return rediscl.del(key);
  }
}
