import { ForbiddenException } from "@force-dev/utils";
import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";

import { getContextUser, Injectable, ValidateBody } from "../../core";
import { hasPermission } from "../../core/auth/has-permission";
import { KoaRequest } from "../../types/koa";
import { EPermissions } from "../permission/permission.types";
import {
  IWgServerCreateRequestDto,
  IWgServerFilters,
  IWgServerListDto,
  IWgServerOptionsDto,
  IWgServerStatusDto,
  IWgServerUpdateRequestDto,
  WgServerDto,
} from "./dto";
import { WgServerCreateSchema, WgServerUpdateSchema } from "./validation";
import { WgServerService } from "./wg-server.service";
import { EWgServerStatus } from "./wg-server.types";

@Injectable()
@Tags("WireGuard Servers")
@Route("api/wg/servers")
export class WgServerController extends Controller {
  constructor(
    @inject(WgServerService) private readonly service: WgServerService,
  ) {
    super();
  }

  /**
   * Список всех WireGuard-серверов с опциональными фильтрами.
   * Возвращает все серверы для wg:server:view, собственные серверы для wg:server:own.
   * @summary Получить все серверы
   */
  @Security("jwt", ["permission:wg:server:view"])
  @Security("jwt", ["permission:wg:server:own"])
  @Get("/")
  async getServers(
    @Request() req: KoaRequest,
    @Query("offset") offset?: number,
    @Query("limit") limit?: number,
    @Query("query") query?: string,
    @Query("status") status?: EWgServerStatus,
    @Query("enabled") enabled?: boolean,
  ): Promise<IWgServerListDto> {
    const { userId, permissions } = getContextUser(req);
    const filters: IWgServerFilters = { query, status, enabled };

    const [data, totalCount] = hasPermission(permissions, EPermissions.WG_SERVER_VIEW)
      ? await this.service.getAll(offset, limit, filters)
      : await this.service.getByUser(userId, offset, limit, filters);

    return { offset, limit, count: data.length, totalCount, data: data.map(WgServerDto.fromEntity) };
  }

  /**
   * Получить варианты серверов для выпадающих списков (только id + name).
   * Возвращает все варианты для wg:server:view, собственные для wg:server:own.
   * @summary Получить варианты серверов
   */
  @Security("jwt", ["permission:wg:server:view"])
  @Security("jwt", ["permission:wg:server:own"])
  @Get("/options")
  async getServerOptions(
    @Request() req: KoaRequest,
    @Query("query") query?: string,
  ): Promise<IWgServerOptionsDto> {
    const { userId, permissions } = getContextUser(req);

    const data = hasPermission(permissions, EPermissions.WG_SERVER_VIEW)
      ? await this.service.getOptions(query)
      : await this.service.getOptionsByUser(userId, query);

    return { data };
  }

  /**
   * Получить WireGuard-сервер по ID.
   * Проверка владельца для пользователей с wg:server:own.
   * @summary Получить сервер по ID
   */
  @Security("jwt", ["permission:wg:server:view"])
  @Security("jwt", ["permission:wg:server:own"])
  @Get("/{id}")
  async getServer(id: string, @Request() req: KoaRequest): Promise<WgServerDto> {
    const { userId, permissions } = getContextUser(req);
    const server = await this.service.getById(id);

    if (!hasPermission(permissions, EPermissions.WG_SERVER_VIEW) && server.userId !== userId) {
      throw new ForbiddenException("Access denied: not your server.");
    }

    return WgServerDto.fromEntity(server);
  }

  /**
   * Создать новый WireGuard-сервер.
   * Ключи генерируются автоматически.
   * Конфигурационный файл записывается в директорию конфигов WG.
   * @summary Создать сервер
   */
  @Security("jwt", ["permission:wg:server:manage"])
  @Post("/")
  @ValidateBody(WgServerCreateSchema)
  async createServer(
    @Request() req: KoaRequest,
    @Body() body: IWgServerCreateRequestDto,
  ): Promise<WgServerDto> {
    const { userId } = getContextUser(req);
    const server = await this.service.create({ ...body, userId });

    return WgServerDto.fromEntity(server);
  }

  /**
   * Обновить WireGuard-сервер.
   * Конфигурационный файл перезаписывается автоматически.
   * @summary Обновить сервер
   */
  @Security("jwt", ["permission:wg:server:manage"])
  @Patch("/{id}")
  @ValidateBody(WgServerUpdateSchema)
  async updateServer(
    id: string,
    @Body() body: IWgServerUpdateRequestDto,
  ): Promise<WgServerDto> {
    const server = await this.service.update(id, body);

    return WgServerDto.fromEntity(server);
  }

  /**
   * Удалить WireGuard-сервер.
   * Останавливает интерфейс и удаляет конфигурационный файл.
   * @summary Удалить сервер
   */
  @Security("jwt", ["permission:wg:server:manage"])
  @Delete("/{id}")
  async deleteServer(id: string): Promise<boolean> {
    return this.service.delete(id);
  }

  /**
   * Запустить WireGuard-интерфейс (wg-quick up).
   * @summary Запустить сервер
   */
  @Security("jwt", ["permission:wg:server:manage"])
  @Post("/{id}/start")
  async startServer(id: string): Promise<WgServerDto> {
    const server = await this.service.start(id);

    return WgServerDto.fromEntity(server);
  }

  /**
   * Остановить WireGuard-интерфейс (wg-quick down).
   * @summary Остановить сервер
   */
  @Security("jwt", ["permission:wg:server:manage"])
  @Post("/{id}/stop")
  async stopServer(id: string): Promise<WgServerDto> {
    const server = await this.service.stop(id);

    return WgServerDto.fromEntity(server);
  }

  /**
   * Перезапустить WireGuard-интерфейс.
   * @summary Перезапустить сервер
   */
  @Security("jwt", ["permission:wg:server:manage"])
  @Post("/{id}/restart")
  async restartServer(id: string): Promise<WgServerDto> {
    const server = await this.service.restart(id);

    return WgServerDto.fromEntity(server);
  }

  /**
   * Получить статус WireGuard-интерфейса в реальном времени.
   * Запрашивает реальный wg-интерфейс, а не кэшированный статус из БД.
   * @summary Получить актуальный статус сервера
   */
  @Security("jwt", ["permission:wg:server:view"])
  @Security("jwt", ["permission:wg:server:own"])
  @Get("/{id}/status")
  async getServerStatus(id: string, @Request() req: KoaRequest): Promise<IWgServerStatusDto> {
    const { userId, permissions } = getContextUser(req);
    const server = await this.service.getById(id);

    if (!hasPermission(permissions, EPermissions.WG_SERVER_VIEW) && server.userId !== userId) {
      throw new ForbiddenException("Access denied: not your server.");
    }

    return this.service.getLiveStatus(id);
  }
}
