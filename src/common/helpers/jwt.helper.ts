import jwt, { sign, SignOptions, VerifyErrors } from "jsonwebtoken";
import { PrivateProfile } from "../../services/auth";
import { JWTDecoded } from "../../types/koa";
import { jwtSecretKey } from "../constants";
import { ApiError } from "../handlers";

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
        jwtSecretKey,
        (err: VerifyErrors, decoded: JWTDecoded) => {
          if (err) {
            reject(err);
          } else {
            // Check if JWT contains all required scopes
            if (scopes) {
              // for (const scope of scopes) {
              //   if (!decoded.role.includes(scope)) {
              //     reject(new ApiError("Access restricted", 401));
              //   }
              // }
            }
            resolve(decoded);
          }
        },
      );
    }
  });

export const createToken = (profile: PrivateProfile, opts?: SignOptions) =>
  new Promise<string>(resolve => {
    resolve(sign(profile, jwtSecretKey, opts));
  });

export const createTokenAsync = (
  data: { profile: PrivateProfile; opts?: SignOptions }[],
) => Promise.all(data.map(value => createToken(value.profile, value.opts)));
