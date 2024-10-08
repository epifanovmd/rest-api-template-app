import { injectable } from "inversify";

import { InternalServerErrorException } from "../../common";
import { redisClient } from "../../db";

@injectable()
export class RedisService {
  async set<Data>(key: string, data: Data) {
    const status = await redisClient.set(key, JSON.stringify(data));

    await redisClient.persist(key);

    if (status === "OK") {
      return data;
    }

    throw new InternalServerErrorException("Ошибка записи в Redis");
  }

  async get<Data>(key: string) {
    const data = await redisClient.get(key);

    if (data) {
      return JSON.parse(data) as Data;
    } else {
      return null;
    }
  }

  delete(key: string) {
    return redisClient.del(key);
  }
}
