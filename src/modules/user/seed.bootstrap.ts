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
];

// ── Direct Chat 1: Admin ↔ Alice ─────────────────────────────────────

const CHAT_ALICE: string[] = [
  "Привет, Alice! Как продвигается работа над компонентами?",
  "Привет! Вчера закончила ChatView — нативный модуль на Swift",
  "Отлично. Какие основные фичи реализовала?",
  "Кастомные ячейки, swipe actions, reply preview, attachment carousel",
  "А как с производительностью? На больших списках не тормозит?",
  "Нет, использую UICollectionView с DiffableDataSource. Smooth scroll даже на 10k сообщений",
  "Круто. А анимации переходов?",
  "Spring animations при открытии клавиатуры, fade для новых сообщений, bounce для reactions",
  "Нужно будет добавить поддержку голосовых сообщений",
  "Уже начала. Waveform visualization через AudioEngine, запись через AVAudioRecorder",
  "Какой формат используешь?",
  "AAC в контейнере M4A. Лёгкий, хорошее качество, нативная поддержка на обеих платформах",
  "А что по размеру файла?",
  "Примерно 12KB на секунду при битрейте 64kbps. Минутное сообщение — 720KB",
  "Приемлемо. А прогресс загрузки показываешь?",
  "Да, через NSURLSession с delegate. Показываю процент + скорость + оставшееся время",
  "А если сеть пропала во время загрузки?",
  "Automatic retry через background URLSession. iOS сам переподключит когда сеть вернётся",
  "Надо ещё добавить контекстное меню — long press на сообщение",
  "Это следующая задача. Планирую UIContextMenuConfiguration с preview provider",
  "Хорошо. Сколько времени нужно на контекстное меню?",
  "Два-три дня. Основная работа — haptic feedback и анимации",
  "Ок, жду. И ещё — добавь поддержку Dark Mode",
  "Уже есть! Все цвета через semantic colors, автоматически переключаются",
  "Отлично. Тогда после контекстного меню займёмся inline-редактированием сообщений",
  "Договорились. Скину PR с контекстным меню к пятнице",
];

// ── Direct Chat 2: Admin ↔ Bob ──────────────────────────────────────

const CHAT_BOB: string[] = [
  "Bob, как дела с бэкендом?",
  "Привет! Закончил систему синхронизации",
  "Расскажи подробнее. Как работает sync?",
  "Append-only sync log с auto-increment version. Клиент хранит курсор и тянет изменения",
  "А компактификация?",
  "Трёхуровневая: write-time DELETE при каждой записи, DISTINCT ON при чтении, фоновый cleanup раз в 6 часов",
  "Неплохо. А что с масштабируемостью?",
  "scope_id вместо chat_id — generic. Завтра добавим folders или teams — одна строка в _collectUserScopeIds",
  "А push-уведомления о новых изменениях?",
  "sync:available через socket. Дебаунсится на клиенте 300ms, потом pull",
  "Что если клиент был offline месяц?",
  "requiresSnapshot: true — клиент сбрасывает версию и загружает данные через обычные API",
  "А retention?",
  "90 дней. Cleanup каждые 24 часа. Записи старше 90 дней удаляются",
  "Как обрабатываешь unread counts?",
  "Денормализованный счётчик в chat_members. Атомарный INCREMENT при новом сообщении, декремент при markAsRead",
  "А если сообщение удалили?",
  "decrementUnreadForDeletedMessage — проверяет lastReadMessageId через COALESCE, декрементирует только у тех кто не читал",
  "Что по message receipts?",
  "Отдельная таблица message_receipts. Per-user статус: SENT → DELIVERED → READ. Только вперёд, через ON CONFLICT с CASE",
  "А в группах?",
  "receiptSummary: { delivered: 3, read: 1, total: 5 }. Отправляется в message:status через socket",
  "Круто. Что ещё нужно доделать?",
  "Rate limiting на socket events. Сейчас клиент может слать 1000 markRead в секунду",
  "Да, это важно. Добавь throttle на сервере",
  "Сделаю. Ещё хочу добавить batch markRead — один запрос вместо N отдельных",
  "Согласен. И добавь метрики — сколько sync запросов в секунду, средняя латентность",
  "Prometheus + Grafana?",
  "Да. prom-client для Node.js, стандартные метрики + кастомные",
  "Займусь после rate limiting. Ориентировочно к среде",
];

