import { Module } from "../../core";
import { UtilsService } from "./utils.service";

@Module({
  providers: [UtilsService],
})
export class UtilsModule {}
