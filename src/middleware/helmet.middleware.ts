import helmet from "koa-helmet";

export const helmetMiddleware = helmet({
  contentSecurityPolicy: false,
  xssFilter: true,
});
