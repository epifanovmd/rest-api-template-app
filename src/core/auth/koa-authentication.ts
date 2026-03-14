import { Request } from "koa";

import { iocContainer } from "../../app.container";
import { AuthContext } from "../../types/koa";
import { SecurityScopes, TokenService } from "./token.service";

export const koaAuthentication = (
  request: Request,
  securityName: string,
  scopes?: string[],
): Promise<AuthContext | null> => {
  if (securityName === "jwt") {
    const token = request.headers.authorization?.split(" ")[1];

    return iocContainer
      .get(TokenService)
      .verify(token, scopes as SecurityScopes);
  }

  return Promise.resolve(null);
};
