import jwt, { VerifyErrors } from "jsonwebtoken";
import { Request } from "koa";
import { jwtSecretKey } from "../common/constants";
import { ErrorType } from "../common/errorType";
import { ApiError } from "../common/handlers/errorHandler";
import { TokenPayload } from "../Services/Users/AuthController";

export function koaAuthentication(
  request: Request,
  securityName: string,
  scopes?: string[],
): Promise<any> {
  const token = request.ctx.cookies.get("token");

  if (securityName === "jwt") {
    return new Promise((resolve, reject) => {
      if (!token) {
        reject(
          new ApiError(
            401,
            ErrorType.UnauthorizedException,
            "No token provided",
          ),
        );
      } else {
        jwt.verify(
          token,
          jwtSecretKey,
          (err: VerifyErrors, decoded: TokenPayload) => {
            if (err) {
              reject(err);
            } else {
              // Check if JWT contains all required scopes
              if (scopes) {
                for (const scope of scopes) {
                  if (!decoded.role.includes(scope)) {
                    reject(
                      new ApiError(
                        401,
                        ErrorType.AccessRestrictedException,
                        "Access restricted",
                      ),
                    );
                  }
                }
              }
              resolve(decoded);
            }
          },
        );
      }
    });
  }

  return Promise.resolve({});
}
