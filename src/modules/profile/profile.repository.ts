import { BaseRepository, InjectableRepository } from "../../core";
import { Profile } from "./profile.entity";

@InjectableRepository(Profile)
export class ProfileRepository extends BaseRepository<Profile> {
  async findById(id: string) {
    return this.findOne({
      where: { id },
      relations: {
        user: true,
        avatar: true,
      },
    });
  }

  async findByUserId(userId: string) {
    return this.findOne({
      where: { userId },
      relations: {
        user: true,
        avatar: true,
      },
    });
  }
}
