import "reflect-metadata";

import { App } from "./app";
import { AppModule } from "./app.module";
import { logger } from "./core";
import { startFilesServer } from "./files-server";

const SHUTDOWN_TIMEOUT_MS = 30_000;

const bootstrap = async () => {
  const app = new App();

  await app.start(AppModule);

  startFilesServer();

  // ── Graceful Shutdown ─────────────────────────────────────────

  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn({ signal }, "Shutdown already in progress, ignoring");

      return;
    }
    isShuttingDown = true;

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

  // ── Unhandled Errors ──────────────────────────────────────────

  process.on("unhandledRejection", (reason, promise) => {
    logger.error(
      { err: reason, promise: String(promise) },
      "Unhandled promise rejection",
    );
    // НЕ убиваем процесс — unhandledRejection может быть от non-critical операции
  });

  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "Uncaught exception — shutting down");
    // Состояние процесса может быть повреждено.
    // Корректно завершаем и позволяем process manager перезапустить.
    shutdown("uncaughtException").catch(() => process.exit(1));
  });
};

// ── Bootstrap ───────────────────────────────────────────────────────
//
// app.start() содержит бесконечный retry для БД.
// Если start() упал — это critical bootstrapper (Socket, Auth).
// Логируем и выходим. Process manager (Docker restart: always) перезапустит.
//
bootstrap().catch(error => {
  logger.error({ err: error }, "Failed to start application");
  process.exit(1);
});
