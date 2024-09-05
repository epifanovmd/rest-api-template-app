import jwt, { sign, SignOptions, VerifyErrors } from "jsonwebtoken";

import { config } from "../../../config";
import { IProfileDto } from "../../services/Profile";
import { JWTDecoded } from "../../types/koa";
import { ApiError } from "../handlers";

export const { JWT_SECRET_KEY } = config;

export const verifyToken = (
  token?: string,
  scopes?: string[],
): Promise<JWTDecoded> =>
  new Promise((resolve, reject) => {
    if (!token) {
      reject(new ApiError("Access restricted", 401));
    } else {
      return jwt.verify(
        token,
        JWT_SECRET_KEY,
        (err: VerifyErrors, decoded: JWTDecoded) => {
          if (err) {
            reject(err);
          }
          // Check if JWT contains all required scopes
          if (scopes) {
            // for (const scope of scopes) {
            //   if (!decoded.role.includes(scope)) {
            //     reject(new ApiError("Access restricted", 401));
            //   }
            // }
          }
          resolve(decoded);
        },
      );
    }
  });

export const createToken = (profile: IProfileDto, opts?: SignOptions) =>
  new Promise<string>(resolve => {
    resolve(sign(profile, JWT_SECRET_KEY, opts));
  });

export const createTokenAsync = (
  data: { profile: IProfileDto; opts?: SignOptions }[],
) => Promise.all(data.map(value => createToken(value.profile, value.opts)));
