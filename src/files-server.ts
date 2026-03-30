import { createServer } from "http";
import Koa from "koa";
import mount from "koa-mount";
import serve from "koa-static";
import path from "path";

import { config, isDevelopment } from "./config";
import { logger } from "./core";

export function startFilesServer(): void {
  if (!isDevelopment) {
    return;
  }

  const app = new Koa();
  const filesPath = path.resolve(config.server.filesFolderPath);

  app.use(mount("/files", serve(filesPath)));

  const { filesServerPort: port, host } = config.server;

  createServer(app.callback()).listen(port, host, () => {
    logger.info(
      { url: `http://${host}:${port}/files`, path: filesPath },
      "Static files server started (debug)",
    );
  });
}
