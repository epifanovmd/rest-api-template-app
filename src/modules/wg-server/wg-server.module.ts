import { Module } from "../../core";
import { WgServerBootstrap } from "./wg-server.bootstrap";
import { WgServerController } from "./wg-server.controller";
import { WgServerRepository } from "./wg-server.repository";
import { WgServerService } from "./wg-server.service";

@Module({
  providers: [WgServerRepository, WgServerService, WgServerController],
  bootstrappers: [WgServerBootstrap],
})
export class WgServerModule {}
