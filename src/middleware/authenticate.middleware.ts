import { UnauthorizedException } from "@force-dev/utils";
import { Request } from "koa";

import { SecurityScopes, verifyAuthToken } from "../common";
import { IProfileDto } from "../modules/profile/profile.model";

export const koaAuthentication = (
  request: Request,
  securityName: string,
  scopes?: string[],
): Promise<IProfileDto | null> => {
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
