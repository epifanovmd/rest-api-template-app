import jwt, { sign, SignOptions, VerifyErrors } from "jsonwebtoken";

import { config } from "../../../config";
import { iocContainer } from "../../app.container";
import { User } from "../../modules/user/user.entity";
import { JWTDecoded } from "../../types/koa";
import {
  SecurityScopes,
  TokenVerificationService,
} from "./token-verification.service";

export type { SecurityScopes };

export const createToken = (userId: string, opts?: SignOptions) =>
  new Promise<string>((resolve, reject) => {
    try {
      const token = sign({ userId }, config.auth.jwt.secretKey, opts);

      resolve(token);
    } catch (error) {
      reject(error);
    }
  });

export const createTokenAsync = (
  data: { userId: string; opts?: SignOptions }[],
) => Promise.all(data.map(value => createToken(value.userId, value.opts)));

export const verifyToken = (token: string) => {
  return new Promise<JWTDecoded>((resolve, reject) => {
    jwt.verify(
      token,
      config.auth.jwt.secretKey,
      async (err: VerifyErrors, decoded: JWTDecoded) => {
        if (err) {
          reject(err);
        } else {
          resolve(decoded);
        }
      },
    );
  });
};

export const verifyAuthToken = (
  token?: string,
  scopes?: SecurityScopes,
): Promise<User> =>
  iocContainer.get(TokenVerificationService).verifyAuthToken(token, scopes);
