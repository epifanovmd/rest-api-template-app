import { Sequelize } from "sequelize";

import { config } from "../../config";

const {
  POSTGRES_DATABASE,
  POSTGRES_HOST,
  POSTGRES_PORT,
  POSTGRES_USER,
  POSTGRES_PASSWORD,
} = config;

console.log("POSTGRES_HOST", POSTGRES_HOST);
console.log("POSTGRES_PORT", POSTGRES_PORT);
console.log("POSTGRES_USER", POSTGRES_USER);
console.log("POSTGRES_PASSWORD", POSTGRES_PASSWORD);

export const sequelize = new Sequelize(
  POSTGRES_DATABASE,
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
    console.log("Connection has been established successfully.");
  })
  .catch(err => {
    console.error("Unable to connect to the database:", err);
  });
