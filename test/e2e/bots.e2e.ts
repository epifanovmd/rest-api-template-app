import { expect } from "chai";

import { Actor, call, expectStatus, signUp } from "./client";

describe("мессенджер: боты и устройства", () => {
  let alice: Actor;
  let bob: Actor;

  before(async () => {
    alice = await signUp("b-alice", { firstName: "Alice" });
    bob = await signUp("b-bob", { firstName: "Bob" });
  });

  describe("боты", () => {
    it("жизненный цикл бота и bot-API", async () => {
      const username = `helper_${Date.now().toString(36)}_bot`;
      const bot = expectStatus(
        await call(alice, "POST", "/api/v1/bot", {
          username,
          displayName: "Helper",
          description: "тестовый",
        }),
        201,
      );
      const botId = bot.data.id;
      const group = expectStatus(
        await call(alice, "POST", "/api/v1/chat/group", {
          name: "С ботом",
          memberIds: [bob.id],
        }),
        201,
      );
      const chatId = group.data.id;

      expectStatus(await call(alice, "GET", "/api/v1/bot"), 200);
      expectStatus(await call(alice, "GET", `/api/v1/bot/${botId}`), 200);
      expectStatus(await call(bob, "GET", `/api/v1/bot/${botId}`), [403, 404]);
      expectStatus(
        await call(alice, "PATCH", `/api/v1/bot/${botId}`, {
          displayName: "Helper 2",
        }),
        200,
      );
      expectStatus(
        await call(alice, "POST", `/api/v1/bot/${botId}/commands`, {
          commands: [{ command: "start", description: "Начать" }],
        }),
        200,
      );
      expectStatus(
        await call(alice, "GET", `/api/v1/bot/${botId}/commands`),
        200,
      );

      const rotated = expectStatus(
        await call(alice, "POST", `/api/v1/bot/${botId}/token`),
        200,
      );
      const token = rotated.data.token;

      expectStatus(
        await call(
          bot.data.token,
          "POST",
          "/api/v1/bot-api/message",
          { chatId, content: "hi" },
          { scheme: "Bot" },
        ),
        401,
        "BOT_INVALID_TOKEN",
      );
      expectStatus(
        await call(
          token,
          "POST",
          "/api/v1/bot-api/message",
          { chatId, content: "hi" },
          { scheme: "Bot" },
        ),
        403,
      );
      expectStatus(
        await call(alice, "POST", `/api/v1/bot/${botId}/chats/${chatId}`),
        204,
      );

      const sent = expectStatus(
        await call(
          token,
          "POST",
          "/api/v1/bot-api/message",
          { chatId, content: "Я бот" },
          { scheme: "Bot" },
        ),
        201,
      );

      expect(sent.data.senderId).to.not.equal(alice.id);
      expectStatus(
        await call(
          token,
          "PATCH",
          `/api/v1/bot-api/message/${sent.data.id}`,
          { content: "Я бот (ред.)" },
          { scheme: "Bot" },
        ),
        200,
      );
      expectStatus(
        await call(
          token,
          "DELETE",
          `/api/v1/bot-api/message/${sent.data.id}`,
          undefined,
          { scheme: "Bot" },
        ),
        204,
      );
      expectStatus(
        await call(alice, "POST", `/api/v1/bot/${botId}/webhook`, {
          url: "http://127.0.0.1:9/hook",
        }),
        400,
      );
      expectStatus(
        await call(alice, "POST", `/api/v1/bot/${botId}/webhook`, {
          url: "https://example.com/hook",
          secret: "s3cr3t-value",
        }),
        200,
      );
      expectStatus(
        await call(alice, "POST", `/api/v1/bot/${botId}/webhook/events`, {
          events: ["message.new"],
        }),
        [200, 400],
      );
      expectStatus(
        await call(alice, "POST", `/api/v1/bot/${botId}/webhook/test`),
        [200, 400, 502],
      );
      expectStatus(
        await call(alice, "GET", `/api/v1/bot/${botId}/webhook/logs`),
        200,
      );
      expectStatus(
        await call(alice, "DELETE", `/api/v1/bot/${botId}/webhook`),
        204,
      );
      expectStatus(
        await call(alice, "DELETE", `/api/v1/bot/${botId}/chats/${chatId}`),
        204,
      );
      expectStatus(await call(alice, "DELETE", `/api/v1/bot/${botId}`), 204);
    });
  });

  describe("устройства и уведомления", () => {
    it("push-устройство: только владелец удаляет; настройки уведомлений", async () => {
      const token = `fcm-${Date.now()}`;

      expectStatus(
        await call(bob, "POST", "/api/v1/device", {
          token,
          platform: "android",
          deviceName: "Pixel",
        }),
        200,
      );
      expectStatus(await call(alice, "DELETE", `/api/v1/device/${token}`), 404);
      expectStatus(await call(bob, "DELETE", `/api/v1/device/${token}`), 204);
      expectStatus(
        await call(bob, "GET", "/api/v1/notification/settings"),
        200,
      );
      expectStatus(
        await call(bob, "PATCH", "/api/v1/notification/settings", {
          showPreview: false,
          soundEnabled: false,
        }),
        200,
      );
    });
  });
});
