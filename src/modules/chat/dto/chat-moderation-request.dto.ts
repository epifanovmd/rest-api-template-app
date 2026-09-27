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
  /** Кто забанил (null — пользователь удалён). */
  bannedBy: string | null;
  reason: string | null;
  bannedAt: Date;
  /** null — бессрочный бан. */
  expiresAt: Date | null;
}
