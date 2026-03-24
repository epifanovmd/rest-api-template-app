import { inject } from "inversify";

import { EventBus, Injectable, logger } from "../../core";
import { WgCliService } from "../wg-cli/wg-cli.service";
import { WgConfigService } from "../wg-cli/wg-config.service";
import { WgKeyService } from "../wg-cli/wg-key.service";
import { WgServerRepository } from "../wg-server/wg-server.repository";
import { WgServerService } from "../wg-server/wg-server.service";
import { EWgServerStatus } from "../wg-server/wg-server.types";
import {
  IWgPeerCreateRequestDto,
  IWgPeerFilters,
  IWgPeerOptionDto,
  IWgPeerUpdateRequestDto,
} from "./dto";
import {
  WgPeerCreatedEvent,
  WgPeerDeletedEvent,
  WgPeerStatusChangedEvent,
} from "./events";
import { WgIpAllocatorService } from "./wg-ip-allocator.service";
import { WgPeer } from "./wg-peer.entity";
import { WgPeerRepository } from "./wg-peer.repository";

/** Сервис для управления WireGuard-пирами: создание, обновление, запуск/остановка, конфигурация. */
@Injectable()
export class WgPeerService {
  constructor(
    @inject(WgPeerRepository) private readonly peerRepo: WgPeerRepository,
    @inject(WgServerRepository) private readonly serverRepo: WgServerRepository,
    @inject(WgServerService) private readonly serverService: WgServerService,
    @inject(WgCliService) private readonly cli: WgCliService,
    @inject(WgKeyService) private readonly keyService: WgKeyService,
    @inject(WgConfigService) private readonly configService: WgConfigService,
    @inject(WgIpAllocatorService)
    private readonly ipAllocator: WgIpAllocatorService,
    @inject(EventBus) private readonly eventBus: EventBus,
  ) {}

  /** Получить все пиры с пагинацией и опциональными фильтрами. */
  async getAll(
    offset?: number,
    limit?: number,
    filters?: IWgPeerFilters,
  ): Promise<[WgPeer[], number]> {
    return this.peerRepo.findAll(offset, limit, filters);
  }

  /** Получить пиры конкретного сервера с пагинацией и фильтрами. */
  async getByServer(
    serverId: string,
    offset?: number,
    limit?: number,
    filters?: IWgPeerFilters,
  ): Promise<[WgPeer[], number]> {
    return this.peerRepo.findByServer(serverId, offset, limit, filters);
  }

  /** Получить пиры конкретного пользователя с пагинацией и фильтрами. */
  async getByUser(
    userId: string,
    offset?: number,
    limit?: number,
    filters?: IWgPeerFilters,
  ): Promise<[WgPeer[], number]> {
    return this.peerRepo.findByUser(userId, offset, limit, filters);
  }

  /** Получить список пиров в формате для выпадающего списка. */
  async getOptions(
    serverId?: string,
    query?: string,
  ): Promise<IWgPeerOptionDto[]> {
    return this.peerRepo.findOptions(serverId, query);
  }

  /** Получить список пиров пользователя в формате для выпадающего списка. */
  async getOptionsByUser(
    userId: string,
    serverId?: string,
    query?: string,
  ): Promise<IWgPeerOptionDto[]> {
    return this.peerRepo.findOptionsByUser(userId, serverId, query);
  }

  /** Получить пир по ID; выбрасывает ошибку 404 если не найден. */
  async getById(id: string): Promise<WgPeer> {
    const peer = await this.peerRepo.findOneWithUser(id);

    if (!peer)
      throw Object.assign(new Error("Peer not found"), { status: 404 });

    return peer;
  }

