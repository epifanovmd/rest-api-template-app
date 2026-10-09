import { inject } from "inversify";

import {
  EventBus,
  Injectable,
  logger,
  PG_ERROR,
  pgErrorCode,
} from "../../core";
import type { AuthContext } from "../../types/koa";
import {
  AgentDto,
  AgentEnrollmentService,
  AgentService,
  IAgentEnrollmentSource,
} from "../agent";
import type {
  ICreateNodeInstallCommandBody,
  INodeInstallCommandDto,
} from "./dto";
import { NodeCreatedEvent, NodeUpdatedEvent } from "./events";
import { Node } from "./node.entity";
import { NodePermissions } from "./node.permissions";
import { NodeRepository, TNodeAgentMatch } from "./node.repository";
import { NodeService } from "./node.service";
import {
  NETPROBE_WORKER,
  NODE_AGENT_NAME_MAX,
  NODE_HOST_MAX,
  NODE_ID_LABEL,
  NODE_INSTALL_TOKEN_TTL_MINUTES,
  NODE_NAME_MAX,
} from "./node.types";

const MINUTE_MS = 60_000;

/** Выпущенный для узла токен регистрации. */
export interface INodeEnrollmentToken {
  tokenId: string;
  token: string;
  expiresAt: Date;
}

/** Чем агент без метки узла сопоставляется с узлом без агента — по порядку. */
const MATCHES: {
  by: string;
  where: (agent: AgentDto) => TNodeAgentMatch | null;
}[] = [
  { by: "agentName", where: agent => ({ agentName: agent.name }) },
  {
    by: "name",
    where: agent => ({ name: agent.name.slice(0, NODE_NAME_MAX) }),
  },
  {
    by: "host",
    where: agent =>
      agent.address ? { host: agent.address.slice(0, NODE_HOST_MAX) } : null,
  },
];

/**
 * Агент узла: токен регистрации с меткой узла и команда установки,
 * привязка агента после регистрации (без метки — к узлу без агента с тем же
 * прежним именем агента, именем или адресом, иначе новый узел), отвязка при
 * отзыве и удалении агента.
 */
@Injectable()
export class NodeAgentService {
  constructor(
    @inject(NodeRepository) private readonly _repo: NodeRepository,
    @inject(NodeService) private readonly _nodes: NodeService,
    @inject(AgentService) private readonly _agents: AgentService,
    @inject(AgentEnrollmentService)
    private readonly _enrollment: AgentEnrollmentService,
    @inject(EventBus) private readonly _eventBus: EventBus,
  ) {}

  /**
   * Команда установки агента вручную: одноразовый токен с меткой узла (агент
   * привяжется к нему при регистрации) и строка `curl … | sudo sh`.
   */
  async installCommand(
    actor: AuthContext,
    id: string,
    body: ICreateNodeInstallCommandBody,
  ): Promise<INodeInstallCommandDto> {
    const node = await this._nodes.findFor(
      actor,
      id,
      NodePermissions.PROVISION,
    );
    const issued = await this.issueToken(
      actor.userId,
      node,
      body.expiresInMinutes ?? NODE_INSTALL_TOKEN_TTL_MINUTES,
    );
    const { command } = this._agents.installCommand({
      token: issued.token,
      baseUrl: body.baseUrl,
      workers: body.workers ?? [NETPROBE_WORKER],
    });

    return { command, ...issued };
  }

  /** Одноразовый токен регистрации с меткой узла. */
  async issueToken(
    actorId: string,
    node: Node,
    ttlMinutes: number,
  ): Promise<INodeEnrollmentToken> {
    const expiresAt = new Date(Date.now() + ttlMinutes * MINUTE_MS);
    const created = await this._enrollment.createToken(actorId, {
      name: `node:${node.name}`.slice(0, 100),
      labels: { [NODE_ID_LABEL]: node.id },
      maxUses: 1,
      expiresAt,
    });

    return {
      tokenId: created.enrollmentToken.id,
      token: created.token,
      expiresAt,
    };
  }

  /** Отозвать токен (установка не удалась); ошибки — в журнал. */
  async revokeToken(tokenId: string): Promise<void> {
    await this._enrollment
      .revokeToken(tokenId)
      .catch(err =>
        logger.warn({ err, tokenId }, "[Node] Токен установки не отозван"),
      );
  }

