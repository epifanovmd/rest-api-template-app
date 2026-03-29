import { LessThan, MoreThan } from "typeorm";

import { BaseRepository, InjectableRepository } from "../../core";
import { PasskeyChallenge } from "./passkey-challenge.entity";

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 минут

@InjectableRepository(PasskeyChallenge)
export class PasskeyChallengeRepository extends BaseRepository<PasskeyChallenge> {
  async createChallenge(userId: string, challenge: string): Promise<PasskeyChallenge> {
    return this.createAndSave({
      userId,
      challenge,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    });
  }

  async findValidChallenge(userId: string): Promise<PasskeyChallenge | null> {
    return this.findOne({
      where: {
        userId,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: "DESC" },
    });
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.delete({ userId });
  }

  async deleteExpired(): Promise<void> {
    await this.delete({ expiresAt: LessThan(new Date()) });
  }
}