  /** Создать новый пир на сервере: генерирует ключи, выделяет IP и применяет к live-интерфейсу если сервер запущен. */
  async create(
    serverId: string,
    dto: IWgPeerCreateRequestDto,
    userId: string,
  ): Promise<WgPeer> {
    const server = await this.serverRepo.findOne({ where: { id: serverId } });

    if (!server)
      throw Object.assign(new Error("Server not found"), { status: 404 });

    const nameConflict = await this.peerRepo.findOne({
      where: { serverId, name: dto.name },
    });

    if (nameConflict) {
      throw Object.assign(
        new Error(`Peer with name "${dto.name}" already exists on this server`),
        { status: 409 },
      );
    }

    const { privateKey, publicKey } = await this.keyService.generateKeyPair();
    const presharedKey = dto.presharedKey
      ? await this.keyService.generatePresharedKey()
      : null;

    const allowedIPs = await this.ipAllocator.allocate(
      server.address,
      serverId,
    );

    const peer = this.peerRepo.create({
      serverId,
      userId,
      name: dto.name,
      publicKey,
      privateKey,
      presharedKey,
      allowedIPs,
      persistentKeepalive: dto.persistentKeepalive ?? 25,
      dns: dto.dns ?? null,
      mtu: dto.mtu ?? null,
      clientAllowedIPs: dto.clientAllowedIPs ?? "0.0.0.0/0, ::/0",
      description: dto.description ?? null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      enabled: dto.enabled ?? true,
    });

    const saved = await this.peerRepo.save(peer);

    try {
      await this.rewriteServerConfig(serverId);
    } catch (err) {
      await this.peerRepo.delete(saved.id).catch(() => {});
      throw err;
    }

    // Применяем к активному интерфейсу, если он запущен и пир включён
    if (server.status === EWgServerStatus.UP && saved.enabled) {
      try {
        await this.cli.addPeer(
          server.interface,
          publicKey,
          allowedIPs,
          presharedKey ?? undefined,
          dto.persistentKeepalive,
        );
      } catch (err) {
        logger.warn({ err }, "[WgPeer] Could not add peer to live interface");
      }
    }

    this.eventBus.emit(new WgPeerCreatedEvent(saved.id, serverId, publicKey));

    return saved;
  }

  /** Обновить параметры пира и синхронизировать конфигурацию сервера. */
  async update(id: string, dto: IWgPeerUpdateRequestDto): Promise<WgPeer> {
    const peer = await this.getById(id);
    const oldEnabled = peer.enabled;

    if (dto.name && dto.name !== peer.name) {
      const nameConflict = await this.peerRepo.findOne({
        where: { serverId: peer.serverId, name: dto.name },
      });

      if (nameConflict) {
        throw Object.assign(
          new Error(
            `Peer with name "${dto.name}" already exists on this server`,
          ),
          { status: 409 },
        );
      }
    }

    let presharedKey = peer.presharedKey;

    if (dto.presharedKey === true) {
      presharedKey = await this.keyService.generatePresharedKey();
    } else if (dto.presharedKey === false || dto.presharedKey === null) {
      presharedKey = null;
    }

    const { presharedKey: _psk, ...rest } = dto;

    Object.assign(peer, {
      ...rest,
      presharedKey,
      expiresAt: dto.expiresAt
        ? new Date(dto.expiresAt)
        : dto.expiresAt === null
        ? null
        : peer.expiresAt,
    });

    const snapshot = { ...peer };
    const saved = await this.peerRepo.save(peer);

    try {
      await this.rewriteServerConfig(peer.serverId);
    } catch (err) {
      await this.peerRepo.save(snapshot).catch(() => {});
      throw err;
    }

    // Обрабатываем изменение presharedKey на активном интерфейсе
    if (dto.presharedKey !== undefined) {
      const server = await this.serverRepo.findOne({
        where: { id: peer.serverId },
      });

      if (server && server.status === EWgServerStatus.UP && peer.enabled) {
        await this.cli
          .addPeer(
            server.interface,
            peer.publicKey,
            peer.allowedIPs,
            peer.presharedKey ?? undefined,
            peer.persistentKeepalive ?? undefined,
          )
          .catch(() => {});
      }
    }

    if (dto.enabled === false && oldEnabled) {
      if (saved.status === EWgServerStatus.UP) {
        return this.stop(id);
      }
    } else if (dto.enabled === true && !oldEnabled) {
      return this.start(id);
    }

    return saved;
  }

  /** Удалить пир: убирает из live-интерфейса (если сервер запущен) и перезаписывает конфиг. */
  async delete(id: string): Promise<boolean> {
    const peer = await this.getById(id);
    const server = await this.serverRepo.findOne({
      where: { id: peer.serverId },
    });

    if (server && server.status === EWgServerStatus.UP) {
      await this.cli
        .removePeer(server.interface, peer.publicKey)
        .catch(() => {});
    }

    await this.peerRepo.delete(id);

    try {
      await this.rewriteServerConfig(peer.serverId);
    } catch (err) {
      await this.peerRepo.save(peer).catch(() => {});
      throw err;
    }

    this.eventBus.emit(
      new WgPeerDeletedEvent(id, peer.serverId, peer.publicKey),
    );

    return true;
  }

