import bcrypt from "bcrypt";
import { inject } from "inversify";

import { config, isDevelopment } from "../../config";
import { IBootstrap, Injectable, logger } from "../../core";
import { ChatService } from "../chat/chat.service";
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

const CONVERSATIONS: string[][] = [
  [
    "Привет! Как дела?",
    "Отлично, спасибо! А у тебя?",
    "Тоже хорошо. Что нового?",
    "Работаю над новым проектом, очень интересно",
    "Звучит круто! Расскажи подробнее",
    "Это мессенджер с offline-first кэшированием",
    "Wow, как в Telegram?",
    "Да, примерно так. MMKV для кэша, sync через websockets",
    "Впечатляет! Когда можно будет попробовать?",
    "Скоро, уже почти готово 🚀",
  ],
  [
    "Доброе утро!",
    "Доброе! Ты уже на работе?",
    "Да, пришёл пораньше. Много задач сегодня",
    "Понимаю. Удачи!",
    "Спасибо! Давай пообедаем вместе?",
    "С удовольствием! В 13:00?",
    "Идеально, встретимся в кафе",
  ],
  [
    "Видел новый фильм?",
    "Какой?",
    "Тот, про который все говорят",
    "Нет ещё. Стоит смотреть?",
    "Однозначно! Лучший в этом году",
  ],
  [
    "Помоги с багом пожалуйста",
    "Конечно, что случилось?",
    "Даты отображаются неправильно",
    "Проверь timezone. TypeORM может отдавать timestamp без Z",
    "Точно! Спасибо, починил",
    "Всегда пожалуйста 😊",
  ],
];

@Injectable()
export class SeedBootstrap implements IBootstrap {
  constructor(
    @inject(UserService) private readonly _userService: UserService,
    @inject(UserRepository) private readonly _userRepo: UserRepository,
    @inject(ProfileRepository) private readonly _profileRepo: ProfileRepository,
    @inject(ChatService) private readonly _chatService: ChatService,
    @inject(MessageService) private readonly _messageService: MessageService,
  ) {}

  async initialize(): Promise<void> {
    if (!isDevelopment) return;

    const hash = await bcrypt.hash(TEST_PASSWORD, SALT_ROUNDS);
    const userIds: string[] = [];

    // Create test users
    for (const u of TEST_USERS) {
      try {
        const user = await this._userService.createUser({
          email: u.email,
          username: u.username,
          passwordHash: hash,
          emailVerified: true,
        });

        // Update profile with name
        await this._profileRepo.update(
          { userId: user.id },
          { firstName: u.firstName, lastName: u.lastName },
        );

        userIds.push(user.id);
      } catch {
        // User already exists — find by email
        const existing = await this._userRepo.findByEmailOrPhone(u.email);

        if (existing) {
          userIds.push(existing.id);
        }
      }
    }

    if (userIds.length === 0) return;

    // Find admin user to create chats with
    const admin = await this._userRepo.findByEmailOrPhone(
      config.auth.admin.email,
    );

    if (!admin) return;

    const adminId = admin.id;
    let chatIndex = 0;

    for (const otherUserId of userIds) {
      if (otherUserId === adminId) continue;

      try {
        const chat = await this._chatService.createDirectChat(
          adminId,
          otherUserId,
        );

        // Send messages alternating between users
        const messages = CONVERSATIONS[chatIndex % CONVERSATIONS.length];

        for (const [idx, text] of messages.entries()) {
          const senderId = idx % 2 === 0 ? adminId : otherUserId;

          await this._messageService.sendMessage(chat.id, senderId, {
            type: EMessageType.TEXT,
            content: text,
          });
        }

        chatIndex += 1;
      } catch {
        // Chat already exists with messages — skip
      }
    }

    logger.info(
      { users: userIds.length, chats: chatIndex },
      "Seed data initialized",
    );
  }
}
