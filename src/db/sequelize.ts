import { Sequelize } from "sequelize";

import { config } from "../../config";

const {
  database: { postgres },
} = config;

export const sequelize = new Sequelize(
  postgres.database,
  postgres.username,
  postgres.password,
  {
    define: {
      timestamps: true,
    },
    dialect: "postgres",
    host: postgres.host,
    logging: false,
    port: postgres.port,
  },
);

sequelize
  .authenticate()
  .then(() => {
    console.log("Postgres connection has been established successfully.");
  })
  .catch(err => {
    console.error("Unable to connect to the database:", err);
  });
