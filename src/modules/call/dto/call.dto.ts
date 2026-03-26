import { BaseDto } from "../../../core/dto/BaseDto";
import { Call } from "../call.entity";
import { ECallStatus, ECallType } from "../call.types";

export class CallDto extends BaseDto {
  id: string;
  callerId: string;
  calleeId: string;
  chatId: string | null;
  type: ECallType;
  status: ECallStatus;
  startedAt: Date | null;
  endedAt: Date | null;
  duration: number | null;
  createdAt: Date;
  updatedAt: Date;
  caller?: {
    id: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  };
  callee?: {
    id: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  };

  constructor(entity: Call) {
    super(entity);

    this.id = entity.id;
    this.callerId = entity.callerId;
    this.calleeId = entity.calleeId;
    this.chatId = entity.chatId;
    this.type = entity.type;
    this.status = entity.status;
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
        avatarUrl: entity.caller.profile?.avatar?.url,
      };
    }

    if (entity.callee) {
      this.callee = {
        id: entity.callee.id,
        firstName: entity.callee.profile?.firstName,
        lastName: entity.callee.profile?.lastName,
        avatarUrl: entity.callee.profile?.avatar?.url,
      };
    }
  }

  static fromEntity(entity: Call) {
    return new CallDto(entity);
  }
}

export interface ICallHistoryDto {
  data: CallDto[];
  totalCount: number;
}
