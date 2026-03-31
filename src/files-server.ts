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

  const { filesRoutePrefix, filesServerPort: port, host } = config.server;

  app.use(mount(filesRoutePrefix, serve(filesPath)));

  createServer(app.callback()).listen(port, host, () => {
    logger.info(
      { url: `http://${host}:${port}${filesRoutePrefix}`, path: filesPath },
      "Static files server started (debug)",
    );
  });
}
