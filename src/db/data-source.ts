import { DataSource } from "typeorm";

import { config } from "../../config";
import { container } from "../core";

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

container.bind("DataSource").toConstantValue(AppDataSource);
