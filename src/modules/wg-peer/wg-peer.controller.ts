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
import { WgConfigService } from "../wg-cli/wg-config.service";
import { EWgServerStatus } from "../wg-server/wg-server.types";
import {
  IWgPeerCreateRequestDto,
  IWgPeerFilters,
  IWgPeerListDto,
  IWgPeerOptionsDto,
  IWgPeerUpdateRequestDto,
  WgPeerDto,
} from "./dto";
import { WgPeerCreateSchema, WgPeerUpdateSchema } from "./validation";
import { WgPeerService } from "./wg-peer.service";

@Injectable()
@Tags("WireGuard Peers")
@Route("api/wg")
export class WgPeerController extends Controller {
  constructor(
    @inject(WgPeerService) private readonly service: WgPeerService,
    @inject(WgConfigService) private readonly configService: WgConfigService,
  ) {
    super();
  }

  /**
   * Список всех пиров.
   * Возвращает все пиры для wg:peer:view (с опциональным фильтром userId), собственные пиры для wg:peer:own.
   * @summary Получить пиры
   */
  @Security("jwt", ["permission:wg:peer:view"])
  @Security("jwt", ["permission:wg:peer:own"])
  @Get("/peers")
  async getPeers(
    @Request() req: KoaRequest,
    @Query("offset") offset?: number,
    @Query("limit") limit?: number,
    @Query("query") query?: string,
    @Query("enabled") enabled?: boolean,
    @Query("status") status?: EWgServerStatus,
    @Query("serverId") serverId?: string,
    @Query("userId") filterUserId?: string,
  ): Promise<IWgPeerListDto> {
    const { userId, permissions } = getContextUser(req);
    const filters: IWgPeerFilters = { query, enabled, status, serverId };

    const [data, totalCount] = hasPermission(permissions, EPermissions.WG_PEER_VIEW)
      ? await this.service.getAll(offset, limit, { ...filters, userId: filterUserId })
      : await this.service.getByUser(userId, offset, limit, filters);

    return { offset, limit, count: data.length, totalCount, data: data.map(WgPeerDto.fromEntity) };
  }

  /**
   * Получить варианты пиров для выпадающих списков.
   * Возвращает все варианты для wg:peer:view, собственные для wg:peer:own.
   * @summary Получить варианты пиров
   */
  @Security("jwt", ["permission:wg:peer:view"])
  @Security("jwt", ["permission:wg:peer:own"])
  @Get("/peers/options")
  async getPeersOptions(
    @Request() req: KoaRequest,
    @Query("serverId") serverId?: string,
    @Query("query") query?: string,
  ): Promise<IWgPeerOptionsDto> {
    const { userId, permissions } = getContextUser(req);

    const data = hasPermission(permissions, EPermissions.WG_PEER_VIEW)
      ? await this.service.getOptions(serverId, query)
      : await this.service.getOptionsByUser(userId, serverId, query);

    return { data };
  }

  /**
   * Получить пир по ID.
   * Проверка владельца для пользователей с wg:peer:own.
   * @summary Получить пир
   */
  @Security("jwt", ["permission:wg:peer:view"])
  @Security("jwt", ["permission:wg:peer:own"])
  @Get("/peers/{id}")
  async getPeer(id: string, @Request() req: KoaRequest): Promise<WgPeerDto> {
    const { userId, permissions } = getContextUser(req);
    const peer = await this.service.getById(id);

    if (!hasPermission(permissions, EPermissions.WG_PEER_VIEW) && peer.userId !== userId) {
      throw new ForbiddenException("Access denied: not your peer.");
    }

    return WgPeerDto.fromEntity(peer);
  }

  /**
   * Создать новый пир на сервере.
   * Ключи генерируются автоматически. Пир применяется к активному интерфейсу если сервер запущен.
   * @summary Создать пир
   */
  @Security("jwt", ["permission:wg:peer:manage"])
  @Post("/servers/{serverId}/peers")
  @ValidateBody(WgPeerCreateSchema)
  async createPeer(
    serverId: string,
    @Request() req: KoaRequest,
    @Body() body: IWgPeerCreateRequestDto,
  ): Promise<WgPeerDto> {
    const { userId } = getContextUser(req);
    const peer = await this.service.create(serverId, body, userId);

    return WgPeerDto.fromEntity(peer);
  }

  /**
   * Обновить пир.
   * @summary Обновить пир
   */
  @Security("jwt", ["permission:wg:peer:manage"])
  @Patch("/peers/{id}")
  @ValidateBody(WgPeerUpdateSchema)
  async updatePeer(
    id: string,
    @Body() body: IWgPeerUpdateRequestDto,
  ): Promise<WgPeerDto> {
    const peer = await this.service.update(id, body);

    return WgPeerDto.fromEntity(peer);
  }

