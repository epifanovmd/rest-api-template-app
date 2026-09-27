import { BaseDto } from "../../../core/dto/BaseDto";
import { signedUrlOf, type TFileRef, type TSignedFiles } from "../../file";
import { Call } from "../call.entity";
import { ECallStatus, ECallType } from "../call.types";

/** Аватары участников звонков — для подписи пачкой перед сборкой DTO. */
export const collectCallFiles = (calls: ReadonlyArray<Call>): TFileRef[] =>
  calls.flatMap(call => [
    call.caller?.profile?.avatar,
    call.callee?.profile?.avatar,
  ]);

export class CallDto extends BaseDto {
  id: string;
  callerId: string;
  calleeId: string;
  chatId: string | null;
  type: ECallType;
  status: ECallStatus;
  ringingTimeoutAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  duration: number | null;
  createdAt: Date;
  updatedAt: Date;
  caller?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    avatarUrl?: string | null;
  };
  callee?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    avatarUrl?: string | null;
  };

  constructor(entity: Call, files: TSignedFiles) {
    super(entity);

    this.id = entity.id;
    this.callerId = entity.callerId;
    this.calleeId = entity.calleeId;
    this.chatId = entity.chatId;
    this.type = entity.type;
    this.status = entity.status;
    this.ringingTimeoutAt = entity.ringingTimeoutAt;
    this.startedAt = entity.startedAt;
    this.endedAt = entity.endedAt;
    this.duration = entity.duration;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;

    if (entity.caller) {
      this.caller = {
        id: entity.caller.id,
        firstName: entity.caller.profile?.firstName,
        lastName: entity.caller.profile?.lastName,
        avatarUrl: signedUrlOf(entity.caller.profile?.avatar, files),
      };
    }

    if (entity.callee) {
      this.callee = {
        id: entity.callee.id,
        firstName: entity.callee.profile?.firstName,
        lastName: entity.callee.profile?.lastName,
        avatarUrl: signedUrlOf(entity.callee.profile?.avatar, files),
      };
    }
  }

  static fromEntity(entity: Call, files: TSignedFiles) {
    return new CallDto(entity, files);
  }
}
