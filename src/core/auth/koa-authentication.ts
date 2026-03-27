import { Request } from "koa";

import { iocContainer } from "../../app.container";
import { AuthContext } from "../../types/koa";
import { SecurityScopes, TokenService } from "./token.service";

export const koaAuthentication = async (
  request: Request,
  securityName: string,
  scopes?: string[],
): Promise<AuthContext | null> => {
  if (securityName === "jwt") {
    const token = request.headers.authorization?.split(" ")[1];

    return iocContainer
      .get(TokenService)
      .verify(token, scopes as SecurityScopes);
  }

  if (securityName === "bot") {
    const auth = request.headers.authorization;
    const botToken = auth?.startsWith("Bot ")
      ? auth.slice(4)
      : (request.headers["x-bot-token"] as string | undefined);

    if (!botToken) return null;

    // Return a minimal auth context for bot requests
    // The bot controller will resolve the bot itself from the token
    return {
      userId: "bot",
      sessionId: "",
      roles: [],
      permissions: [],
      emailVerified: true,
    } as AuthContext;
  }

  return null;
};
