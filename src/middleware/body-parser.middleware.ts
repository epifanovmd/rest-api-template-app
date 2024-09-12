import bodyParser from "koa-bodyparser";

const jsonRegexp = new RegExp(/\.json$/i);

export const bodyParserMiddleware = bodyParser({
  detectJSON: ctx => jsonRegexp.test(ctx.path),
});
