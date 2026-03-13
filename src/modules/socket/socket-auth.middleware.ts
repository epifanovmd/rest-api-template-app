import { ForbiddenException } from "@force-dev/utils";
import { inject } from "inversify";

import { Injectable, TokenVerificationService } from "../../core";
import { TSocket } from "./socket.types";

@Injectable()
export class SocketAuthMiddleware {
  constructor(
    @inject(TokenVerificationService)
    private readonly verifier: TokenVerificationService,
  ) {}

  readonly handle = async (
    socket: TSocket,
    next: (err?: Error) => void,
  ): Promise<void> => {
    const token = this.extractToken(socket);

    if (!token) {
      return next(new ForbiddenException("Authentication token required"));
    }

    try {
      socket.data = await this.verifier.verifyAuthToken(token);
      next();
    } catch (err) {
      next(
        new ForbiddenException(
          err instanceof Error ? err.message : "Invalid token",
        ),
      );
    }
  };

  private extractToken(socket: TSocket): string | null {
    const raw: unknown = socket.handshake.auth?.token;

    if (typeof raw !== "string" || !raw) return null;

    return raw.replace(/^Bearer\s+/i, "") || null;
  }
}
