import { UnauthorizedException } from "@force-dev/utils";
import { Request } from "koa";

import { SecurityScopes, verifyAuthToken } from "../core";
import { User } from "../modules/user/user.entity";

export const koaAuthentication = (
  request: Request,
  securityName: string,
  scopes?: string[],
): Promise<User | null> => {
  const token = request.headers.authorization?.split(" ")[1];

  if (securityName === "jwt") {
    return new Promise((resolve, reject) => {
      if (!token) {
        reject(new UnauthorizedException());
      } else {
        resolve(verifyAuthToken(token, scopes as SecurityScopes));
      }
    });
  }

  return Promise.resolve(null);
};
