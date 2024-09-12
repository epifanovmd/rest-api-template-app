import cors from "@koa/cors";

import { config } from "../../config";

const { CORS_ALLOW_IPS } = config;

export const corsMiddleware = cors({
  origin(ctx) {
    if (
      ctx.request.header.origin &&
      CORS_ALLOW_IPS.includes(ctx.request.header.origin)
    ) {
      return ctx.request.header.origin;
    }

    return "";
  },
  exposeHeaders: ["WWW-Authenticate", "Server-Authorization"],
  maxAge: 5,
  credentials: true,
  allowMethods: ["GET", "POST", "PATCH", "DELETE"],
  allowHeaders: ["Content-Type", "Authorization", "Accept"],
});
