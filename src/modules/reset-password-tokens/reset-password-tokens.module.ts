import { Module } from "../../core/decorators/module.decorator";
import { ResetPasswordTokensRepository } from "./reset-password-tokens.repository";
import { ResetPasswordTokensService } from "./reset-password-tokens.service";

@Module({
  providers: [ResetPasswordTokensRepository, ResetPasswordTokensService],
})
export class ResetPasswordTokensModule {}
