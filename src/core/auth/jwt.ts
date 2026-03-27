import jwt, { sign, SignOptions, VerifyErrors } from "jsonwebtoken";

import { config } from "../../config";
import { EPermissions } from "../../modules/permission/permission.types";
import { ERole } from "../../modules/role/role.types";
import { JWTDecoded } from "../../types/koa";

export type { SecurityScopes } from "./token.service";

export type TokenPayload = {
  userId: string;
  sessionId: string;
  roles: ERole[];
  permissions: EPermissions[];
  emailVerified: boolean;
};

export const createToken = (
  payload: TokenPayload,
  opts?: SignOptions,
): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    try {
      resolve(sign(payload, config.auth.jwt.secretKey, opts));
    } catch (error) {
      reject(error);
    }
  });

export const createTokenAsync = (
  data: { payload: TokenPayload; opts?: SignOptions }[],
) => Promise.all(data.map(({ payload, opts }) => createToken(payload, opts)));

export const verifyToken = (token: string): Promise<JWTDecoded> =>
  new Promise<JWTDecoded>((resolve, reject) => {
    jwt.verify(
      token,
      config.auth.jwt.secretKey,
      (err: VerifyErrors | null, decoded: JWTDecoded | undefined) => {
        if (err) reject(err);
        else resolve(decoded!);
      },
    );
  });
