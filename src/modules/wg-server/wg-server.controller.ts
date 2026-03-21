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
import { KoaRequest } from "../../types/koa";
import {
  IWgServerCreateRequestDto,
  IWgServerFilters,
  IWgServerListDto,
  IWgServerOptionDto,
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
   * @summary Get all servers
   */
  @Security("jwt", ["permission:wg:server:view"])
  @Get("/")
  async getServers(
    @Query("offset") offset?: number,
    @Query("limit") limit?: number,
    @Query("query") query?: string,
    @Query("status") status?: EWgServerStatus,
    @Query("enabled") enabled?: boolean,
  ): Promise<IWgServerListDto> {
    const filters: IWgServerFilters = { query, status, enabled };
    const [data, totalCount] = await this.service.getAll(offset, limit, filters);

    return { offset, limit, count: data.length, totalCount, data: data.map(WgServerDto.fromEntity) };
  }

  /**
   * Get server options for dropdowns (id + name only).
   * @summary Get server options
   */
  @Security("jwt", ["permission:wg:server:view"])
  @Get("/options")
  async getServerOptions(
    @Query("query") query?: string,
  ): Promise<IWgServerOptionsDto> {
    const data = await this.service.getOptions(query);

    return { data };
  }

  /**
   * Get a WireGuard server by ID.
   * @summary Get server by ID
   */
  @Security("jwt", ["permission:wg:server:view"])
  @Get("/{id}")
  async getServer(id: string): Promise<WgServerDto> {
    const server = await this.service.getById(id);

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
  @Security("jwt", ["permission:wg:server:control"])
  @Post("/{id}/start")
  async startServer(id: string): Promise<WgServerDto> {
    const server = await this.service.start(id);

    return WgServerDto.fromEntity(server);
  }

  /**
   * Stop a WireGuard interface (wg-quick down).
   * @summary Stop server
   */
  @Security("jwt", ["permission:wg:server:control"])
  @Post("/{id}/stop")
  async stopServer(id: string): Promise<WgServerDto> {
    const server = await this.service.stop(id);

    return WgServerDto.fromEntity(server);
  }

  /**
   * Restart a WireGuard interface.
   * @summary Restart server
   */
  @Security("jwt", ["permission:wg:server:control"])
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
  @Get("/{id}/status")
  async getServerStatus(id: string): Promise<IWgServerStatusDto> {
    return this.service.getLiveStatus(id);
  }
}