  /**
   * Удалить пир.
   * Пир удаляется из активного интерфейса если сервер запущен.
   * @summary Удалить пир
   */
  @Security("jwt", ["permission:wg:peer:manage"])
  @Delete("/peers/{id}")
  async deletePeer(id: string): Promise<boolean> {
    return this.service.delete(id);
  }

  /**
   * Запустить пир (добавить в активный интерфейс WG, статус → UP).
   * Требует чтобы пир был включён и сервер запущен.
   * @summary Запустить пир
   */
  @Security("jwt", ["permission:wg:peer:manage"])
  @Post("/peers/{id}/start")
  async startPeer(id: string): Promise<WgPeerDto> {
    const peer = await this.service.start(id);

    return WgPeerDto.fromEntity(peer);
  }

  /**
   * Остановить пир (удалить из активного интерфейса WG, статус → DOWN).
   * @summary Остановить пир
   */
  @Security("jwt", ["permission:wg:peer:manage"])
  @Post("/peers/{id}/stop")
  async stopPeer(id: string): Promise<WgPeerDto> {
    const peer = await this.service.stop(id);

    return WgPeerDto.fromEntity(peer);
  }

  /**
   * Назначить пир пользователю.
   * @summary Назначить пир пользователю
   */
  @Security("jwt", ["permission:wg:peer:manage"])
  @Post("/peers/{id}/assign")
  async assignPeer(
    id: string,
    @Query("userId") userId: string,
  ): Promise<WgPeerDto> {
    const peer = await this.service.assignToUser(id, userId);

    return WgPeerDto.fromEntity(peer);
  }

  /**
   * Отозвать пир у текущего пользователя.
   * @summary Отозвать пир у пользователя
   */
  @Security("jwt", ["permission:wg:peer:manage"])
  @Post("/peers/{id}/revoke")
  async revokePeer(id: string): Promise<WgPeerDto> {
    const peer = await this.service.revokeFromUser(id);

    return WgPeerDto.fromEntity(peer);
  }

  /**
   * Ротировать (перегенерировать) предварительно общий ключ для пира.
   * @summary Ротировать предварительно общий ключ
   */
  @Security("jwt", ["permission:wg:peer:manage"])
  @Post("/peers/{id}/rotate-psk")
  async rotatePresharedKey(id: string): Promise<WgPeerDto> {
    const peer = await this.service.update(id, { presharedKey: true });

    return WgPeerDto.fromEntity(peer);
  }

  /**
   * Удалить предварительно общий ключ у пира.
   * @summary Удалить предварительно общий ключ
   */
  @Security("jwt", ["permission:wg:peer:manage"])
  @Delete("/peers/{id}/psk")
  async removePresharedKey(id: string): Promise<WgPeerDto> {
    const peer = await this.service.update(id, { presharedKey: null });

    return WgPeerDto.fromEntity(peer);
  }

  /**
   * Скачать файл конфигурации WireGuard .conf для данного пира.
   * wg:peer:view может обращаться к любому пиру; wg:peer:own только к своим.
   * @summary Получить файл конфигурации пира
   */
  @Security("jwt", ["permission:wg:peer:view"])
  @Security("jwt", ["permission:wg:peer:own"])
  @Get("/peers/{id}/config")
  async getPeerConfig(id: string, @Request() req: KoaRequest): Promise<string> {
    const { userId, permissions } = getContextUser(req);
    const peer = await this.service.getById(id);

    if (!hasPermission(permissions, EPermissions.WG_PEER_VIEW) && peer.userId !== userId) {
      throw new ForbiddenException("Access denied: not your peer.");
    }

    const config = await this.service.buildClientConfig(id);

    this.setHeader("Content-Type", "text/plain");
    this.setHeader(
      "Content-Disposition",
      `attachment; filename="wg-peer-${id}.conf"`,
    );

    return config;
  }

  /**
   * Получить PNG изображение QR-кода для клиентской конфигурации.
   * wg:peer:view может обращаться к любому пиру; wg:peer:own только к своим.
   * Возвращает base64-кодированный PNG data URL.
   * @summary Получить QR-код пира
   */
  @Security("jwt", ["permission:wg:peer:view"])
  @Security("jwt", ["permission:wg:peer:own"])
  @Get("/peers/{id}/qr")
  async getPeerQrCode(
    id: string,
    @Request() req: KoaRequest,
  ): Promise<{ dataUrl: string }> {
    const { userId, permissions } = getContextUser(req);
    const peer = await this.service.getById(id);

    if (!hasPermission(permissions, EPermissions.WG_PEER_VIEW) && peer.userId !== userId) {
      throw new ForbiddenException("Access denied: not your peer.");
    }

    const configText = await this.service.buildClientConfig(id);
    const dataUrl = await this.configService.buildQrCodeDataUrl(configText);

    return { dataUrl };
  }
}
