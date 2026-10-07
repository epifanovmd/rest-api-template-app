import { randomBytes } from "crypto";

import { isUuid } from "../../common/helpers/uuid";
import {
  AGENT_AUTH_SCHEME,
  AGENT_CREDENTIAL_MAX_LENGTH,
  AGENT_SECRET_BYTES,
  ENROLLMENT_TOKEN_PREFIX_BYTES,
  ENROLLMENT_TOKEN_PREFIX_LENGTH,
} from "./agent.types";

export const generateSecret = (): string =>
  randomBytes(AGENT_SECRET_BYTES).toString("base64url");

export const generateTokenPrefix = (): string =>
  randomBytes(ENROLLMENT_TOKEN_PREFIX_BYTES).toString("base64url");

/** `<agentId>.<secret>` → части; `null` — формат не наш. */
export const parseAgentCredentials = (
  raw: string,
): { agentId: string; secret: string } | null => {
  if (raw.length > AGENT_CREDENTIAL_MAX_LENGTH) return null;

  const dot = raw.indexOf(".");
  const agentId = raw.slice(0, dot);
  const secret = raw.slice(dot + 1);

  return dot > 0 && secret && isUuid(agentId) ? { agentId, secret } : null;
};

/** `<prefix>.<secret>` токена регистрации → части; `null` — формат не наш. */
export const parseEnrollmentToken = (
  raw: string,
): { prefix: string; secret: string } | null => {
  if (raw.length > AGENT_CREDENTIAL_MAX_LENGTH) return null;

  const dot = raw.indexOf(".");
  const secret = raw.slice(dot + 1);

  return dot === ENROLLMENT_TOKEN_PREFIX_LENGTH && secret
    ? { prefix: raw.slice(0, dot), secret }
    : null;
};

/** Учётные данные из `Authorization: Agent <agentId>.<secret>`. */
export const readAgentAuthorization = (
  header: string | string[] | undefined,
): string | undefined =>
  typeof header === "string" && header.startsWith(AGENT_AUTH_SCHEME)
    ? header.slice(AGENT_AUTH_SCHEME.length).trim() || undefined
    : undefined;
