import { Module } from "../../core/decorators/module.decorator";
import { ResetPasswordTokensService } from "./reset-password-tokens.service";

@Module({
  providers: [ResetPasswordTokensService],
})
export class ResetPasswordTokensModule {}
