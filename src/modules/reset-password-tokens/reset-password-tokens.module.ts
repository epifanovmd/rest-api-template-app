import { Module } from "../../core";
import { ResetPasswordTokensRepository } from "./reset-password-tokens.repository";
import { ResetPasswordTokensService } from "./reset-password-tokens.service";

@Module({
  providers: [ResetPasswordTokensRepository, ResetPasswordTokensService],
})
export class ResetPasswordTokensModule {}
