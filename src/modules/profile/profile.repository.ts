import { Repository } from "typeorm";

import { IDataSource, Injectable } from "../../core";
import { Profile } from "./profile.entity";

@Injectable()
export class ProfileRepository {
  private repository: Repository<Profile>;

  constructor(@IDataSource() private dataSource: IDataSource) {
    this.repository = this.dataSource.getRepository(Profile);
  }

  async findById(id: string): Promise<Profile | null> {
    return this.repository.findOne({
      where: { id },
      relations: {
        user: true,
        avatar: true,
      },
    });
  }

  async findByUserId(userId: string): Promise<Profile | null> {
    return this.repository.findOne({
      where: { userId },
      relations: {
        user: true,
        avatar: true,
      },
    });
  }

  async create(profileData: Partial<Profile>): Promise<Profile> {
    const profile = this.repository.create(profileData);

    return this.repository.save(profile);
  }

  async update(
    userId: string,
    updateData: Partial<Profile>,
  ): Promise<Profile | null> {
    const profile = await this.findByUserId(userId);

    if (!profile) {
      return null;
    }

    Object.assign(profile, updateData);

    return this.repository.save(profile);
  }

  async delete(userId: string): Promise<boolean> {
    const result = await this.repository.delete({ userId });

    return (result.affected || 0) > 0;
  }

  async save(profile: Profile): Promise<Profile> {
    return this.repository.save(profile);
  }
}
