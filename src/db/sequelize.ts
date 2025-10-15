import { Sequelize } from "sequelize";

import { config } from "../../config";

const {
  POSTGRES_DB,
  POSTGRES_HOST,
  POSTGRES_PORT,
  POSTGRES_USER,
  POSTGRES_PASSWORD,
} = config;

export const sequelize = new Sequelize(
  POSTGRES_DB,
  POSTGRES_USER,
  POSTGRES_PASSWORD,
  {
    define: {
      timestamps: true,
    },
    dialect: "postgres",
    host: POSTGRES_HOST,
    logging: false,
    port: POSTGRES_PORT,
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
