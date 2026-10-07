import { inject } from "inversify";

import {
  EventBus,
  hashToken,
  Injectable,
  IPaginatedDto,
  isUniqueViolation,
  normalizePagination,
  tokenHashMatches,
  toPage,
} from "../../core";
import { agentConfig } from "./agent.config";
import { Agent } from "./agent.entity";
import { AgentError } from "./agent.errors";
import { AgentRepository } from "./agent.repository";
import { EAgentStatus } from "./agent.types";
import {
  generateSecret,
  generateTokenPrefix,
  parseEnrollmentToken,
} from "./agent-credentials";
import { AgentEnrollmentTokenRepository } from "./agent-enrollment-token.repository";
import {
  AgentEnrollmentTokenDto,
  ICreatedEnrollmentTokenDto,
  ICreateEnrollmentTokenBody,
  IEnrollAgentBody,
  IEnrolledAgentDto,
} from "./dto";
import { AgentEnrolledEvent } from "./events";

/** Строки равны; сравнение за постоянное время (по хешам равной длины). */
const secretsEqual = (a: string, b: string): boolean =>
  tokenHashMatches(a, hashToken(b));

/** Что даёт предъявленный токен регистрации. */
interface IEnrollmentGrant {
  /** Токен из БД; `null` — bootstrap-токен из окружения. */
  tokenId: string | null;
  labels: Record<string, string>;
  ephemeral: boolean;
}

/** Попыток подобрать свободный префикс токена (коллизия 48 бит — редкость). */
const PREFIX_ATTEMPTS = 3;

/**
 * Регистрация агентов: токены регистрации (выпуск, список, отзыв) и обмен
 * токена на учётные данные агента.
 */
@Injectable()
export class AgentEnrollmentService {
  constructor(
    @inject(AgentEnrollmentTokenRepository)
    private readonly _tokens: AgentEnrollmentTokenRepository,
    @inject(AgentRepository) private readonly _agents: AgentRepository,
    @inject(EventBus) private readonly _eventBus: EventBus,
  ) {}

  /** Выпустить токен; секрет возвращается только здесь. */
  async createToken(
    createdBy: string,
    body: ICreateEnrollmentTokenBody,
  ): Promise<ICreatedEnrollmentTokenDto> {
    for (let attempt = 1; ; attempt += 1) {
      const prefix = generateTokenPrefix();
      const secret = generateSecret();

      try {
        const token = await this._tokens.createAndSave({
          name: body.name,
          prefix,
          hash: hashToken(secret),
          labels: body.labels ?? {},
          maxUses: body.maxUses ?? null,
          uses: 0,
          ephemeral: body.ephemeral ?? false,
          expiresAt: body.expiresAt ?? null,
          revokedAt: null,
          createdBy,
        });

        return {
          enrollmentToken: AgentEnrollmentTokenDto.fromEntity(token),
          token: `${prefix}.${secret}`,
        };
      } catch (err) {
        if (!isUniqueViolation(err) || attempt >= PREFIX_ATTEMPTS) throw err;
      }
    }
  }

  async listTokens(
    offset?: number,
    limit?: number,
  ): Promise<IPaginatedDto<AgentEnrollmentTokenDto>> {
    const page = normalizePagination(offset, limit);
    const [tokens, total] = await this._tokens.findPage(
      page.offset,
      page.limit,
    );

    return toPage(tokens.map(AgentEnrollmentTokenDto.fromEntity), total, page);
  }

  /** Отозвать токен: новые регистрации по нему невозможны, агенты остаются. */
  async revokeToken(id: string): Promise<void> {
    const token = await this._tokens.findById(id);

    if (!token) throw AgentError.ENROLLMENT_TOKEN_NOT_FOUND();
    if (token.revokedAt) return;

    await this._tokens.update({ id }, { revokedAt: new Date() });
  }

  /** Обменять токен регистрации на учётные данные нового агента. */
  async enroll(body: IEnrollAgentBody): Promise<IEnrolledAgentDto> {
    const grant = await this.verifyToken(body.token);
    const secret = generateSecret();

    const agent = await this._agents.withTransaction(async (repo, manager) => {
      if (
        grant.tokenId &&
        !(await this._tokens.consume(grant.tokenId, new Date(), manager))
      ) {
        throw AgentError.ENROLLMENT_TOKEN_INVALID();
      }

      return repo.save(
        repo.create({
          name: body.name,
          labels: { ...grant.labels, ...body.labels },
          status: EAgentStatus.OFFLINE,
          ephemeral: grant.ephemeral,
          secretHash: hashToken(secret),
          enrollmentTokenId: grant.tokenId,
          sessionId: null,
          transport: null,
          version: null,
          protocol: null,
          host: body.host?.hostname
            ? {
                hostname: body.host.hostname,
                os: body.host.os ?? "",
                arch: body.host.arch ?? "",
              }
            : null,
          capabilities: {},
          remoteIp: null,
          connectedAt: null,
          lastSeenAt: null,
          revokedAt: null,
        } satisfies Omit<Agent, "id" | "createdAt" | "updatedAt">),
      );
    });

    this._eventBus.emit(new AgentEnrolledEvent(agent.id, grant.tokenId));

    return { agentId: agent.id, secret };
  }

  private async verifyToken(raw: string): Promise<IEnrollmentGrant> {
    const bootstrap = agentConfig.bootstrapToken;

    if (bootstrap && secretsEqual(raw, bootstrap)) {
      return { tokenId: null, labels: {}, ephemeral: false };
    }

    const parsed = parseEnrollmentToken(raw);
    const token = parsed
      ? await this._tokens.findByPrefix(parsed.prefix)
      : null;
    const now = new Date();

    if (
      !parsed ||
      !token ||
      !tokenHashMatches(parsed.secret, token.hash) ||
      token.revokedAt ||
      (token.expiresAt && token.expiresAt <= now) ||
      (token.maxUses !== null && token.uses >= token.maxUses)
    ) {
      throw AgentError.ENROLLMENT_TOKEN_INVALID();
    }

    return {
      tokenId: token.id,
      labels: token.labels,
      ephemeral: token.ephemeral,
    };
  }
}
