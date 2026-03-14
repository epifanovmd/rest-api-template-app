import { Module } from "../../core/decorators/module.decorator";
import { OtpRepository } from "./otp.repository";
import { OtpService } from "./otp.service";

@Module({
  providers: [OtpRepository, OtpService],
})
export class OtpModule {}
