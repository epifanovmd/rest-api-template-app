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
import { WgConfigService } from "../wg-cli/wg-config.service";
import {
  IWgPeerCreateRequestDto,
  IWgPeerListDto,
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
   * List all peers for a given server.
   * @summary Get peers by server
   */
  @Security("jwt", ["role:admin"])
  @Get("/servers/{serverId}/peers")
  async getPeersByServer(
    serverId: string,
    @Query("offset") offset?: number,
    @Query("limit") limit?: number,
  ): Promise<IWgPeerListDto> {
    const [data, totalCount] = await this.service.getByServer(serverId, offset, limit);

    return { offset, limit, count: data.length, totalCount, data: data.map(WgPeerDto.fromEntity) };
  }

  /**
   * Get all peers owned by the current user.
   * @summary Get my peers
   */
  @Security("jwt")
  @Get("/peers/my")
  async getMyPeers(
    @Request() req: KoaRequest,
    @Query("offset") offset?: number,
    @Query("limit") limit?: number,
  ): Promise<IWgPeerListDto> {
    const user = getContextUser(req);
    const [data, totalCount] = await this.service.getByUser(user.userId, offset, limit);

    return { offset, limit, count: data.length, totalCount, data: data.map(WgPeerDto.fromEntity) };
  }

  /**
   * Get all peers for a user (admin only).
   * @summary Get peers by user
   */
  @Security("jwt", ["role:admin"])
  @Get("/peers/user/{userId}")
  async getPeersByUser(
    userId: string,
    @Query("offset") offset?: number,
    @Query("limit") limit?: number,
  ): Promise<IWgPeerListDto> {
    const [data, totalCount] = await this.service.getByUser(userId, offset, limit);

    return { offset, limit, count: data.length, totalCount, data: data.map(WgPeerDto.fromEntity) };
  }

  /**
   * Get a peer by ID.
   * @summary Get peer
   */
  @Security("jwt", ["role:admin"])
  @Get("/peers/{id}")
  async getPeer(id: string): Promise<WgPeerDto> {
    const peer = await this.service.getById(id);

    return WgPeerDto.fromEntity(peer);
  }

  /**
   * Create a new peer on a server.
   * Keys are auto-generated. Peer is applied to live interface if server is up.
   * @summary Create peer
   */
  @Security("jwt", ["role:admin"])
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
  @Security("jwt", ["role:admin"])
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
  @Security("jwt", ["role:admin"])
  @Delete("/peers/{id}")
  async deletePeer(id: string): Promise<boolean> {
    return this.service.delete(id);
  }

  /**
   * Start a peer (add to live WG interface, status → UP).
   * Requires peer to be enabled and server to be running.
   * @summary Start peer
   */
  @Security("jwt", ["role:admin"])
  @Post("/peers/{id}/start")
  async startPeer(id: string): Promise<WgPeerDto> {
    const peer = await this.service.start(id);

    return WgPeerDto.fromEntity(peer);
  }

  /**
   * Stop a peer (remove from live WG interface, status → DOWN).
   * @summary Stop peer
   */
  @Security("jwt", ["role:admin"])
  @Post("/peers/{id}/stop")
  async stopPeer(id: string): Promise<WgPeerDto> {
    const peer = await this.service.stop(id);

    return WgPeerDto.fromEntity(peer);
  }

  /**
   * Assign a peer to a user.
   * @summary Assign peer to user
   */
  @Security("jwt", ["role:admin"])
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
  @Security("jwt", ["role:admin"])
  @Post("/peers/{id}/revoke")
  async revokePeer(id: string): Promise<WgPeerDto> {
    const peer = await this.service.revokeFromUser(id);

    return WgPeerDto.fromEntity(peer);
  }

  /**
   * Rotate (regenerate) preshared key for a peer.
   * @summary Rotate preshared key
   */
  @Security("jwt", ["role:admin"])
  @Post("/peers/{id}/rotate-psk")
  async rotatePresharedKey(id: string): Promise<WgPeerDto> {
    const peer = await this.service.update(id, { presharedKey: true });

    return WgPeerDto.fromEntity(peer);
  }

  /**
   * Remove preshared key from a peer.
   * @summary Remove preshared key
   */
  @Security("jwt", ["role:admin"])
  @Delete("/peers/{id}/psk")
  async removePresharedKey(id: string): Promise<WgPeerDto> {
    const peer = await this.service.update(id, { presharedKey: null });

    return WgPeerDto.fromEntity(peer);
  }

  /**
   * Download the WireGuard client .conf file for this peer.
   * @summary Get peer config file
   */
  @Security("jwt")
  @Get("/peers/{id}/config")
  async getPeerConfig(id: string): Promise<string> {
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
   * Returns base64-encoded PNG data URL.
   * @summary Get peer QR code
   */
  @Security("jwt")
  @Get("/peers/{id}/qr")
  async getPeerQrCode(id: string): Promise<{ dataUrl: string }> {
    const configText = await this.service.buildClientConfig(id);
    const dataUrl = await this.configService.buildQrCodeDataUrl(configText);

    return { dataUrl };
  }
}
