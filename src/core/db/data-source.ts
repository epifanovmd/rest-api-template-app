import { DataSource } from "typeorm";

import { config } from "../../../config";

export const TypeOrmDataSource = new DataSource({
  type: "postgres",
  ...config.database.postgres,
  synchronize: process.env.NODE_ENV !== "production",
  // logging: process.env.NODE_ENV === "development",
  migrations: ["src/migrations/*.ts"],
  entities: [__dirname + "/../../modules/**/*.entity{.ts,.js}"],
  subscribers: [],
});
