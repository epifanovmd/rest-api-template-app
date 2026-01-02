import "reflect-metadata";

import dotenv from "dotenv";

import { App } from "./app";

dotenv.config({
  path: [`.env.${process.env.NODE_ENV || "development"}`, ".env"],
});

const bootstrap = async () => {
  try {
    const app = new App();

    await app.start();
  } catch (error) {
    console.error("Failed to start application:", error);
    process.exit(1);
  }
};

bootstrap().then();
