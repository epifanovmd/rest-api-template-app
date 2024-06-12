import { Request } from "koa";
import { ApiError } from "../common";
import { verifyToken } from "../common/helpers";
import { PrivateProfile } from "../services/auth";

export const koaAuthentication = (
  request: Request,
  securityName: string,
  scopes?: string[],
): Promise<PrivateProfile | null> => {
  const token = request.ctx.cookies.get("access_token");

  if (securityName === "jwt") {
    return new Promise((resolve, reject) => {
      if (!token) {
        reject(new ApiError("No token provided", 401));
      } else {
        resolve(verifyToken(token, scopes));
      }
    });
  }

  return Promise.resolve(null);
};
