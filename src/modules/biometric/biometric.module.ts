import { Module } from "../../core/decorators/module.decorator";
import { BiometricController } from "./biometric.controller";
import { BiometricService } from "./biometric.service";

@Module({
  providers: [BiometricController, BiometricService],
})
export class BiometricModule {}
