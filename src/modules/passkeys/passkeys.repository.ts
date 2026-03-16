import { BaseRepository, InjectableRepository } from "../../core";
import { Passkey } from "./passkey.entity";

@InjectableRepository(Passkey)
export class PasskeysRepository extends BaseRepository<Passkey> {
  async findById(id: string): Promise<Passkey | null> {
    return this.findOne({ where: { id } });
  }

  async findByUserId(userId: string): Promise<Passkey[]> {
    return this.find({ where: { userId } });
  }

  async findByUserIdAndId(userId: string, id: string): Promise<Passkey | null> {
    return this.findOne({ where: { userId, id } });
  }
}
