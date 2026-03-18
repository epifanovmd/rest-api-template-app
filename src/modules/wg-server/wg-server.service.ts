import { inject } from "inversify";

import { config } from "../../config";
import { EventBus, Injectable, logger } from "../../core";
import { WgCliService, WgConfigService, WgKeyService } from "../wg-cli";
import { WgPeerRepository } from "../wg-peer/wg-peer.repository";
import {
  IWgServerCreateRequestDto,
  IWgServerStatusDto,
  IWgServerUpdateRequestDto,
} from "./dto";
import { WgServerStatusChangedEvent } from "./events";
import { WgServer } from "./wg-server.entity";
import { WgServerRepository } from "./wg-server.repository";
import { EWgServerStatus } from "./wg-server.types";

@Injectable()
export class WgServerService {
  constructor(
    @inject(WgServerRepository)
    private readonly serverRepo: WgServerRepository,
    @inject(WgPeerRepository)
    private readonly peerRepo: WgPeerRepository,
    @inject(WgCliService)
    private readonly cli: WgCliService,
    @inject(WgKeyService)
    private readonly keyService: WgKeyService,
    @inject(WgConfigService)
    private readonly configService: WgConfigService,
    @inject(EventBus)
    private readonly eventBus: EventBus,
  ) {}

  async getAll(): Promise<WgServer[]> {
    return this.serverRepo.find({ order: { createdAt: "ASC" } });
  }

  async getById(id: string): Promise<WgServer> {
    const server = await this.serverRepo.findOne({ where: { id } });

    if (!server)
      throw Object.assign(new Error("Server not found"), { status: 404 });

    return server;
  }

  async create(dto: IWgServerCreateRequestDto): Promise<WgServer> {
    const { privateKey, publicKey } = await this.keyService.generateKeyPair();
    const { defaults } = config.wireguard;

    const server = this.serverRepo.create({
      preUp: defaults.preUp || null,
      preDown: defaults.preDown || null,
      postUp: defaults.postUp || null,
      postDown: defaults.postDown || null,
      ...dto,
      userId: dto.userId ?? null,
      privateKey,
      publicKey,
      status: EWgServerStatus.DOWN,
    });

    const saved = await this.serverRepo.save(server);

    try {
      await this.writeConfig(saved);
    } catch (err) {
      await this.serverRepo.delete(saved.id).catch(() => {});
      throw err;
    }

    logger.info({ serverId: saved.id }, "[WgServer] Server created");

    return saved;
  }

  async update(id: string, dto: IWgServerUpdateRequestDto): Promise<WgServer> {
    const server = await this.getById(id);
    const snapshot = { ...server };

    Object.assign(server, dto);
    const saved = await this.serverRepo.save(server);

    try {
      await this.writeConfig(saved);
    } catch (err) {
      await this.serverRepo.save(snapshot).catch(() => {});
      throw err;
    }

    if (
      dto.enabled === false &&
      snapshot.enabled !== false &&
      saved.status === EWgServerStatus.UP
    ) {
      return this.stop(id);
    }

    return saved;
  }

  async delete(id: string): Promise<boolean> {
    const server = await this.getById(id);

    if (server.status === EWgServerStatus.UP) {
      await this.stop(id).catch(() => {});
    }

    await this.serverRepo.delete(id);

    try {
      await this.cli.deleteServerConfig(server.interface);
    } catch (err) {
      await this.serverRepo.save(server).catch(() => {});
      throw err;
    }

    logger.info({ serverId: id }, "[WgServer] Server deleted");

    return true;
  }

  async start(id: string): Promise<WgServer> {
    const server = await this.getById(id);
    const prev = server.status;

    try {
      const peers = await this.peerRepo.findEnabledByServer(id);

      await this.writeConfig(server, peers);
      await this.cli.up(server.interface);
      server.status = EWgServerStatus.UP;
    } catch (err) {
      server.status = EWgServerStatus.ERROR;
      logger.error({ err, serverId: id }, "[WgServer] Failed to start");
    }

    const saved = await this.serverRepo.save(server);

    this.eventBus.emit(
      new WgServerStatusChangedEvent(id, server.interface, server.status, prev),
    );

    return saved;
  }

  async stop(id: string): Promise<WgServer> {
    const server = await this.getById(id);
    const prev = server.status;

    try {
      await this.cli.down(server.interface);
      server.status = EWgServerStatus.DOWN;
    } catch (err) {
      server.status = EWgServerStatus.ERROR;
      logger.error({ err, serverId: id }, "[WgServer] Failed to stop");
    }

    const saved = await this.serverRepo.save(server);

    this.eventBus.emit(
      new WgServerStatusChangedEvent(id, server.interface, server.status, prev),
    );

    return saved;
  }

  async restart(id: string): Promise<WgServer> {
    await this.stop(id).catch(() => {});

    return this.start(id);
  }

  async getLiveStatus(id: string): Promise<IWgServerStatusDto> {
    const server = await this.getById(id);
    const isUp = await this.cli.isInterfaceUp(server.interface);

    if (!isUp) {
      return {
        serverId: id,
        interface: server.interface,
        status: EWgServerStatus.DOWN,
        listenPort: server.listenPort,
        peerCount: 0,
        activePeerCount: 0,
        publicKey: server.publicKey,
      };
    }

    const [showData] = await this.cli.show(server.interface);
    const now = Date.now();
    const HANDSHAKE_ACTIVE_THRESHOLD_MS = 3 * 60 * 1000; // 3 min
    const activePeers = (showData?.peers ?? []).filter(
      p =>
        p.lastHandshake &&
        now - p.lastHandshake.getTime() < HANDSHAKE_ACTIVE_THRESHOLD_MS,
    );

    return {
      serverId: id,
      interface: server.interface,
      status: EWgServerStatus.UP,
      listenPort: server.listenPort,
      peerCount: showData?.peers.length ?? 0,
      activePeerCount: activePeers.length,
      publicKey: server.publicKey,
    };
  }

  /**
   * Write the server config file including all active peers.
   * Called after any server or peer modification.
   */
  async writeConfig(
    server: WgServer,
    peers: Array<{
      id: string;
      name: string;
      userId?: string | null;
      publicKey: string;
      presharedKey?: string | null;
      allowedIPs: string;
      persistentKeepalive?: number | null;
      endpoint?: string | null;
      enabled: boolean;
    }> = [],
  ): Promise<void> {
    const content = this.configService.buildServerConfig({
      privateKey: server.privateKey,
      address: server.address,
      listenPort: server.listenPort,
      dns: server.dns ?? undefined,
      mtu: server.mtu ?? undefined,
      preUp: server.preUp ?? undefined,
      preDown: server.preDown ?? undefined,
      postUp: server.postUp ?? undefined,
      postDown: server.postDown ?? undefined,
      peers: peers
        .filter(p => p.enabled)
        .map(p => ({
          publicKey: p.publicKey,
          presharedKey: p.presharedKey ?? undefined,
          allowedIPs: p.allowedIPs,
          persistentKeepalive: p.persistentKeepalive ?? undefined,
          endpoint: p.endpoint ?? undefined,
          meta: { id: p.id, name: p.name, userId: p.userId },
        })),
    });

    await this.cli.writeServerConfig(server.interface, content);
  }
}