// ── Group Chat: Проект ──────────────────────────────────────────────

const GROUP_CONVERSATION: Array<[number, string]> = [
  [0, "Всем привет! Создал чат для координации по проекту"],
  [1, "Привет! Рада присоединиться 😊"],
  [2, "Отлично, давно пора было"],
  [3, "Привет всем! 👋"],
  [0, "Итак, текущий статус. Бэкенд: sync система готова, receipts работают, unread counts денормализованы"],
  [2, "По бэкенду: socket transport с circuit breaker и auto-join. Все health endpoints на месте"],
  [1, "По фронту: ChatView нативный модуль почти готов. Swipe actions, replies, attachments — всё работает"],
  [3, "Я закончил CI/CD. GitHub Actions: lint → test → build → deploy на staging"],
  [0, "Отлично. Что у нас по приоритетам на эту неделю?"],
  [1, "Мне нужно добавить контекстное меню и inline-редактирование сообщений"],
  [2, "Я возьму rate limiting для socket events и batch markRead"],
  [3, "Могу помочь с Docker. Нужно оптимизировать Dockerfile — сейчас билд 3 минуты"],
  [0, "Charlie, да, multi-stage build можно ускорить. Попробуй кэшировать node_modules слой отдельно"],
  [3, "Уже делаю. Разделил на installer → builder → runner. Должно сократиться до минуты"],
  [2, "Кстати, по базе данных — нужна миграция для новой таблицы message_receipts"],
  [0, "Верно. Bob, сделай TypeORM миграцию. synchronize в проде выключен"],
  [2, "Ок. И ещё — нужно добавить индекс на (scope_id, version) в sync_logs"],
  [0, "Он уже есть: IDX_SYNC_SCOPE_VERSION"],
  [2, "А, точно, посмотрел — есть. Тогда всё ок"],
  [1, "Ребят, а что по тестированию? У нас есть e2e тесты?"],
  [0, "Пока только unit тесты на сервисы. E2E — следующий этап"],
  [3, "Могу настроить Playwright для web версии и Detox для mobile"],
  [0, "Давай начнём с Playwright — web проще для CI"],
  [1, "Согласна. Мобильные e2e можно добавить позже"],
  [2, "По мне — unit тесты важнее. У нас покрытие message.service.ts только 60%"],
  [0, "Согласен. Bob, добери покрытие до 80% на этой неделе"],
  [2, "Сделаю. Начну с markAsRead и markAsDelivered — там сложная логика"],
  [3, "Я добавлю coverage report в CI. Будет блокировать PR если покрытие упадёт"],
  [0, "Отличный план. Созвон в пятницу в 15:00 — обсудим результаты"],
  [1, "Подходит 👍"],
  [2, "+1"],
  [3, "Буду"],
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
    const others = userIds.filter(id => id !== adminId);

    // 2 direct чата: admin ↔ alice, admin ↔ bob
    if (others[0]) await this._seedChat(adminId, others[0], CHAT_ALICE);
    if (others[1]) await this._seedChat(adminId, others[1], CHAT_BOB);

    // 1 групповой чат: admin + alice + bob + charlie
    if (others.length >= 2) {
      await this._seedGroupChat(adminId, others);
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

  private async _seedChat(
    adminId: string,
    otherUserId: string,
    messages: string[],
  ): Promise<void> {
    const chat = await this._chatService.createDirectChat(adminId, otherUserId);

    if (await this._chatHasMessages(chat.id)) return;

    for (const [idx, text] of messages.entries()) {
      const senderId = idx % 2 === 0 ? adminId : otherUserId;

      await this._messageService.sendMessage(chat.id, senderId, {
        type: EMessageType.TEXT,
        content: text,
      });
    }
  }

  private async _seedGroupChat(
    adminId: string,
    memberIds: string[],
  ): Promise<void> {
    const existing = await this._chatRepo.findOne({
      where: { name: "Проект: Мессенджер", type: EChatType.GROUP },
    });

    if (existing && (await this._chatHasMessages(existing.id))) return;

    const chat = existing
      ? existing
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
    const count = await this._messageRepo.count({ where: { chatId } });

    return count > 0;
  }
}
