import { Module } from "../../core";
import { MailerService } from "./mailer.service";

@Module({
  providers: [MailerService],
})
export class MailerModule {}
