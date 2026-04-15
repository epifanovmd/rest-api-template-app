import bcrypt from "bcrypt";
import { inject } from "inversify";

import { config, isDevelopment } from "../../config";
import { IBootstrap, Injectable, logger } from "../../core";
import { ChatRepository } from "../chat/chat.repository";
import { ChatService } from "../chat/chat.service";
import { EChatType } from "../chat/chat.types";
import { MessageRepository } from "../message/message.repository";
import { MessageService } from "../message/message.service";
import { EMessageType } from "../message/message.types";
import { ProfileRepository } from "../profile/profile.repository";
import { UserRepository } from "./user.repository";
import { UserService } from "./user.service";

const TEST_PASSWORD = "test1234";
const SALT_ROUNDS = 12;

const TEST_USERS = [
  {
    email: "alice@test.local",
    username: "alice",
    firstName: "Alice",
    lastName: "Johnson",
  },
  {
    email: "bob@test.local",
    username: "bob",
    firstName: "Bob",
    lastName: "Smith",
  },
  {
    email: "charlie@test.local",
    username: "charlie",
    firstName: "Charlie",
    lastName: "Brown",
  },
  {
    email: "diana@test.local",
    username: "diana",
    firstName: "Diana",
    lastName: "Prince",
  },
  {
    email: "eve@test.local",
    username: "eve",
    firstName: "Eve",
    lastName: "Adams",
  },
];

/** Диалоги для direct чатов (admin ↔ user). Индекс чётный = admin, нечётный = user. */
const DIRECT_CONVERSATIONS: string[][] = [
  [
    "Привет! Как дела?",
    "Отлично, спасибо! А у тебя?",
    "Тоже хорошо. Работаю над новым проектом",
    "Что за проект?",
    "Мессенджер с offline-first кэшированием, MMKV + WebSocket sync",
    "Как в Telegram? Звучит серьёзно",
    "Да, примерно. Уже есть read receipts, очереди, компактификация sync лога",
    "Впечатляет! Когда можно будет попробовать?",
    "Через пару недель будет бета. Скину ссылку",
    "Жду! 🚀",
  ],
  [
    "Доброе утро! Ты видел задачу в Linear?",
    "Доброе! Да, взял в работу",
    "Отлично. Дедлайн в пятницу, успеваешь?",
    "Должен успеть. Основная часть готова, осталось тесты написать",
    "Хорошо. Если что — пиши, помогу с ревью",
    "Спасибо! Скину PR сегодня вечером",
    "Договорились 👍",
  ],
  [
    "Помоги с багом, пожалуйста",
    "Конечно, что случилось?",
    "Даты отображаются неправильно. UTC вместо локального времени",
    "Проверь timezone в TypeORM конфиге. Он может отдавать timestamp без Z",
    "Точно! Было type: 'timestamp', поменял на 'timestamptz'. Починилось",
    "Классика. Всегда используй timestamptz для дат 😊",
    "Запомню. А ещё нашёл проблему с кэшем — stale data после reconnect",
    "Это потому что sync version не обновлялась. Добавь await перед emit events",
    "Сработало! Спасибо огромное",
    "Всегда пожалуйста",
  ],
  [
    "Привет! Видела твой доклад на митапе",
    "О, привет! Как тебе?",
    "Очень интересно! Особенно часть про WebSocket reconnection",
    "Спасибо! Это как раз то, над чем я сейчас работаю",
    "Circuit breaker для auth ошибок — отличная идея",
    "Да, без него был бесконечный цикл auth_error → restore → auth_error",
    "Знакомо 😄 У нас было то же самое год назад",
    "Как решили?",
    "Точно так же — cooldown после N неудачных попыток",
  ],
];

/** Сообщения для группового чата. Формат: [userIndex, text]. */
const GROUP_CONVERSATION: Array<[number, string]> = [
  [0, "Всем привет! Создал чат для обсуждения проекта"],
  [1, "Привет! Рад присоединиться"],
  [2, "О, наконец-то! Давно пора было"],
  [3, "Привет всем! 👋"],
  [0, "Итак, первый вопрос: какой стек берём?"],
  [1, "React Native + TypeScript, без вариантов"],
  [2, "Согласен. Плюс MobX для стейта"],
  [3, "А бэкенд?"],
  [0, "Node.js + TypeORM + PostgreSQL. Socket.IO для real-time"],
  [1, "Inversify для DI?"],
  [0, "Да, уже настроен. Модульная архитектура"],
  [2, "Отлично. А что с CI/CD?"],
  [3, "Могу настроить GitHub Actions. Lint + тесты + сборка"],
  [0, "Было бы супер. Ещё нужен деплой на staging"],
  [1, "Могу помочь с Docker + nginx"],
  [2, "Ребят, а что по срокам?"],
  [0, "MVP через месяц. Чат + авторизация + базовый функционал"],
  [3, "Реалистично. Я начну с CI сегодня"],
  [1, "А я возьму авторизацию и JWT"],
  [2, "Мне остаётся UI. Начну с navigation и chat screen"],
  [0, "Отличный план! Созвон завтра в 10:00?"],
  [1, "Подходит"],
  [2, "Ок 👍"],
  [3, "+1"],
];

