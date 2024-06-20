import { Request } from "koa";
import { ApiError } from "../common";
import { verifyToken } from "../common/helpers";
import { PrivateProfile } from "../services/auth";

export const koaAuthentication = (
  request: Request,
  securityName: string,
  scopes?: string[],
): Promise<PrivateProfile | null> => {
  const token = request.headers.authorization?.split(" ")[1];

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
