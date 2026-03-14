import { Module } from "../../core/decorators/module.decorator";
import { BiometricController } from "./biometric.controller";
import { BiometricRepository } from "./biometric.repository";
import { BiometricService } from "./biometric.service";

@Module({
  providers: [BiometricRepository, BiometricController, BiometricService],
})
export class BiometricModule {}
