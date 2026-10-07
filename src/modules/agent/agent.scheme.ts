import { inject } from "inversify";
import type { Request } from "koa";

import { Injectable, ISecurityScheme } from "../../core";
import type { AuthContext } from "../../types/koa";
import { AgentError } from "./agent.errors";
import { AgentService } from "./agent.service";
import { readAgentAuthorization } from "./agent-credentials";

/**
 * `@Security("agent")`: учётные данные агента из `Authorization: Agent
 * <agentId>.<secret>`. Вызывающий — агент (`kind: "agent"`, `userId` — id
 * агента), прав у него нет: маршруты агента проверяют только принадлежность.
 */
@Injectable()
export class AgentSecurityScheme implements ISecurityScheme {
  readonly name = "agent";

  constructor(@inject(AgentService) private readonly _agents: AgentService) {}

  async authenticate(request: Request): Promise<AuthContext> {
    const raw = readAgentAuthorization(request.headers.authorization);

    if (!raw) throw AgentError.CREDENTIALS_REQUIRED();

    const agent = await this._agents.authenticate(raw);

    return {
      kind: "agent",
      userId: agent.id,
      sessionId: `agent:${agent.id}`,
      roles: [],
      permissions: [],
      emailVerified: true,
    };
  }
}
