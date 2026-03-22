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
   * List all WireGuard servers with optional filters.
   * Returns all servers for wg:server:view, own servers for wg:server:own.
   * @summary Get all servers
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
   * Get server options for dropdowns (id + name only).
   * Returns all options for wg:server:view, own options for wg:server:own.
   * @summary Get server options
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
   * Get a WireGuard server by ID.
   * Ownership check for wg:server:own users.
   * @summary Get server by ID
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
   * Create a new WireGuard server.
   * Keys are generated automatically.
   * The config file is written to the WG config directory.
   * @summary Create server
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
   * Update a WireGuard server.
   * Config file is rewritten automatically.
   * @summary Update server
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
   * Delete a WireGuard server.
   * Stops the interface and removes the config file.
   * @summary Delete server
   */
  @Security("jwt", ["permission:wg:server:manage"])
  @Delete("/{id}")
  async deleteServer(id: string): Promise<boolean> {
    return this.service.delete(id);
  }

  /**
   * Start a WireGuard interface (wg-quick up).
   * @summary Start server
   */
  @Security("jwt", ["permission:wg:server:manage"])
  @Post("/{id}/start")
  async startServer(id: string): Promise<WgServerDto> {
    const server = await this.service.start(id);

    return WgServerDto.fromEntity(server);
  }

  /**
   * Stop a WireGuard interface (wg-quick down).
   * @summary Stop server
   */
  @Security("jwt", ["permission:wg:server:manage"])
  @Post("/{id}/stop")
  async stopServer(id: string): Promise<WgServerDto> {
    const server = await this.service.stop(id);

    return WgServerDto.fromEntity(server);
  }

  /**
   * Restart a WireGuard interface.
   * @summary Restart server
   */
  @Security("jwt", ["permission:wg:server:manage"])
  @Post("/{id}/restart")
  async restartServer(id: string): Promise<WgServerDto> {
    const server = await this.service.restart(id);

    return WgServerDto.fromEntity(server);
  }

  /**
   * Get real-time status of a WireGuard interface.
   * Queries the actual wg interface, not cached DB status.
   * @summary Get live server status
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
