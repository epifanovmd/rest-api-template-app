export interface ISetSlowModeBody {
  seconds: number;
}

export interface IBanMemberBody {
  duration?: number;
  reason?: string;
}

export interface IBannedMemberDto {
  userId: string;
  chatId: string;
  reason?: string;
  bannedAt: Date;
  expiresAt?: Date;
}
