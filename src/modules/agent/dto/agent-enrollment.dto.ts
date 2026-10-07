import { BaseDto } from "../../../core/dto/BaseDto";
import type { AgentEnrollmentToken } from "../agent-enrollment-token.entity";

export class AgentEnrollmentTokenDto extends BaseDto {
  id: string;
  name: string;
  /** Открытая часть токена: по ней токен узнают в списке. */
  prefix: string;
  labels: Record<string, string>;
  maxUses: number | null;
  uses: number;
  ephemeral: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;

  constructor(entity: AgentEnrollmentToken) {
    super(entity);

    this.id = entity.id;
    this.name = entity.name;
    this.prefix = entity.prefix;
    this.labels = entity.labels;
    this.maxUses = entity.maxUses;
    this.uses = entity.uses;
    this.ephemeral = entity.ephemeral;
    this.expiresAt = entity.expiresAt;
    this.revokedAt = entity.revokedAt;
    this.createdBy = entity.createdBy;
    this.createdAt = entity.createdAt;
  }

  static fromEntity(entity: AgentEnrollmentToken): AgentEnrollmentTokenDto {
    return new AgentEnrollmentTokenDto(entity);
  }
}

/** Выпущенный токен: `token` показывается один раз. */
export interface ICreatedEnrollmentTokenDto {
  enrollmentToken: AgentEnrollmentTokenDto;
  /** Полный токен `<prefix>.<secret>` — в конфигурацию агента. */
  token: string;
}

export interface ICreateEnrollmentTokenBody {
  /**
   * @minLength 1
   * @maxLength 100
   */
  name: string;
  /** Метки, которые получат агенты: `zone`, `gpu`. */
  labels?: Record<string, string>;
  /** Сколько агентов можно зарегистрировать; без него — без ограничения. */
  maxUses?: number;
  /** Агенты — эфемерные реплики (без постоянного тома). */
  ephemeral?: boolean;
  /** Срок действия токена; без него — бессрочный. */
  expiresAt?: Date;
}

/** Сведения о хосте при регистрации. */
export interface IEnrollAgentHost {
  hostname?: string;
  os?: string;
  arch?: string;
}

export interface IEnrollAgentBody {
  /** Токен регистрации `<prefix>.<secret>`. */
  token: string;
  /**
   * @minLength 1
   * @maxLength 200
   */
  name: string;
  labels?: Record<string, string>;
  host?: IEnrollAgentHost;
}

/** Учётные данные агента: `secret` показывается один раз. */
export interface IEnrolledAgentDto {
  agentId: string;
  /** Секрет: `Authorization: Agent <agentId>.<secret>`. */
  secret: string;
}
