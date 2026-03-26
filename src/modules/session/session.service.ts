import { ForbiddenException, NotFoundException } from "@force-dev/utils";
import { inject } from "inversify";
import { Not } from "typeorm";

import { Injectable } from "../../core";
import { SessionDto } from "./session.dto";
import { SessionRepository } from "./session.repository";

@Injectable()
export class SessionService {
  constructor(
    @inject(SessionRepository) private _sessionRepo: SessionRepository,
  ) {}

  /** Создать новую сессию. */
  async createSession(data: {
    userId: string;
    refreshToken: string;
    deviceName?: string;
    deviceType?: string;
    ip?: string;
    userAgent?: string;
  }) {
    const session = await this._sessionRepo.createAndSave({
      userId: data.userId,
      refreshToken: data.refreshToken,
      deviceName: data.deviceName ?? null,
      deviceType: data.deviceType ?? null,
      ip: data.ip ?? null,
      userAgent: data.userAgent ?? null,
    });

    return SessionDto.fromEntity(session);
  }

  /** Получить все сессии пользователя. */
  async getSessions(userId: string) {
    const sessions = await this._sessionRepo.findByUserId(userId);

    return sessions.map(SessionDto.fromEntity);
  }

  /** Завершить конкретную сессию. */
  async terminateSession(sessionId: string, userId: string) {
    const session = await this._sessionRepo.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException("Сессия не найдена");
    }

    if (session.userId !== userId) {
      throw new ForbiddenException("Нет доступа к этой сессии");
    }

    await this._sessionRepo.delete({ id: sessionId });
  }

  /** Завершить все сессии, кроме текущей. */
  async terminateAllOther(userId: string, currentSessionId: string) {
    await this._sessionRepo.delete({
      userId,
      id: Not(currentSessionId),
    });
  }

  /** Найти сессию по refresh token. */
  async findByRefreshToken(refreshToken: string) {
    return this._sessionRepo.findByRefreshToken(refreshToken);
  }

  /** Обновить lastActiveAt для сессии. */
  async updateLastActive(sessionId: string) {
    await this._sessionRepo.update(sessionId, {
      lastActiveAt: new Date(),
    });
  }
}
