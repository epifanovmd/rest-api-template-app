import { expect } from "chai";
import { io, Socket } from "socket.io-client";

import {
  Actor,
  call,
  expectStatus,
  fileForm,
  items,
  signUp,
  wait,
} from "./client";
import { BASE_URL } from "./harness";

const connect = async (user: Actor) => {
  const socket = io(BASE_URL, {
    transports: ["websocket"],
    auth: { token: user.access },
    extraHeaders: { "x-forwarded-for": user.ip },
  });
  const events: Array<[string, any]> = [];

  socket.onAny((event, payload) => events.push([event, payload]));
  await new Promise<void>((resolve, reject) => {
    socket.on("authenticated", () => resolve());
    socket.on("connect_error", reject);
  });

  return { socket, events };
};

const received = async (
  events: Array<[string, any]>,
  name: string,
  timeoutMs = 3000,
) => {
  const until = Date.now() + timeoutMs;

  while (Date.now() < until) {
    const hit = events.find(([event]) => event === name);

    if (hit) return hit[1];
    await wait(50);
  }

  return undefined;
};

const NO_USER = "00000000-0000-4000-8000-000000000000";

describe("мессенджер", () => {
  let alice: Actor;
  let bob: Actor;
  let carol: Actor;
  let dave: Actor;
  let bobSocket: { socket: Socket; events: Array<[string, any]> };
  let directId: string;
  let groupId: string;

  before(async () => {
    [alice, bob, carol, dave] = await Promise.all([
      signUp("m-alice", { firstName: "Alice" }),
      signUp("m-bob", { firstName: "Bob" }),
      signUp("m-carol", { firstName: "Carol" }),
      signUp("m-dave", { firstName: "Dave" }),
    ]);
    bobSocket = await connect(bob);
  });

  after(() => bobSocket?.socket.close());

  describe("контакты и блокировки", () => {
    it("запрос, повтор — 409, несуществующий — 404, принять", async () => {
      expectStatus(
        await call(alice, "POST", "/api/v1/contact", {
          contactUserId: bob.id,
          displayName: "Бобби",
        }),
        201,
      );
      expectStatus(
        await call(alice, "POST", "/api/v1/contact", { contactUserId: bob.id }),
        409,
      );
      expectStatus(
        await call(alice, "POST", "/api/v1/contact", {
          contactUserId: NO_USER,
        }),
        404,
      );

      const pending = expectStatus(
        await call(bob, "GET", "/api/v1/contact?status=pending"),
        200,
      );
      const incoming = items(pending.data)[0];

      expectStatus(await call(bob, "GET", "/api/v1/contact?status=bogus"), 400);
      expectStatus(
        await call(bob, "PATCH", `/api/v1/contact/${incoming.id}/accept`),
        200,
      );
      expectStatus(await call(alice, "GET", "/api/v1/contact"), 200);
    });

    it("блокировка незнакомца: контакт и чат запрещены, разблокировка", async () => {
      const added = expectStatus(
        await call(carol, "POST", "/api/v1/contact", {
          contactUserId: dave.id,
        }),
        201,
      );

      expectStatus(
        await call(carol, "DELETE", `/api/v1/contact/${added.data.id}`),
        204,
      );
      expectStatus(
        await call(dave, "POST", `/api/v1/contact/block/${carol.id}`),
        204,
      );
      expectStatus(
        await call(dave, "POST", `/api/v1/contact/block/${carol.id}`),
        204,
      );
      expectStatus(
        await call(carol, "POST", "/api/v1/contact", {
          contactUserId: dave.id,
        }),
        403,
      );
      expectStatus(
        await call(carol, "POST", "/api/v1/chat/direct", {
          targetUserId: dave.id,
        }),
        403,
      );
      expectStatus(
        await call(carol, "POST", "/api/v1/call", { calleeId: dave.id }),
        403,
      );
      expectStatus(
        await call(dave, "DELETE", `/api/v1/contact/block/${carol.id}`),
        204,
      );
      expectStatus(
        await call(dave, "DELETE", `/api/v1/contact/block/${carol.id}`),
        404,
      );
    });
  });

  describe("чаты", () => {
    it("direct без дублей с обеих сторон", async () => {
      const a = expectStatus(
        await call(alice, "POST", "/api/v1/chat/direct", {
          targetUserId: bob.id,
        }),
        201,
      );
      const b = expectStatus(
        await call(bob, "POST", "/api/v1/chat/direct", {
          targetUserId: alice.id,
        }),
        [200, 201],
      );

      expect(a.data.id).to.equal(b.data.id);
      directId = a.data.id;
    });

    it("группа: membersCount, me, без приватных полей чужих участников", async () => {
      const group = expectStatus(
        await call(alice, "POST", "/api/v1/chat/group", {
          name: "Команда",
          memberIds: [bob.id, carol.id],
        }),
        201,
      );

      groupId = group.data.id;
      expectStatus(
        await call(alice, "POST", "/api/v1/chat/group", {
          name: "X",
          memberIds: [NO_USER],
        }),
        400,
      );

      const list = expectStatus(await call(carol, "GET", "/api/v1/chat"), 200);
      const chat = items(list.data).find((c: any) => c.id === groupId);

      expect(chat.membersCount).to.equal(3);
      expect(chat.me).to.be.an("object");
      expect(JSON.stringify(chat.members)).to.not.match(
        /mutedUntil|lastReadMessageId|folderId/,
      );
      expectStatus(await call(carol, "GET", `/api/v1/chat/${groupId}`), 200);
      expectStatus(await call(dave, "GET", `/api/v1/chat/${groupId}`), 403);
      expectStatus(
        await call(carol, "GET", `/api/v1/chat/${groupId}/members?limit=2`),
        200,
      );
    });

    it("роли: переименование, админ, ограничения", async () => {
      expectStatus(
        await call(alice, "PATCH", `/api/v1/chat/${groupId}`, {
          name: "Команда проекта",
        }),
        200,
      );
      expectStatus(
        await call(carol, "PATCH", `/api/v1/chat/${groupId}`, { name: "hack" }),
        403,
      );
      expectStatus(
        await call(
          alice,
          "PATCH",
          `/api/v1/chat/${groupId}/members/${bob.id}`,
          {
            role: "admin",
          },
        ),
        200,
      );
      expectStatus(
        await call(
          alice,
          "PATCH",
          `/api/v1/chat/${groupId}/members/${alice.id}`,
          {
            role: "member",
          },
        ),
        400,
      );
      expectStatus(
        await call(
          alice,
          "PATCH",
          `/api/v1/chat/${groupId}/members/${carol.id}`,
          {
            role: "owner",
          },
        ),
        400,
      );
      expectStatus(
        await call(alice, "POST", `/api/v1/chat/${groupId}/members`, {
          memberIds: [dave.id],
        }),
        200,
      );
      expectStatus(
        await call(bob, "DELETE", `/api/v1/chat/${groupId}/members/${dave.id}`),
        204,
      );
      expectStatus(
        await call(
          carol,
          "DELETE",
          `/api/v1/chat/${groupId}/members/${bob.id}`,
        ),
        403,
      );
    });

    it("инвайты: срок в прошлом — 400, лимит использований, отзыв", async () => {
      expectStatus(
        await call(alice, "POST", `/api/v1/chat/${groupId}/invite`, {
          expiresAt: "2000-01-01T00:00:00Z",
        }),
        400,
      );

      const once = expectStatus(
        await call(alice, "POST", `/api/v1/chat/${groupId}/invite`, {
          maxUses: 1,
        }),
        201,
      );

      expectStatus(
        await call(alice, "GET", `/api/v1/chat/${groupId}/invite`),
        200,
      );
      expectStatus(
        await call(dave, "POST", `/api/v1/chat/join/${once.data.code}`),
        200,
      );
      expectStatus(
        await call(dave, "POST", `/api/v1/chat/${groupId}/leave`),
        204,
      );
      expectStatus(
        await call(dave, "POST", `/api/v1/chat/join/${once.data.code}`),
        [400, 410],
      );

      const invite = expectStatus(
        await call(alice, "POST", `/api/v1/chat/${groupId}/invite`, {}),
        201,
      );

      expectStatus(
        await call(
          alice,
          "DELETE",
          `/api/v1/chat/${groupId}/invite/${invite.data.id}`,
        ),
        204,
      );
    });

    it("бан: запись в списке, забаненный не возвращается, разбан", async () => {
      const invite = expectStatus(
        await call(alice, "POST", `/api/v1/chat/${groupId}/invite`, {}),
        201,
      );

      expectStatus(
        await call(alice, "POST", `/api/v1/chat/${groupId}/members`, {
          memberIds: [dave.id],
        }),
        200,
      );

      expectStatus(
        await call(
          alice,
          "POST",
          `/api/v1/chat/${groupId}/members/${dave.id}/ban`,
          {
            reason: "спам",
            duration: 3600,
          },
        ),
        204,
      );
      expectStatus(
        await call(bob, "GET", `/api/v1/chat/${groupId}/members/banned`),
        200,
      );
      expectStatus(
        await call(dave, "POST", `/api/v1/chat/join/${invite.data.code}`),
        403,
      );
      expectStatus(
        await call(alice, "POST", `/api/v1/chat/${groupId}/members`, {
          memberIds: [dave.id],
        }),
        403,
      );
      expectStatus(
        await call(
          alice,
          "DELETE",
          `/api/v1/chat/${groupId}/members/${dave.id}/ban`,
        ),
        204,
      );
      expectStatus(
        await call(dave, "POST", `/api/v1/chat/join/${invite.data.code}`),
        200,
      );
    });

    it("личное: mute, закрепление, папки", async () => {
      expectStatus(
        await call(carol, "PATCH", `/api/v1/chat/${groupId}/mute`, {
          mutedUntil: "2999-01-01T00:00:00Z",
        }),
        200,
      );
      expectStatus(
        await call(carol, "POST", `/api/v1/chat/${groupId}/pin`),
        200,
      );
      expectStatus(
        await call(carol, "DELETE", `/api/v1/chat/${groupId}/pin`),
        200,
      );

      const folder = expectStatus(
        await call(carol, "POST", "/api/v1/chat/folder", { name: "Работа" }),
        201,
      );

      expectStatus(
        await call(carol, "POST", "/api/v1/chat/folder", { name: "Работа" }),
        409,
      );
      expectStatus(await call(carol, "GET", "/api/v1/chat/folder/list"), 200);
      expectStatus(
        await call(carol, "PATCH", `/api/v1/chat/folder/${folder.data.id}`, {
          name: "Проекты",
          position: 1,
        }),
        200,
      );
      expectStatus(
        await call(carol, "PATCH", `/api/v1/chat/${groupId}/folder`, {
          folderId: folder.data.id,
        }),
        200,
      );
      expectStatus(
        await call(carol, "DELETE", `/api/v1/chat/folder/${folder.data.id}`),
        204,
      );
    });
  });

  describe("сообщения", () => {
    let m1: any;
    let secret: any;

    it("отправка доходит по сокету", async () => {
      bobSocket.events.length = 0;
      m1 = expectStatus(
        await call(alice, "POST", `/api/v1/chat/${groupId}/message`, {
          type: "text",
          content: "Всем привет",
          localId: "l1",
        }),
        201,
      ).data;

      expect(await received(bobSocket.events, "message:new")).to.be.an(
        "object",
      );
    });

    it("защита: служебный тип, не участник, чужой ответ и пересылка", async () => {
      expectStatus(
        await call(alice, "POST", `/api/v1/chat/${groupId}/message`, {
          type: "system",
          content: "fake",
        }),
        400,
      );
      secret = expectStatus(
        await call(alice, "POST", `/api/v1/chat/${directId}/message`, {
          type: "text",
          content: "секрет в личке",
        }),
        201,
      ).data;
      expectStatus(
        await call(dave, "POST", `/api/v1/chat/${directId}/message`, {
          type: "text",
          content: "hi",
        }),
        403,
      );
      expectStatus(
        await call(carol, "POST", `/api/v1/chat/${groupId}/message`, {
          type: "text",
          content: "reply",
          replyToId: secret.id,
        }),
        400,
      );
      expectStatus(
        await call(carol, "POST", `/api/v1/chat/${groupId}/message`, {
          type: "text",
          content: "fw",
          forwardedFromId: secret.id,
        }),
        400,
      );
      expectStatus(
        await call(bob, "POST", `/api/v1/chat/${groupId}/message`, {
          type: "text",
          content: "fw",
          forwardedFromId: secret.id,
        }),
        201,
      );
    });

    it("история по курсору, поиск только по своим чатам", async () => {
      const page = expectStatus(
        await call(carol, "GET", `/api/v1/chat/${groupId}/message?limit=2`),
        200,
      );

      expect(items(page.data)).to.have.length(2);
      if (page.data.nextCursor) {
        expectStatus(
          await call(
            carol,
            "GET",
            `/api/v1/chat/${groupId}/message?cursor=${encodeURIComponent(page.data.nextCursor)}`,
          ),
          200,
        );
      }
      expectStatus(
        await call(
          carol,
          "GET",
          `/api/v1/chat/${groupId}/message?around=${m1.id}`,
        ),
        200,
      );
      expectStatus(
        await call(
          carol,
          "GET",
          `/api/v1/chat/${groupId}/message/search?q=привет`,
        ),
        200,
      );
      expectStatus(
        await call(carol, "GET", `/api/v1/chat/${groupId}/message/search?q=п`),
        400,
      );

      const global = expectStatus(
        await call(carol, "GET", "/api/v1/message/search?q=секрет"),
        200,
      );

      expect(JSON.stringify(global.data)).to.not.include("секрет в личке");
    });

    it("правка, реакции, закрепление, прочтение, получатели", async () => {
      expectStatus(
        await call(alice, "PATCH", `/api/v1/message/${m1.id}`, {
          content: "Всем привет!",
        }),
        200,
      );
      expectStatus(
        await call(carol, "PATCH", `/api/v1/message/${m1.id}`, {
          content: "hack",
        }),
        403,
      );
      expectStatus(
        await call(carol, "POST", `/api/v1/message/${m1.id}/reaction`, {
          emoji: "👍",
        }),
        204,
      );
      expectStatus(
        await call(carol, "DELETE", `/api/v1/message/${m1.id}/reaction`),
        204,
      );
      expectStatus(
        await call(carol, "POST", `/api/v1/message/${m1.id}/pin`),
        403,
      );
      expectStatus(
        await call(bob, "POST", `/api/v1/message/${m1.id}/pin`),
        200,
      );
      expectStatus(
        await call(carol, "GET", `/api/v1/chat/${groupId}/message/pinned`),
        200,
      );
      expectStatus(
        await call(bob, "DELETE", `/api/v1/message/${m1.id}/pin`),
        204,
      );
      expectStatus(
        await call(bob, "POST", `/api/v1/message/${secret.id}/pin`),
        200,
      );
      expectStatus(
        await call(carol, "POST", `/api/v1/chat/${groupId}/message/read`, {
          messageIds: [m1.id],
        }),
        204,
      );
      expectStatus(
        await call(alice, "GET", `/api/v1/message/${m1.id}/receipts`),
        200,
      );
    });

    it("удаление для всех — один раз", async () => {
      const temp = expectStatus(
        await call(carol, "POST", `/api/v1/chat/${groupId}/message`, {
          type: "text",
          content: "удалю",
        }),
        201,
      ).data;

      expectStatus(
        await call(carol, "DELETE", `/api/v1/message/${temp.id}`),
        204,
      );
      expectStatus(
        await call(carol, "DELETE", `/api/v1/message/${temp.id}?forAll=true`),
        204,
      );
      expectStatus(
        await call(carol, "DELETE", `/api/v1/message/${temp.id}?forAll=true`),
        400,
      );
    });

    it("медленный режим: участник — 429 с Retry-After, админ — без ограничений", async () => {
      expectStatus(
        await call(alice, "PATCH", `/api/v1/chat/${groupId}/slow-mode`, {
          seconds: 30,
        }),
        200,
      );

      const limited = expectStatus(
        await call(carol, "POST", `/api/v1/chat/${groupId}/message`, {
          type: "text",
          content: "1",
        }),
        429,
        "MESSAGE_SLOW_MODE",
      );

      expect(limited.headers.get("retry-after")).to.be.a("string");
      expectStatus(
        await call(bob, "POST", `/api/v1/chat/${groupId}/message`, {
          type: "text",
          content: "admin 1",
        }),
        201,
      );
      expectStatus(
        await call(bob, "POST", `/api/v1/chat/${groupId}/message`, {
          type: "text",
          content: "admin 2",
        }),
        201,
      );
      expectStatus(
        await call(alice, "PATCH", `/api/v1/chat/${groupId}/slow-mode`, {
          seconds: 0,
        }),
        200,
      );
    });

    it("вложения: своё изображение — да, чужое — нет; медиа чата", async () => {
      const upload = expectStatus(
        await call(alice, "POST", "/api/v1/file", fileForm()),
        201,
      );
      const file = Array.isArray(upload.data) ? upload.data[0] : upload.data;

      expectStatus(
        await call(alice, "POST", `/api/v1/chat/${groupId}/message`, {
          type: "image",
          fileIds: [file.id],
        }),
        201,
      );
      expectStatus(
        await call(bob, "POST", `/api/v1/chat/${groupId}/message`, {
          type: "image",
          fileIds: [file.id],
        }),
        400,
      );
      expectStatus(await call(bob, "DELETE", `/api/v1/file/${file.id}`), 403);
      expectStatus(await call(alice, "DELETE", `/api/v1/file/${file.id}`), 409);
      expectStatus(
        await call(carol, "GET", `/api/v1/chat/${groupId}/media?type=image`),
        200,
      );
      expectStatus(
        await call(carol, "GET", `/api/v1/chat/${groupId}/media/stats`),
        200,
      );
    });
  });

  describe("опросы", () => {
    it("голосование, отзыв, закрытие админом, голос в закрытом — 400", async () => {
      const created = expectStatus(
        await call(alice, "POST", `/api/v1/chat/${groupId}/poll`, {
          question: "Когда созвон?",
          options: ["Пн", "Вт", "Ср"],
          isMultipleChoice: true,
        }),
        201,
      );
      const pollId = created.data.id ?? created.data.poll?.id;
      const poll = expectStatus(
        await call(carol, "GET", `/api/v1/poll/${pollId}`),
        200,
      );
      const options = poll.data.options.map((o: any) => o.id);

      expectStatus(
        await call(dave, "GET", `/api/v1/poll/${pollId}`),
        [200, 403],
      );
      expectStatus(
        await call(carol, "POST", `/api/v1/poll/${pollId}/vote`, {
          optionIds: [options[0], options[0], options[1]],
        }),
        200,
      );
      expectStatus(
        await call(carol, "DELETE", `/api/v1/poll/${pollId}/vote`),
        200,
      );
      expectStatus(
        await call(bob, "POST", `/api/v1/poll/${pollId}/vote`, {
          optionIds: [options[2]],
        }),
        200,
      );
      expectStatus(
        await call(carol, "POST", `/api/v1/poll/${pollId}/close`),
        403,
      );
      expectStatus(
        await call(bob, "POST", `/api/v1/poll/${pollId}/close`),
        200,
      );
      expectStatus(
        await call(carol, "POST", `/api/v1/poll/${pollId}/vote`, {
          optionIds: [options[0]],
        }),
        400,
      );
    });
  });

  describe("звонки", () => {
    it("звонок, занято — 409, ответ, завершение; отклонение; несуществующему — 404", async () => {
      const first = expectStatus(
        await call(alice, "POST", "/api/v1/call", {
          calleeId: bob.id,
          type: "video",
        }),
        201,
      );

      expectStatus(
        await call(alice, "POST", "/api/v1/call", { calleeId: bob.id }),
        409,
      );
      expectStatus(
        await call(carol, "POST", `/api/v1/call/${first.data.id}/answer`),
        [403, 404],
      );
      expectStatus(await call(bob, "GET", "/api/v1/call/active"), 200);
      expectStatus(
        await call(bob, "POST", `/api/v1/call/${first.data.id}/answer`),
        200,
      );
      expectStatus(
        await call(alice, "POST", `/api/v1/call/${first.data.id}/end`),
        200,
      );
      expectStatus(
        await call(alice, "POST", `/api/v1/call/${first.data.id}/end`),
        409,
      );

      const second = expectStatus(
        await call(alice, "POST", "/api/v1/call", { calleeId: carol.id }),
        201,
      );

      expectStatus(
        await call(carol, "POST", `/api/v1/call/${second.data.id}/decline`),
        200,
      );
      expectStatus(
        await call(alice, "POST", "/api/v1/call", { calleeId: NO_USER }),
        404,
      );
      expectStatus(
        await call(alice, "GET", "/api/v1/call/history?limit=10"),
        200,
      );
    });
  });

  describe("каналы, владение, удаление", () => {
    it("канал: подписчик читает, но не пишет", async () => {
      const username = `news_${Date.now().toString(36)}`;
      const channel = expectStatus(
        await call(alice, "POST", "/api/v1/chat/channel", {
          name: "Новости",
          username,
          isPublic: true,
        }),
        201,
      );

      expectStatus(
        await call(bob, "POST", "/api/v1/chat/channel", {
          name: "Дубль",
          username,
        }),
        409,
      );
      expectStatus(
        await call(dave, "GET", "/api/v1/chat/channel/search?q=news"),
        200,
      );
      expectStatus(
        await call(dave, "GET", "/api/v1/chat/channel/search?q=n"),
        400,
      );
      expectStatus(
        await call(
          dave,
          "POST",
          `/api/v1/chat/channel/${channel.data.id}/subscribe`,
        ),
        200,
      );
      expectStatus(
        await call(dave, "POST", `/api/v1/chat/${channel.data.id}/message`, {
          type: "text",
          content: "x",
        }),
        403,
      );
      expectStatus(
        await call(alice, "PATCH", `/api/v1/chat/channel/${channel.data.id}`, {
          description: "Главные новости",
        }),
        200,
      );
      expectStatus(
        await call(
          dave,
          "DELETE",
          `/api/v1/chat/channel/${channel.data.id}/subscribe`,
        ),
        204,
      );
      expectStatus(
        await call(alice, "DELETE", `/api/v1/chat/${channel.data.id}`),
        204,
      );
    });

    it("владелец уходит только после передачи; удаление чата приходит по сокету", async () => {
      expectStatus(
        await call(alice, "POST", `/api/v1/chat/${groupId}/leave`),
        409,
      );
      expectStatus(
        await call(
          alice,
          "POST",
          `/api/v1/chat/${groupId}/transfer-ownership`,
          {
            userId: bob.id,
          },
        ),
        204,
      );
      expectStatus(
        await call(alice, "POST", `/api/v1/chat/${groupId}/leave`),
        204,
      );
      bobSocket.events.length = 0;
      expectStatus(await call(bob, "DELETE", `/api/v1/chat/${groupId}`), 204);
      expect(await received(bobSocket.events, "chat:deleted")).to.be.an(
        "object",
      );
    });

    it("скрытый direct возвращается новым сообщением", async () => {
      expectStatus(
        await call(alice, "POST", `/api/v1/chat/${directId}/leave`),
        204,
      );

      const hidden = await call(alice, "GET", "/api/v1/chat");

      expect(items(hidden.data).some((c: any) => c.id === directId)).to.equal(
        false,
      );
      expectStatus(
        await call(bob, "POST", `/api/v1/chat/${directId}/message`, {
          type: "text",
          content: "ты тут?",
        }),
        201,
      );

      const back = await call(alice, "GET", "/api/v1/chat");

      expect(items(back.data).some((c: any) => c.id === directId)).to.equal(
        true,
      );
    });
  });

  describe("sync", () => {
    it("версия и изменения; невалидная версия — 400", async () => {
      expectStatus(await call(carol, "GET", "/api/v1/sync/version"), 200);
      expectStatus(
        await call(carol, "GET", "/api/v1/sync?sinceVersion=0&limit=50"),
        200,
      );
      expectStatus(
        await call(carol, "GET", "/api/v1/sync?sinceVersion=abc"),
        400,
        "SYNC_INVALID_VERSION",
      );
    });
  });
});
