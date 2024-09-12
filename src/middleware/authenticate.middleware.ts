import { Request } from "koa";

import { UnauthorizedException, verifyToken } from "../common";
import { IProfileDto } from "../services/profile";

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
        resolve(verifyToken(token, scopes));
      }
    });
  }

  return Promise.resolve(null);
};
