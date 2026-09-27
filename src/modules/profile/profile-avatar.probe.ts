import { inject } from "inversify";
import { In } from "typeorm";

import { Injectable } from "../../core";
import type { IFileUsageProbe } from "../file";
import { ProfileRepository } from "./profile.repository";

/** Файл — чей-то аватар: удалять его нельзя. */
@Injectable()
export class ProfileAvatarUsageProbe implements IFileUsageProbe {
  constructor(
    @inject(ProfileRepository) private readonly _profiles: ProfileRepository,
  ) {}

  async filesInUse(fileIds: string[]): Promise<string[]> {
    const profiles = await this._profiles.find({
      select: { avatarId: true },
      where: { avatarId: In(fileIds) },
    });

    return profiles.flatMap(p => (p.avatarId ? [p.avatarId] : []));
  }
}
