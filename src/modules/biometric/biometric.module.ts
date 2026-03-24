import { Module } from "../../core";
import { BiometricController } from "./biometric.controller";
import { BiometricRepository } from "./biometric.repository";
import { BiometricService } from "./biometric.service";

@Module({
  providers: [BiometricRepository, BiometricController, BiometricService],
})
export class BiometricModule {}
