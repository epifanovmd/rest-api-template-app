import { Module } from "../../core/decorators/module.decorator";
import { MailerService } from "./mailer.service";

@Module({
  providers: [MailerService],
})
export class MailerModule {}
