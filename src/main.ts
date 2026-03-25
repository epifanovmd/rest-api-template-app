import "reflect-metadata";

import { App } from "./app";
import { AppModule } from "./app.module";
import { logger } from "./core";

const SHUTDOWN_TIMEOUT_MS = 30000;

const bootstrap = async () => {
  const app = new App();

  await app.start(AppModule);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down gracefully...");

    const forceExit = setTimeout(() => {
      logger.error("Graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    forceExit.unref();

    try {
      await app.stop();
      logger.info("Server closed.");
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason, promise) => {
    logger.error(
      { err: reason, promise: String(promise) },
      "Unhandled promise rejection",
    );
  });
};

bootstrap().catch(error => {
  logger.error({ err: error }, "Failed to start application");
  process.exit(1);
});
