import { BaseRepository, InjectableRepository } from "../../core";
import { Passkey } from "./passkey.entity";

@InjectableRepository(Passkey)
export class PasskeyRepository extends BaseRepository<Passkey> {
  async findById(id: string): Promise<Passkey | null> {
    return this.findOne({
      where: { id },
      relations: { user: true },
    });
  }

  async findByUserId(userId: string): Promise<Passkey[]> {
    return this.find({
      where: { userId },
      relations: { user: true },
    });
  }

  async findByUserIdAndId(userId: string, id: string): Promise<Passkey | null> {
    return this.findOne({
      where: {
        userId,
        id,
      },
      relations: { user: true },
    });
  }
}
