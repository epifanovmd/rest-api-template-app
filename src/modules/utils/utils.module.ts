import { Module } from "../../core/decorators/module.decorator";
import { UtilsService } from "./utils.service";

@Module({
  providers: [UtilsService],
})
export class UtilsModule {}
