import { Sequelize } from "sequelize";

export const sequelize = new Sequelize("postgres", "postgres", "epifan123", {
  define: {
    timestamps: true,
  },
  dialect: "postgres",
  host: "localhost",
  logging: false,
  port: 5432,
});

sequelize
  .authenticate()
  .then(() => {
    console.log("Connection has been established successfully.");
  })
  .catch(err => {
    console.error("Unable to connect to the database:", err);
  });
