import { NotFoundException } from "@force-dev/utils";
import { inject } from "inversify";

import { EventBus, Injectable } from "../../core";
import { KeyBundleDto } from "./dto/encryption.dto";
import { DeviceRevokedEvent, PrekeysLowEvent } from "./events";
import { OneTimePreKeyRepository } from "./one-time-prekey.repository";
import { UserKeyRepository } from "./user-key.repository";

@Injectable()
export class EncryptionService {
  constructor(
    @inject(UserKeyRepository) private _keyRepo: UserKeyRepository,
    @inject(OneTimePreKeyRepository)
    private _preKeyRepo: OneTimePreKeyRepository,
    @inject(EventBus) private _eventBus: EventBus,
  ) {}

  async uploadKeys(
    userId: string,
    data: {
      deviceId: string;
      identityKey: string;
      signedPreKey: {
        id: number;
        publicKey: string;
        signature: string;
      };
      oneTimePreKeys: { id: number; publicKey: string }[];
    },
  ) {
    // Upsert user key
    let existing = await this._keyRepo.findByDevice(userId, data.deviceId);

    if (existing) {
      existing.identityKey = data.identityKey;
      existing.signedPreKeyId = data.signedPreKey.id;
      existing.signedPreKeyPublic = data.signedPreKey.publicKey;
      existing.signedPreKeySignature = data.signedPreKey.signature;
      existing.isActive = true;
      await this._keyRepo.save(existing);
    } else {
      existing = await this._keyRepo.createAndSave({
        userId,
        deviceId: data.deviceId,
        identityKey: data.identityKey,
        signedPreKeyId: data.signedPreKey.id,
        signedPreKeyPublic: data.signedPreKey.publicKey,
        signedPreKeySignature: data.signedPreKey.signature,
      });
    }

    // Upload one-time prekeys
    for (const pk of data.oneTimePreKeys) {
      const existingPk = await this._preKeyRepo.findOne({
        where: { userId, keyId: pk.id },
      });

      if (!existingPk) {
        await this._preKeyRepo.createAndSave({
          userId,
          keyId: pk.id,
          publicKey: pk.publicKey,
        });
      }
    }

    return existing;
  }

  async getKeyBundle(targetUserId: string): Promise<KeyBundleDto> {
    const keys = await this._keyRepo.findActiveKeys(targetUserId);

    if (keys.length === 0) {
      throw new NotFoundException(
        "Пользователь не имеет зарегистрированных ключей",
      );
    }

    const userKey = keys[0];
    const oneTimePreKey =
      await this._preKeyRepo.getNextAvailable(targetUserId);

    // Check remaining prekeys after consuming one
    if (oneTimePreKey) {
      const remainingCount =
        await this._preKeyRepo.countAvailable(targetUserId);

      if (remainingCount < 10) {
        this._eventBus.emit(
          new PrekeysLowEvent(targetUserId, remainingCount),
        );
      }
    }

    return {
      userId: targetUserId,
      deviceId: userKey.deviceId,
      identityKey: userKey.identityKey,
      signedPreKey: {
        id: userKey.signedPreKeyId,
        publicKey: userKey.signedPreKeyPublic,
        signature: userKey.signedPreKeySignature,
      },
      oneTimePreKey: oneTimePreKey
        ? { id: oneTimePreKey.keyId, publicKey: oneTimePreKey.publicKey }
        : null,
    };
  }

  async uploadPreKeys(
    userId: string,
    keys: { id: number; publicKey: string }[],
  ) {
    for (const pk of keys) {
      const existing = await this._preKeyRepo.findOne({
        where: { userId, keyId: pk.id },
      });

      if (!existing) {
        await this._preKeyRepo.createAndSave({
          userId,
          keyId: pk.id,
          publicKey: pk.publicKey,
        });
      }
    }

    return this._preKeyRepo.countAvailable(userId);
  }

  async revokeDevice(userId: string, deviceId: string) {
    const key = await this._keyRepo.findByDevice(userId, deviceId);

    if (key) {
      key.isActive = false;
      await this._keyRepo.save(key);

      this._eventBus.emit(new DeviceRevokedEvent(userId, deviceId));
    }
  }
}
