import { inject } from "inversify";

import { config, isDevelopment } from "../../config";
import { IBootstrap, Injectable, logger } from "../../core";
// message сам зависит от chat: импорт по файлам, не через barrel, — без цикла загрузки.
import { MessageService } from "../message/message.service";
import { EMessageType } from "../message/message.types";
import { UserRepository } from "../user";
import { ChatRepository } from "./chat.repository";
import { ChatService } from "./chat.service";
import { EChatType } from "./chat.types";

/** Демо-пользователи; создаёт их сид модуля user. */
export const SEED_USER_EMAILS = [
  "alice@test.local",
  "bob@test.local",
  "charlie@test.local",
] as const;

export const SEED_GROUP_NAME = "Проект: Мессенджер";

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

// ── Group Chat: Проект (индекс автора: 0 — admin, дальше SEED_USER_EMAILS) ──

const GROUP_CONVERSATION: Array<[number, string]> = [
  [0, "Всем привет! Создал чат для координации по проекту"],
  [1, "Привет! Рада присоединиться 😊"],
  [2, "Отлично, давно пора было"],
  [3, "Привет всем! 👋"],
  [
    0,
    "Итак, текущий статус. Бэкенд: sync система готова, receipts работают, unread counts денормализованы",
  ],
  [
    2,
    "По бэкенду: socket transport с circuit breaker и auto-join. Все health endpoints на месте",
  ],
  [
    1,
    "По фронту: ChatView нативный модуль почти готов. Swipe actions, replies, attachments — всё работает",
  ],
  [
    3,
    "Я закончил CI/CD. GitHub Actions: lint → test → build → deploy на staging",
  ],
  [0, "Отлично. Что у нас по приоритетам на эту неделю?"],
  [1, "Мне нужно добавить контекстное меню и inline-редактирование сообщений"],
  [2, "Я возьму rate limiting для socket events и batch markRead"],
  [
    3,
    "Могу помочь с Docker. Нужно оптимизировать Dockerfile — сейчас билд 3 минуты",
  ],
  [
    0,
    "Charlie, да, multi-stage build можно ускорить. Попробуй кэшировать node_modules слой отдельно",
  ],
  [
    3,
    "Уже делаю. Разделил на installer → builder → runner. Должно сократиться до минуты",
  ],
  [
    2,
    "Кстати, по базе данных — нужна миграция для новой таблицы message_receipts",
  ],
  [0, "Верно. Bob, сделай TypeORM миграцию. synchronize в проде выключен"],
  [2, "Ок. И ещё — нужно добавить индекс на (scope_id, version) в sync_logs"],
  [0, "Он уже есть: IDX_SYNC_SCOPE_VERSION"],
  [2, "А, точно, посмотрел — есть. Тогда всё ок"],
  [1, "Ребят, а что по тестированию? У нас есть e2e тесты?"],
  [0, "Пока только unit тесты на сервисы. E2E — следующий этап"],
  [3, "Могу настроить Playwright для web версии и Detox для mobile"],
  [0, "Давай начнём с Playwright — web проще для CI"],
  [1, "Согласна. Мобильные e2e можно добавить позже"],
  [
    2,
    "По мне — unit тесты важнее. У нас покрытие message.service.ts только 60%",
  ],
  [0, "Согласен. Bob, добери покрытие до 80% на этой неделе"],
  [2, "Сделаю. Начну с markAsRead и markAsDelivered — там сложная логика"],
  [
    3,
    "Я добавлю coverage report в CI. Будет блокировать PR если покрытие упадёт",
  ],
  [0, "Отличный план. Созвон в пятницу в 15:00 — обсудим результаты"],
  [1, "Подходит 👍"],
  [2, "+1"],
  [3, "Буду"],
];

/**
 * Демо-данные мессенджера (только development): личные чаты админа с alice
 * и bob и групповой чат на четверых. Пользователей создают сиды user —
 * здесь они ищутся по email; нет кого-то — соответствующий чат пропускается.
 * Повторный запуск ничего не дублирует: чат с сообщениями не трогается.
 */
@Injectable()
export class ChatSeedBootstrap implements IBootstrap {
  readonly critical = false;

  constructor(
    @inject(UserRepository) private readonly _userRepo: UserRepository,
    @inject(ChatService) private readonly _chatService: ChatService,
    @inject(ChatRepository) private readonly _chatRepo: ChatRepository,
    @inject(MessageService) private readonly _messageService: MessageService,
  ) {}

  async initialize(): Promise<void> {
    if (!isDevelopment) return;

    await this.seed();
  }

  /** Сид без проверки окружения. */
  async seed(): Promise<void> {
    const admin = await this._userRepo.findByEmail(config.auth.admin.email);

    if (!admin) {
      logger.warn("[ChatSeed] Администратор не найден — сид пропущен");

      return;
    }

    const [alice, bob, charlie] = await Promise.all(
      SEED_USER_EMAILS.map(email => this._userRepo.findByEmail(email)),
    );

    if (alice) await this._seedDirect(admin.id, alice.id, CHAT_ALICE);
    if (bob) await this._seedDirect(admin.id, bob.id, CHAT_BOB);

    if (alice && bob && charlie) {
      await this._seedGroup([admin.id, alice.id, bob.id, charlie.id]);
    }

    logger.info("[ChatSeed] Демо-чаты готовы");
  }

  private async _seedDirect(
    adminId: string,
    otherUserId: string,
    messages: string[],
  ): Promise<void> {
    const chat = await this._chatService.createDirectChat(adminId, otherUserId);

    if (await this._hasMessages(chat.id)) return;

    for (const [idx, text] of messages.entries()) {
      await this._send(chat.id, idx % 2 === 0 ? adminId : otherUserId, text);
    }
  }

  /** `participantIds[0]` — владелец (админ). */
  private async _seedGroup(participantIds: string[]): Promise<void> {
    const [ownerId, ...memberIds] = participantIds;
    const existing = await this._chatRepo.findOne({
      where: {
        name: SEED_GROUP_NAME,
        type: EChatType.GROUP,
        createdById: ownerId,
      },
    });

    if (existing && (await this._hasMessages(existing.id))) return;

    const chatId =
      existing?.id ??
      (
        await this._chatService.createGroupChat(
          ownerId,
          SEED_GROUP_NAME,
          memberIds,
        )
      ).id;

    for (const [authorIdx, text] of GROUP_CONVERSATION) {
      await this._send(chatId, participantIds[authorIdx] ?? ownerId, text);
    }
  }

  private async _send(chatId: string, senderId: string, content: string) {
    await this._messageService.sendMessage(chatId, senderId, {
      type: EMessageType.TEXT,
      content,
    });
  }

  private async _hasMessages(chatId: string): Promise<boolean> {
    return !!(
      await this._chatRepo.findOne({
        where: { id: chatId },
        select: { id: true, lastMessageId: true },
      })
    )?.lastMessageId;
  }
}
