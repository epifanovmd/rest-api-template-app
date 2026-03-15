import { inject } from "inversify";

import { config } from "../../config";
import { IBootstrap, Injectable, logger } from "../../core";
import { WgPeerRepository } from "../wg-peer";
import { WgServerRepository } from "./wg-server.repository";
import { WgServerService } from "./wg-server.service";

@Injectable()
export class WgServerBootstrap implements IBootstrap {
  constructor(
    @inject(WgServerRepository)
    private readonly serverRepo: WgServerRepository,
    @inject(WgServerService)
    private readonly serverService: WgServerService,
    @inject(WgPeerRepository)
    private readonly peerRepo: WgPeerRepository,
  ) {}

  async initialize(): Promise<void> {
    await this.syncConfigs();

    const existing = await this.serverRepo.findOne({
      where: { interface: "wg0" },
    });

    if (existing) {
      return;
    }

    const endpoint = `${config.server.publicHost}:51820`;

    await this.serverService.create({
      name: "Default Server",
      interface: "wg0",
      listenPort: 51820,
      address: "10.0.0.1/24",
      dns: "1.1.1.1,8.8.8.8",
      endpoint,
    });

    logger.info("[WgServerBootstrap] Default wg0 server created");
  }

  private async syncConfigs(): Promise<void> {
    const servers = await this.serverRepo.find();

    for (const server of servers) {
      const peers = await this.peerRepo.findEnabledByServer(server.id);

      try {
        await this.serverService.writeConfig(server, peers);
        logger.info(
          { serverId: server.id, interface: server.interface },
          "[WgServerBootstrap] Config synced from DB",
        );
      } catch (err) {
        logger.error(
          { err, serverId: server.id, interface: server.interface },
          "[WgServerBootstrap] Failed to sync config",
        );
      }
    }
  }
}
