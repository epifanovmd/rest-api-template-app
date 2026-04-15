import KoaRouter from "@koa/router";
import { DataSource } from "typeorm";

import type { App } from "../app";

export const RegisterSystemRoutes = (
  router: KoaRouter,
  dataSource: DataSource,
  app: App,
) => {
  /**
   * GET /ping — Liveness probe.
   * Всегда 200, если процесс жив и HTTP слушает.
   * Kubernetes: livenessProbe.
   */
  router.get("/ping", ctx => {
    ctx.status = 200;
    ctx.body = { serverTime: new Date().toISOString() };
  });

  /**
   * GET /ready — Readiness probe.
   * 200 только если ВСЕ bootstrappers завершились и сервер готов к трафику.
   * 503 если ещё стартует или в процессе shutdown.
   * Kubernetes: readinessProbe.
   */
  router.get("/ready", ctx => {
    if (app.isReady) {
      ctx.status = 200;
      ctx.body = { status: "ready" };
    } else {
      ctx.status = 503;
      ctx.body = { status: "not_ready" };
    }
  });

  /**
   * GET /health — Full health check.
   * Проверяет все зависимости: DB, memory.
   * Kubernetes: startup probe или мониторинг.
   */
  router.get("/health", async ctx => {
    const checks: Record<string, string> = {};
    let healthy = true;

    // ── Database ──────────────────────────────────────────────
    try {
      await dataSource.query("SELECT 1");
      checks.database = "ok";
    } catch {
      checks.database = "error";
      healthy = false;
    }

    // ── Memory ────────────────────────────────────────────────
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(memUsage.rss / 1024 / 1024);

    checks.memory = `${heapUsedMB}/${heapTotalMB}MB heap, ${rssMB}MB RSS`;

    // Warn if heap usage > 90%
    if (heapUsedMB / heapTotalMB > 0.9) {
      checks.memory_warning = "high_heap_usage";
    }

    // ── Response ──────────────────────────────────────────────
    ctx.status = healthy ? 200 : 503;
    ctx.body = {
      status: healthy ? "ok" : "degraded",
      ready: app.isReady,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "unknown",
      services: checks,
    };
  });
};
