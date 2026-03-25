import { DataSource } from "typeorm";

import { config, isProduction } from "../../config";

const { host, port, database, username, password, ssl, poolMax } =
  config.database.postgres;

export const TypeOrmDataSource = new DataSource({
  type: "postgres",
  host,
  port,
  database,
  username,
  password,
  synchronize: !isProduction,
  migrations: ["src/migrations/*.ts"],
  entities: [__dirname + "/../../modules/**/*.entity{.ts,.js}"],
  subscribers: [],
  ssl: ssl ? { rejectUnauthorized: false } : false,
  extra: {
    max: poolMax,
    idleTimeoutMillis: 30000,
  },
});
