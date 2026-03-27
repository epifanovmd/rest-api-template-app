import { ForbiddenException, NotFoundException } from "@force-dev/utils";
import { inject } from "inversify";
import { Not } from "typeorm";

import { EventBus, Injectable } from "../../core";
import { SessionTerminatedEvent } from "./events";
import { SessionDto } from "./session.dto";
import { SessionRepository } from "./session.repository";

@Injectable()
export class SessionService {
  constructor(
    @inject(SessionRepository) private _sessionRepo: SessionRepository,
    @inject(EventBus) private _eventBus: EventBus,
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

    this._eventBus.emit(new SessionTerminatedEvent(sessionId, userId));
  }

  /** Завершить все сессии, кроме текущей. */
  async terminateAllOther(userId: string, currentSessionId: string) {
    const sessions = await this._sessionRepo.find({
      where: { userId, id: Not(currentSessionId) },
      select: ["id"],
    });

    await this._sessionRepo.delete({
      userId,
      id: Not(currentSessionId),
    });

    for (const session of sessions) {
      this._eventBus.emit(new SessionTerminatedEvent(session.id, userId));
    }
  }

  /** Завершить все сессии пользователя. */
  async terminateAllByUser(userId: string) {
    const sessions = await this._sessionRepo.find({
      where: { userId },
      select: ["id"],
    });

    await this._sessionRepo.delete({ userId });

    for (const session of sessions) {
      this._eventBus.emit(new SessionTerminatedEvent(session.id, userId));
    }
  }

  /** Найти сессию по refresh token. */
  async findByRefreshToken(refreshToken: string) {
    return this._sessionRepo.findByRefreshToken(refreshToken);
  }

  /** Обновить refreshToken и lastActiveAt для сессии. */
  async updateRefreshToken(sessionId: string, newRefreshToken: string) {
    await this._sessionRepo.update(sessionId, {
      refreshToken: newRefreshToken,
      lastActiveAt: new Date(),
    });
  }

  /** Обновить lastActiveAt для сессии. */
  async updateLastActive(sessionId: string) {
    await this._sessionRepo.update(sessionId, {
      lastActiveAt: new Date(),
    });
  }
}
