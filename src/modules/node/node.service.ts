import { inject } from "inversify";

import type { IPaginatedDto, Pagination } from "../../core";
import {
  EventBus,
  Injectable,
  logger,
  PG_ERROR,
  pgErrorCode,
  toPage,
} from "../../core";
import type { AuthContext } from "../../types/koa";
import { AgentService } from "../agent";
import type {
  IAssignNodeBody,
  ICreateNodeBody,
  IUpdateNodeBody,
  NodeDto,
} from "./dto";
import { NodeOptionDto } from "./dto";
import { NodeCreatedEvent, NodeDeletedEvent, NodeUpdatedEvent } from "./events";
import { NodeAccess } from "./node.access";
import { Node } from "./node.entity";
import { NodeError } from "./node.errors";
import { NodePermissions } from "./node.permissions";
import { INodeFilters, NodeRepository } from "./node.repository";
import { NodeViewService } from "./node-view.service";

const mapSaveError = (err: unknown): unknown =>
  pgErrorCode(err) === PG_ERROR.FOREIGN_KEY_VIOLATION
    ? NodeError.USER_NOT_FOUND()
    : err;

/**
 * Узлы: CRUD с областью прав «все / свои» (владелец или создатель),
 * назначение владельца. Чужой узел без права на все не раскрывается (404);
 * видимый, но без права на действие — 403. Методы без актора — для
 * задач, слушателей и политик модуля.
 */
@Injectable()
export class NodeService {
  constructor(
    @inject(NodeRepository) private readonly _repo: NodeRepository,
    @inject(NodeViewService) private readonly _view: NodeViewService,
    @inject(AgentService) private readonly _agents: AgentService,
    @inject(EventBus) private readonly _eventBus: EventBus,
  ) {}

  /** Создать узел; владелец, отличный от себя, — только с правом назначения. */
  async create(actor: AuthContext, body: ICreateNodeBody): Promise<NodeDto> {
    const ownerId = body.ownerId ?? null;

    if (
      ownerId !== null &&
      ownerId !== actor.userId &&
      !NodeAccess.scope(actor, NodePermissions.ASSIGN)
    ) {
      throw NodeError.FORBIDDEN();
    }

    let node: Node;

    try {
      node = await this._repo.createAndSave({
        name: body.name,
        description: body.description ?? null,
        host: body.host ?? null,
        ownerId,
        createdById: actor.userId,
        agentId: null,
      });
    } catch (err) {
      throw mapSaveError(err);
    }

    this._eventBus.emit(new NodeCreatedEvent(node.id));

    return this._dtoOf(node.id);
  }

  /** Узлы в рамках прав; `mine` — только свои при любой области. */
  async list(
    actor: AuthContext,
    { mine, ...filters }: Omit<INodeFilters, "ownedBy"> & { mine?: boolean },
    pagination: Pagination,
  ): Promise<IPaginatedDto<NodeDto>> {
    const [nodes, total] = await this._repo.findPage(
      { ...filters, ...this.viewFilter(actor, mine) },
      pagination,
    );

    return toPage(await this._view.toDtos(nodes), total, pagination);
  }

  async options(actor: AuthContext, mine?: boolean): Promise<NodeOptionDto[]> {
    const { ownedBy } = this.viewFilter(actor, mine);

    return (await this._repo.findOptions(ownedBy)).map(
      NodeOptionDto.fromEntity,
    );
  }

  async get(actor: AuthContext, id: string): Promise<NodeDto> {
    await this.findFor(actor, id, NodePermissions.VIEW);

    return this._dtoOf(id);
  }

  async update(
    actor: AuthContext,
    id: string,
    body: IUpdateNodeBody,
  ): Promise<NodeDto> {
    await this.findFor(actor, id, NodePermissions.UPDATE);

    const patch: Partial<Pick<Node, "name" | "description" | "host">> = {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.host !== undefined && { host: body.host }),
    };

    if (Object.keys(patch).length > 0) await this._repo.update({ id }, patch);

    this._eventBus.emit(new NodeUpdatedEvent(id));

    return this._dtoOf(id);
  }

  /** Удалить узел; его агент отзывается и удаляется. */
  async delete(actor: AuthContext, id: string): Promise<void> {
    const node = await this.findFor(actor, id, NodePermissions.DELETE);

    await this._repo.delete({ id: node.id });

    if (node.agentId) {
      await this._agents
        .revokeAndDelete(actor.userId, node.agentId)
        .catch(err =>
          logger.warn(
            { err, nodeId: node.id, agentId: node.agentId },
            "[Node] Агент удалённого узла не удалён",
          ),
        );
    }

    this._eventBus.emit(
      new NodeDeletedEvent(node.id, node.ownerId, node.createdById),
    );
  }

  async assign(
    actor: AuthContext,
    id: string,
    body: IAssignNodeBody,
  ): Promise<NodeDto> {
    const node = await this.findFor(actor, id, NodePermissions.ASSIGN);

    try {
      await this._repo.update({ id }, { ownerId: body.userId });
    } catch (err) {
      throw mapSaveError(err);
    }

    return this._ownerChanged(node, body.userId);
  }

  async unassign(actor: AuthContext, id: string): Promise<NodeDto> {
    const node = await this.findFor(actor, id, NodePermissions.ASSIGN);

    await this._repo.update({ id }, { ownerId: null });

    return this._ownerChanged(node, null);
  }

  /** Узел для действия актора: невидимый — 404, без права на действие — 403. */
  async findFor(
    actor: AuthContext,
    id: string,
    permission: string,
  ): Promise<Node> {
    const node = await this._repo.findById(id);

    if (!node || !NodeAccess.can(actor, NodePermissions.VIEW, node)) {
      throw NodeError.NOT_FOUND();
    }
    if (!NodeAccess.can(actor, permission, node)) throw NodeError.FORBIDDEN();

    return node;
  }

  /** Ограничение выборки областью просмотра; права нет — 403. */
  viewFilter(actor: AuthContext, mine?: boolean): { ownedBy?: string } {
    const filter = NodeAccess.listFilter(actor, NodePermissions.VIEW, mine);

    if (!filter) throw NodeError.FORBIDDEN();

    return filter;
  }

  /** DTO узла без проверки доступа; узла нет — `null`. */
  async findDto(id: string): Promise<NodeDto | null> {
    const node = await this._repo.findWithOwners(id);

    return node ? this._view.toDto(node) : null;
  }

  private async _dtoOf(id: string): Promise<NodeDto> {
    const dto = await this.findDto(id);

    if (!dto) throw NodeError.NOT_FOUND();

    return dto;
  }

  private async _ownerChanged(
    node: Node,
    ownerId: string | null,
  ): Promise<NodeDto> {
    const previous = node.ownerId !== ownerId ? node.ownerId : null;

    this._eventBus.emit(new NodeUpdatedEvent(node.id, previous));

    return this._dtoOf(node.id);
  }
}
