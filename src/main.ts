import "reflect-metadata";

import { App } from "./app";
import { AppModule } from "./app.module";
import { logger } from "./core/logger";

const bootstrap = async () => {
  const app = new App();

  await app.start(AppModule);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down gracefully...");
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
};

bootstrap().catch(error => {
  logger.error({ err: error }, "Failed to start application");
  process.exit(1);
});
