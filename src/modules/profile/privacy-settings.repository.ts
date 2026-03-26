import { InjectableRepository } from "../../core";
import { BaseRepository } from "../../core/repository/repository";
import { PrivacySettings } from "./privacy-settings.entity";

@InjectableRepository(PrivacySettings)
export class PrivacySettingsRepository extends BaseRepository<PrivacySettings> {
  async findByUserId(userId: string) {
    return this.findOne({ where: { userId } });
  }
}
