import KoaRouter from "@koa/router";
import { DataSource } from "typeorm";

export const RegisterSystemRoutes = (
  router: KoaRouter,
  dataSource: DataSource,
) => {
  router.get("/ping", ctx => {
    ctx.status = 200;
    ctx.body = { serverTime: new Date().toISOString() };
  });

  router.get("/health", async ctx => {
    let dbStatus = "ok";

    try {
      await dataSource.query("SELECT 1");
    } catch {
      dbStatus = "error";
    }

    const status = dbStatus === "ok" ? 200 : 503;

    ctx.status = status;
    ctx.body = {
      status: status === 200 ? "ok" : "degraded",
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "unknown",
      services: { db: dbStatus },
    };
  });
};
