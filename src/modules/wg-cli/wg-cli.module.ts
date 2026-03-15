import { Module } from "../../core";
import { WgCliService } from "./wg-cli.service";
import { WgConfigService } from "./wg-config.service";
import { WgKeyService } from "./wg-key.service";

@Module({
  providers: [WgCliService, WgKeyService, WgConfigService],
})
export class WgCliModule {}
