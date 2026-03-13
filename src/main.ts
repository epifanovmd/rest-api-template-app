import "reflect-metadata";

import dotenv from "dotenv";

import { App } from "./app";

dotenv.config({
  path: [`.env.${process.env.NODE_ENV || "development"}`, ".env"],
});

const bootstrap = async () => {
  const app = new App();

  await app.start();

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down gracefully...`);
    try {
      await app.stop();
      console.log("Server closed.");
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

bootstrap().catch(error => {
  console.error("Failed to start application:", error);
  process.exit(1);
});
