import { BaseRepository, InjectableRepository } from "../../core";
import { Biometric } from "./biometric.entity";

@InjectableRepository(Biometric)
export class BiometricRepository extends BaseRepository<Biometric> {
  async findById(id: string): Promise<Biometric | null> {
    return this.findOne({
      where: { id },
      relations: { user: true },
    });
  }

  async findByUserId(userId: string): Promise<Biometric[]> {
    return this.find({
      where: { userId },
      relations: { user: true },
    });
  }

  async findByUserIdAndDeviceId(
    userId: string,
    deviceId: string,
  ): Promise<Biometric | null> {
    return this.findOne({
      where: {
        userId,
        deviceId,
      },
      relations: { user: true },
    });
  }
}