@Injectable()
export class SeedBootstrap implements IBootstrap {
  constructor(
    @inject(UserService) private readonly _userService: UserService,
    @inject(UserRepository) private readonly _userRepo: UserRepository,
    @inject(ProfileRepository) private readonly _profileRepo: ProfileRepository,
    @inject(ChatService) private readonly _chatService: ChatService,
    @inject(ChatRepository) private readonly _chatRepo: ChatRepository,
    @inject(MessageService) private readonly _messageService: MessageService,
    @inject(MessageRepository) private readonly _messageRepo: MessageRepository,
  ) {}

  async initialize(): Promise<void> {
    if (!isDevelopment) return;

    const hash = await bcrypt.hash(TEST_PASSWORD, SALT_ROUNDS);
    const userIds = await this._ensureTestUsers(hash);

    if (userIds.length === 0) return;

    const admin = await this._userRepo.findByEmailOrPhone(
      config.auth.admin.email,
    );

    if (!admin) return;

    const adminId = admin.id;

    // Direct чаты: admin ↔ каждый test user
    await this._seedDirectChats(adminId, userIds);

    // Групповой чат: admin + первые 3 test user
    const groupMembers = userIds.filter(id => id !== adminId).slice(0, 3);

    if (groupMembers.length >= 2) {
      await this._seedGroupChat(adminId, groupMembers, userIds);
    }

    logger.info("Seed data initialized");
  }

  // ── Private ──────────────────────────────────────────────────────

  private async _ensureTestUsers(passwordHash: string): Promise<string[]> {
    const userIds: string[] = [];

    for (const u of TEST_USERS) {
      const existing = await this._userRepo.findByEmailOrPhone(u.email);

      if (existing) {
        userIds.push(existing.id);
        continue;
      }

      try {
        const user = await this._userService.createUser({
          email: u.email,
          username: u.username,
          passwordHash,
          emailVerified: true,
        });

        await this._profileRepo.update(
          { userId: user.id },
          { firstName: u.firstName, lastName: u.lastName },
        );

        userIds.push(user.id);
      } catch (err) {
        logger.warn({ err, email: u.email }, "Failed to create test user");
      }
    }

    return userIds;
  }

  private async _seedDirectChats(
    adminId: string,
    userIds: string[],
  ): Promise<void> {
    let conversationIdx = 0;

    for (const otherUserId of userIds) {
      if (otherUserId === adminId) continue;

      const chat = await this._chatService.createDirectChat(
        adminId,
        otherUserId,
      );

      // Проверяем: есть ли уже сообщения в этом чате
      const hasMessages = await this._chatHasMessages(chat.id);

      if (hasMessages) {
        conversationIdx += 1;
        continue;
      }

      const messages =
        DIRECT_CONVERSATIONS[conversationIdx % DIRECT_CONVERSATIONS.length];

      for (const [idx, text] of messages.entries()) {
        const senderId = idx % 2 === 0 ? adminId : otherUserId;

        await this._messageService.sendMessage(chat.id, senderId, {
          type: EMessageType.TEXT,
          content: text,
        });
      }

      conversationIdx += 1;
    }
  }

  private async _seedGroupChat(
    adminId: string,
    memberIds: string[],
    allUserIds: string[],
  ): Promise<void> {
    // Проверяем: есть ли уже групповой чат с таким именем
    const existingGroup = await this._chatRepo.findOne({
      where: { name: "Проект: Мессенджер", type: EChatType.GROUP },
    });

    if (existingGroup) {
      const hasMessages = await this._chatHasMessages(existingGroup.id);

      if (hasMessages) return;
    }

    const chat = existingGroup
      ? existingGroup
      : await this._chatService.createGroupChat(
          adminId,
          "Проект: Мессенджер",
          memberIds,
        );

    const chatId =
      typeof chat === "string"
        ? chat
        : "id" in chat
        ? chat.id
        : (chat as any).id;

    // Маппинг индексов из GROUP_CONVERSATION → реальные userId
    // 0 = admin, 1-3 = memberIds[0-2]
    const participantIds = [adminId, ...memberIds];

    for (const [userIndex, text] of GROUP_CONVERSATION) {
      const senderId = participantIds[userIndex] ?? adminId;

      await this._messageService.sendMessage(chatId, senderId, {
        type: EMessageType.TEXT,
        content: text,
      });
    }
  }

  private async _chatHasMessages(chatId: string): Promise<boolean> {
    const count = await this._messageRepo.count({
      where: { chatId },
    });

    return count > 0;
  }
}
