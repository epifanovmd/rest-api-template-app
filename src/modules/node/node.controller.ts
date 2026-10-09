import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Path,
  Post,
  Query,
  Request,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "tsoa";

import type { IErrorResponseDto, IPaginatedDto } from "../../core";
import {
  getContextUser,
  Injectable,
  normalizePagination,
  ValidateBody,
  ValidateQuery,
} from "../../core";
import { UUID } from "../../core/http";
import { KoaRequest } from "../../types/koa";
import {
  IAssignNodeBody,
  ICreateNodeBody,
  INodeMeshDto,
  IUpdateNodeBody,
  NodeDto,
  NodeOptionDto,
} from "./dto";
import { NodeService } from "./node.service";
import { NodeMeshService } from "./node-mesh.service";
import {
  AssignNodeSchema,
  CreateNodeSchema,
  NodeOptionsQuerySchema,
  NodesQuerySchema,
  UpdateNodeSchema,
} from "./validation";

@Injectable()
@Tags("Node")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/nodes")
export class NodeController extends Controller {
  constructor(
    @inject(NodeService) private readonly _nodes: NodeService,
    @inject(NodeMeshService) private readonly _mesh: NodeMeshService,
  ) {
    super();
  }

  /**
   * Узлы, новые первыми: владелец и создатель с именами, вычисленный статус,
   * агент кратко (связь, версия, адрес, обновление), сводка конфигурации,
   * последняя задача установки. С правом `node:view:own` — только свои.
   * @param query Поиск по названию и адресу
   * @param mine Только свои узлы (владелец или создатель) при любой области прав
   * @summary Список узлов
   */
  @Security("jwt", ["permission:node:view:own"])
  @ValidateQuery(NodesQuerySchema)
  @Get()
  getNodes(
    @Request() req: KoaRequest,
    @Query() query?: string,
    @Query() mine?: boolean,
    @Query() offset?: number,
    @Query() limit?: number,
  ): Promise<IPaginatedDto<NodeDto>> {
    return this._nodes.list(
      getContextUser(req),
      { query, mine },
      normalizePagination(offset, limit),
    );
  }

  /**
   * Краткий список узлов для выпадающих списков (в рамках прав).
   * @param mine Только свои узлы при любой области прав
   * @summary Узлы для выбора
   */
  @Security("jwt", ["permission:node:view:own"])
  @ValidateQuery(NodeOptionsQuerySchema)
  @Get("options")
  getNodeOptions(
    @Request() req: KoaRequest,
    @Query() mine?: boolean,
  ): Promise<NodeOptionDto[]> {
    return this._nodes.options(getContextUser(req), mine);
  }

  /**
   * Матрица связности узлов «откуда → куда»: средние задержка и потери за 5
   * минут по измерениям воркера проверки сети (`netprobe`) агентов узлов.
   * С правом `node:view:own` — только между своими узлами.
   * @summary Связность узлов
   */
  @Security("jwt", ["permission:node:view:own"])
  @Get("mesh")
  getNodeMesh(@Request() req: KoaRequest): Promise<INodeMeshDto> {
    return this._mesh.matrixFor(getContextUser(req));
  }

  /**
   * Узел по id; чужой без права на все узлы — 404.
   * @summary Узел
   */
  @Security("jwt", ["permission:node:view:own"])
  @Get("{id}")
  getNodeById(@Request() req: KoaRequest, @Path() id: UUID): Promise<NodeDto> {
    return this._nodes.get(getContextUser(req), id);
  }

  /**
   * Создать узел. Создатель — автор запроса; владелец, отличный от себя, —
   * только с правом `node:assign`. Агента ставят командой установки или по
   * SSH.
   * @summary Создание узла
   */
  @Security("jwt", ["permission:node:create"])
  @ValidateBody(CreateNodeSchema)
  @SuccessResponse(201, "Created")
  @Post()
  async createNode(
    @Request() req: KoaRequest,
    @Body() body: ICreateNodeBody,
  ): Promise<NodeDto> {
    const node = await this._nodes.create(getContextUser(req), body);

    this.setStatus(201);

    return node;
  }

  /**
   * Изменить узел: переданные поля заменяются.
   * @summary Изменение узла
   */
  @Security("jwt", ["permission:node:update:own"])
  @ValidateBody(UpdateNodeSchema)
  @Patch("{id}")
  updateNode(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: IUpdateNodeBody,
  ): Promise<NodeDto> {
    return this._nodes.update(getContextUser(req), id, body);
  }

  /**
   * Удалить узел; его агент отзывается и удаляется (программа на машине
   * остаётся — удалить её можно заранее задачей удаления по SSH).
   * @summary Удаление узла
   */
  @Security("jwt", ["permission:node:delete:own"])
  @SuccessResponse(204, "No Content")
  @Delete("{id}")
  async deleteNode(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<void> {
    await this._nodes.delete(getContextUser(req), id);
    this.setStatus(204);
  }

  /**
   * Назначить владельца узла (узел станет для него своим).
   * @summary Назначение владельца узла
   */
  @Security("jwt", ["permission:node:assign:own"])
  @ValidateBody(AssignNodeSchema)
  @Post("{id}/assign")
  assignNodeOwner(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: IAssignNodeBody,
  ): Promise<NodeDto> {
    return this._nodes.assign(getContextUser(req), id, body);
  }

  /**
   * Снять владельца узла.
   * @summary Снятие владельца узла
   */
  @Security("jwt", ["permission:node:assign:own"])
  @Post("{id}/unassign")
  unassignNodeOwner(
    @Request() req: KoaRequest,
    @Path() id: UUID,
  ): Promise<NodeDto> {
    return this._nodes.unassign(getContextUser(req), id);
  }
}