  /**
   * Агент зарегистрирован. Токен с меткой узла — агент привязывается к нему
   * (прежний агент узла отзывается). Без метки — к узлу без агента, который
   * ему однозначно подходит: прежнее имя агента узла, затем имя узла, затем
   * адрес узла совпадают с именем и адресом агента (агент переустановлен
   * или зарегистрирован заново); иначе создаётся узел с именем агента,
   * владелец и создатель — кто создал токен (если известен).
   */
  async onEnrolled(
    agent: AgentDto,
    source: IAgentEnrollmentSource,
  ): Promise<void> {
    const nodeId = source.labels[NODE_ID_LABEL];

    if (nodeId) {
      await this._bind(nodeId, agent);

      return;
    }
    if (await this._bindMatching(agent)) return;

    await this._createFor(agent, source.createdBy);
  }

  /** Агент сообщил адрес, а у его узла адреса нет — адрес агента. */
  async fillHost(agent: AgentDto): Promise<void> {
    const host = agent.address?.slice(0, NODE_HOST_MAX);

    if (!host) return;

    const nodeId = await this._repo.fillHost(agent.id, host);

    if (nodeId) this._eventBus.emit(new NodeUpdatedEvent(nodeId));
  }

  /** Агент отозван или удалён: узел остаётся без агента. */
  async onAgentGone(agentId: string): Promise<void> {
    const nodeId = await this._repo.clearAgent(agentId);

    if (nodeId) this._eventBus.emit(new NodeUpdatedEvent(nodeId));
  }

  /**
   * Агент удалён с машины: отозвать и удалить его запись, узел — без агента
   * (можно установить заново).
   */
  async detach(nodeId: string, actorId: string): Promise<void> {
    const node = await this._repo.findById(nodeId);

    if (!node?.agentId) return;

    await this._agents.revokeAndDelete(actorId, node.agentId);
    await this.onAgentGone(node.agentId);
  }

  /**
   * Узел без агента, однозначно подходящий агенту; `false` — такого нет
   * (или подходят несколько — без угадывания).
   */
  private async _bindMatching(agent: AgentDto): Promise<boolean> {
    const name = agent.name.slice(0, NODE_AGENT_NAME_MAX);

    for (const { by, where } of MATCHES) {
      const match = where(agent);
      const found = match ? await this._repo.findUnbound(match) : [];

      if (found.length > 1) {
        logger.warn(
          { agentId: agent.id, by, nodes: found.map(node => node.id) },
          "[Node] Агенту подходят несколько узлов — создаётся новый",
        );

        return false;
      }
      if (
        found.length === 1 &&
        (await this._repo.bindFree(found[0].id, agent.id, name))
      ) {
        logger.info(
          { agentId: agent.id, nodeId: found[0].id, by },
          "[Node] Агент привязан к своему узлу",
        );
        this._eventBus.emit(new NodeUpdatedEvent(found[0].id));

        return true;
      }
    }

    return false;
  }

  private async _bind(nodeId: string, agent: AgentDto): Promise<void> {
    const agentId = agent.id;
    const node = await this._repo.findById(nodeId);

    if (!node) {
      logger.warn(
        { nodeId, agentId },
        "[Node] Агент зарегистрирован для удалённого узла",
      );

      return;
    }

    const previous = node.agentId;

    await this._repo.setAgent(
      nodeId,
      agentId,
      agent.name.slice(0, NODE_AGENT_NAME_MAX),
    );
    this._eventBus.emit(new NodeUpdatedEvent(nodeId));

    if (previous && previous !== agentId) {
      await this._agents
        .revokeAs("", previous)
        .catch(err =>
          logger.warn(
            { err, nodeId, agentId: previous },
            "[Node] Прежний агент узла не отозван",
          ),
        );
    }
  }

  private async _createFor(
    agent: AgentDto,
    createdBy: string | null,
  ): Promise<void> {
    const create = (userId: string | null) =>
      this._repo.createAndSave({
        name: agent.name.slice(0, NODE_NAME_MAX),
        description: null,
        host: agent.address?.slice(0, NODE_HOST_MAX) ?? null,
        ownerId: userId,
        createdById: userId,
        agentId: agent.id,
        agentName: agent.name.slice(0, NODE_AGENT_NAME_MAX),
      });
    let node: Node;

    try {
      node = await create(createdBy);
    } catch (err) {
      // Создавший токен удалён — узел без владельца.
      if (pgErrorCode(err) !== PG_ERROR.FOREIGN_KEY_VIOLATION) throw err;
      node = await create(null);
    }

    this._eventBus.emit(new NodeCreatedEvent(node.id));
  }
}