  /** Отключить пир (установить enabled = false). */
  async disable(id: string): Promise<WgPeer> {
    return this.update(id, { enabled: false });
  }

  /** Добавить включённый пир к live WireGuard-интерфейсу и установить статус UP. */
  async start(id: string): Promise<WgPeer> {
    const peer = await this.getById(id);

    if (!peer.enabled) {
      throw Object.assign(new Error("Peer is disabled"), { status: 400 });
    }

    const server = await this.serverRepo.findOne({
      where: { id: peer.serverId },
    });

    if (!server || server.status !== EWgServerStatus.UP) {
      throw Object.assign(new Error("Server is not running"), { status: 400 });
    }

    await this.cli
      .addPeer(
        server.interface,
        peer.publicKey,
        peer.allowedIPs,
        peer.presharedKey ?? undefined,
        peer.persistentKeepalive ?? undefined,
      )
      .catch(() => {});

    await this.peerRepo.update({ id: peer.id }, { status: EWgServerStatus.UP });
    peer.status = EWgServerStatus.UP;

    this.eventBus.emit(
      new WgPeerStatusChangedEvent(peer.id, peer.serverId, EWgServerStatus.UP),
    );

    return peer;
  }

  /** Удалить пир из live WireGuard-интерфейса и установить статус DOWN. */
  async stop(id: string): Promise<WgPeer> {
    const peer = await this.getById(id);
    const server = await this.serverRepo.findOne({
      where: { id: peer.serverId },
    });

    if (server && server.status === EWgServerStatus.UP) {
      await this.cli
        .removePeer(server.interface, peer.publicKey)
        .catch(() => {});
    }

    await this.peerRepo.update(
      { id: peer.id },
      { status: EWgServerStatus.DOWN },
    );
    peer.status = EWgServerStatus.DOWN;

    this.eventBus.emit(
      new WgPeerStatusChangedEvent(
        peer.id,
        peer.serverId,
        EWgServerStatus.DOWN,
      ),
    );

    return peer;
  }

  /** Назначить пир пользователю. */
  async assignToUser(id: string, userId: string): Promise<WgPeer> {
    await this.peerRepo.update(id, { userId });

    return this.getById(id);
  }

  /** Открепить пир от пользователя. */
  async revokeFromUser(id: string): Promise<WgPeer> {
    await this.peerRepo.update(id, { userId: null });

    return this.getById(id);
  }

  /**
   * Генерирует текст файла конфигурации .conf для данного пира
   */
  async buildClientConfig(id: string): Promise<string> {
    const peer = await this.peerRepo.findOne({
      where: { id },
      relations: ["server"],
    });

    if (!peer)
      throw Object.assign(new Error("Peer not found"), { status: 404 });

    const server = peer.server;
    const endpoint = server.endpoint;

    if (!endpoint) {
      throw Object.assign(
        new Error(
          "Server has no public endpoint configured. Set server.endpoint (e.g. vpn.example.com:51820) before generating client configs.",
        ),
        { status: 400 },
      );
    }

    return this.configService.buildClientConfig({
      privateKey: peer.privateKey,
      address: peer.allowedIPs,
      dns: peer.dns ?? server.dns ?? undefined,
      mtu: peer.mtu ?? server.mtu ?? undefined,
      serverPublicKey: server.publicKey,
      presharedKey: peer.presharedKey ?? undefined,
      serverEndpoint: endpoint,
      allowedIPs: peer.clientAllowedIPs,
      persistentKeepalive: peer.persistentKeepalive ?? undefined,
    });
  }

  /**
   * Генерирует PNG буфер QR-кода для клиентской конфигурации данного пира
   */
  async buildQrCode(id: string): Promise<Buffer> {
    const configText = await this.buildClientConfig(id);

    return this.configService.buildQrCode(configText);
  }

  /**
   * Отключает все пиры, у которых истёк срок expiresAt
   */
  async disableExpiredPeers(): Promise<number> {
    const expired = await this.peerRepo.findExpired();

    let count = 0;

    for (const peer of expired) {
      await this.disable(peer.id).catch(() => {});
      count += 1;
    }

    if (count > 0) {
      logger.info({ count }, "[WgPeer] Disabled expired peers");
    }

    return count;
  }

  private async rewriteServerConfig(serverId: string): Promise<void> {
    const server = await this.serverRepo.findOne({ where: { id: serverId } });

    if (!server) return;

    const peers = await this.peerRepo.findEnabledByServer(serverId);

    await this.serverService.writeConfig(server, peers);
  }
}
