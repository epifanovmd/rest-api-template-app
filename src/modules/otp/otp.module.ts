import { Module } from "../../core/decorators/module.decorator";
import { OtpService } from "./otp.service";

@Module({
  providers: [OtpService],
})
export class OtpModule {}
