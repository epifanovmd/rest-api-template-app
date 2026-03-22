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
   * List all peers.
   * Returns all peers for wg:peer:view (with optional userId filter), own peers for wg:peer:own.
   * @summary Get peers
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
   * Get peer options for dropdowns.
   * Returns all options for wg:peer:view, own options for wg:peer:own.
   * @summary Get peer options
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
   * Get a peer by ID.
   * Ownership check for wg:peer:own users.
   * @summary Get peer
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
   * Create a new peer on a server.
   * Keys are auto-generated. Peer is applied to live interface if server is up.
   * @summary Create peer
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
   * Update a peer.
   * @summary Update peer
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
   * Delete a peer.
   * Peer is removed from live interface if server is up.
   * @summary Delete peer
   */
  @Security("jwt", ["permission:wg:peer:manage"])
  @Delete("/peers/{id}")
  async deletePeer(id: string): Promise<boolean> {
    return this.service.delete(id);
  }

  /**
   * Start a peer (add to live WG interface, status → UP).
   * Requires peer to be enabled and server to be running.
   * @summary Start peer
   */
  @Security("jwt", ["permission:wg:peer:manage"])
  @Post("/peers/{id}/start")
  async startPeer(id: string): Promise<WgPeerDto> {
    const peer = await this.service.start(id);

    return WgPeerDto.fromEntity(peer);
  }

  /**
   * Stop a peer (remove from live WG interface, status → DOWN).
   * @summary Stop peer
   */
  @Security("jwt", ["permission:wg:peer:manage"])
  @Post("/peers/{id}/stop")
  async stopPeer(id: string): Promise<WgPeerDto> {
    const peer = await this.service.stop(id);

    return WgPeerDto.fromEntity(peer);
  }

  /**
   * Assign a peer to a user.
   * @summary Assign peer to user
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
   * Revoke peer from its current user.
   * @summary Revoke peer from user
   */
  @Security("jwt", ["permission:wg:peer:manage"])
  @Post("/peers/{id}/revoke")
  async revokePeer(id: string): Promise<WgPeerDto> {
    const peer = await this.service.revokeFromUser(id);

    return WgPeerDto.fromEntity(peer);
  }

  /**
   * Rotate (regenerate) preshared key for a peer.
   * @summary Rotate preshared key
   */
  @Security("jwt", ["permission:wg:peer:manage"])
  @Post("/peers/{id}/rotate-psk")
  async rotatePresharedKey(id: string): Promise<WgPeerDto> {
    const peer = await this.service.update(id, { presharedKey: true });

    return WgPeerDto.fromEntity(peer);
  }

  /**
   * Remove preshared key from a peer.
   * @summary Remove preshared key
   */
  @Security("jwt", ["permission:wg:peer:manage"])
  @Delete("/peers/{id}/psk")
  async removePresharedKey(id: string): Promise<WgPeerDto> {
    const peer = await this.service.update(id, { presharedKey: null });

    return WgPeerDto.fromEntity(peer);
  }

  /**
   * Download the WireGuard client .conf file for this peer.
   * wg:peer:view can access any peer; wg:peer:own only their own.
   * @summary Get peer config file
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
   * Get QR code PNG image for the client config.
   * wg:peer:view can access any peer; wg:peer:own only their own.
   * Returns base64-encoded PNG data URL.
   * @summary Get peer QR code
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
