import { iocContainer } from "@force-dev/utils";
import { DataSource } from "typeorm";

import { config } from "../../../config";

export const AppDataSource = new DataSource({
  type: "postgres",
  ...config.database.postgres,
  database: "test-test",
  synchronize: process.env.NODE_ENV !== "production",
  // logging: process.env.NODE_ENV === "development",
  migrations: ["src/migrations/*.ts"],
  entities: [__dirname + "/../modules/**/*.entity{.ts,.js}"],
  subscribers: [],
});

iocContainer.bind("DataSource").toConstantValue(AppDataSource);
