import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import {
  createMockJobQueue,
  createMockRepository,
  uuid,
  uuid2,
} from "../../test/helpers";
import { PUSH_MAX_RETRIES } from "./push.service";
import { PushService } from "./push.service";
import { PushSendJob } from "./push-send.job";

describe("PushService", () => {
  let service: PushService;
  let tokenRepo: ReturnType<typeof createMockRepository>;
  let settingsRepo: ReturnType<typeof createMockRepository>;
  let sandbox: sinon.SinonSandbox;
  let mockMessaging: any;
  let jobs: ReturnType<typeof createMockJobQueue>;

  const userId = uuid();
  const userId2 = uuid2();

  const payload = { title: "Test", body: "Hello" };

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    tokenRepo = createMockRepository();
    settingsRepo = createMockRepository();

    (tokenRepo as any).findByUserId = sinon.stub().resolves([]);
    (tokenRepo as any).findByToken = sinon.stub().resolves(null);
    (tokenRepo as any).findByUserIds = sinon.stub().resolves([]);
    (tokenRepo as any).deleteByToken = sinon.stub().resolves();
    (tokenRepo as any).deleteByTokens = sinon.stub().resolves();

    (settingsRepo as any).findByUserId = sinon.stub().resolves(null);
    (settingsRepo as any).findByUserIds = sinon.stub().resolves([]);

    mockMessaging = {
      sendEachForMulticast: sinon.stub().resolves({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }],
      }),
    };

    // Сервис без инициализации Firebase: Messaging подставляем напрямую.
    jobs = createMockJobQueue();
    service = new PushService(
      tokenRepo as any,
      settingsRepo as any,
      jobs as any,
    );
    (service as any)._messaging = mockMessaging;
  });

  afterEach(() => sandbox.restore());

  describe("sendToUser", () => {
    it("should get tokens and send multicast", async () => {
      const tokens = [
        { id: "t1", userId, token: "fcm-token-1" },
        { id: "t2", userId, token: "fcm-token-2" },
      ];

      (tokenRepo as any).findByUserIds.resolves(tokens);

      await service.deliver({ userIds: [userId], payload });

      expect((tokenRepo as any).findByUserIds.calledOnceWith([userId])).to.be
        .true;
      expect(mockMessaging.sendEachForMulticast.calledOnce).to.be.true;

      const msg = mockMessaging.sendEachForMulticast.firstCall.args[0];

      expect(msg.tokens).to.deep.equal(["fcm-token-1", "fcm-token-2"]);
      expect(msg.notification.title).to.equal("Test");
      expect(msg.notification.body).to.equal("Hello");
    });

    it("should not send when user has no tokens", async () => {
      await service.deliver({ userIds: [userId], payload });

      expect(mockMessaging.sendEachForMulticast.called).to.be.false;
    });

    it("should not send when user has muteAll enabled", async () => {
      (tokenRepo as any).findByUserIds.resolves([
        { id: "t1", userId, token: "fcm-token-1" },
      ]);
      (settingsRepo as any).findByUserIds.resolves([{ userId, muteAll: true }]);

      await service.deliver({ userIds: [userId], payload });

      expect(mockMessaging.sendEachForMulticast.called).to.be.false;
    });

    it("should not send when Firebase is not initialized", async () => {
      (service as any)._messaging = null;

      await service.deliver({ userIds: [userId], payload });

      expect((tokenRepo as any).findByUserIds.called).to.be.false;
    });
  });

  describe("notification settings", () => {
    const tokens = [
      { id: "t1", userId, token: "token-1" },
      { id: "t2", userId: userId2, token: "token-2" },
    ];

    it("should anonymize title/body when showPreview is false", async () => {
      (tokenRepo as any).findByUserIds.resolves(tokens);
      (settingsRepo as any).findByUserIds.resolves([
        { userId, muteAll: false, showPreview: false, soundEnabled: true },
      ]);

      await service.deliver({
        userIds: [userId, userId2],
        payload: {
          title: "Alice",
          body: "secret text",
          hiddenPreview: { title: "Новое сообщение", body: "Скрыто" },
        },
      });

      const messages = mockMessaging.sendEachForMulticast
        .getCalls()
        .map((c: any) => c.args[0]);
      const hidden = messages.find((m: any) => m.tokens.includes("token-1"));
      const open = messages.find((m: any) => m.tokens.includes("token-2"));

      expect(messages).to.have.lengthOf(2);
      expect(hidden.notification).to.deep.equal({
        title: "Новое сообщение",
        body: "Скрыто",
      });
      expect(JSON.stringify(hidden)).to.not.include("secret text");
      expect(open.notification.body).to.equal("secret text");
    });

    it("should use a generic text when no hiddenPreview is given", async () => {
      (tokenRepo as any).findByUserIds.resolves([tokens[0]]);
      (settingsRepo as any).findByUserIds.resolves([
        { userId, muteAll: false, showPreview: false, soundEnabled: true },
      ]);

      await service.deliver({
        userIds: [userId],
        payload: { title: "Alice", body: "secret" },
      });

      const msg = mockMessaging.sendEachForMulticast.firstCall.args[0];

      expect(msg.notification.title).to.not.equal("Alice");
      expect(msg.notification.body).to.not.equal("secret");
    });

    it("should map soundEnabled to android/apns sound options", async () => {
      (tokenRepo as any).findByUserIds.resolves(tokens);
      (settingsRepo as any).findByUserIds.resolves([
        { userId, muteAll: false, showPreview: true, soundEnabled: false },
      ]);

      await service.deliver({ userIds: [userId, userId2], payload });

      const messages = mockMessaging.sendEachForMulticast
        .getCalls()
        .map((c: any) => c.args[0]);
      const silent = messages.find((m: any) => m.tokens.includes("token-1"));
      const loud = messages.find((m: any) => m.tokens.includes("token-2"));

      expect(silent.android.notification.sound).to.be.undefined;
      expect(silent.android.notification.defaultSound).to.equal(false);
      expect(silent.apns.payload.aps.sound).to.be.undefined;
      expect(loud.android.notification.sound).to.equal("default");
      expect(loud.apns.payload.aps.sound).to.equal("default");
    });
  });

  describe("sendToUsers", () => {
    it("should send to multiple users", async () => {
      const tokens = [
        { id: "t1", userId, token: "token-1" },
        { id: "t2", userId: userId2, token: "token-2" },
      ];

      (tokenRepo as any).findByUserIds.resolves(tokens);
      (settingsRepo as any).findByUserIds.resolves([]);

      await service.deliver({ userIds: [userId, userId2], payload });

      expect(mockMessaging.sendEachForMulticast.calledOnce).to.be.true;

      const msg = mockMessaging.sendEachForMulticast.firstCall.args[0];

      expect(msg.tokens).to.deep.equal(["token-1", "token-2"]);
    });

    it("should filter out users with muteAll setting", async () => {
      const tokens = [
        { id: "t1", userId, token: "token-1" },
        { id: "t2", userId: userId2, token: "token-2" },
      ];

      (tokenRepo as any).findByUserIds.resolves(tokens);
      (settingsRepo as any).findByUserIds.resolves([{ userId, muteAll: true }]);

      await service.deliver({ userIds: [userId, userId2], payload });

      expect(mockMessaging.sendEachForMulticast.calledOnce).to.be.true;

      const msg = mockMessaging.sendEachForMulticast.firstCall.args[0];

      expect(msg.tokens).to.deep.equal(["token-2"]);
    });

    it("should not send when Firebase is not initialized", async () => {
      (service as any)._messaging = null;

      await service.deliver({ userIds: [userId], payload });

      expect((tokenRepo as any).findByUserIds.called).to.be.false;
    });

    it("should not send when userIds is empty", async () => {
      await service.deliver({ userIds: [], payload });

      expect((tokenRepo as any).findByUserIds.called).to.be.false;
    });
  });

  describe("invalid token cleanup", () => {
    it("should delete invalid tokens after send failure", async () => {
      const tokens = [
        { id: "t1", userId, token: "valid-token" },
        { id: "t2", userId, token: "invalid-token" },
      ];

      (tokenRepo as any).findByUserIds.resolves(tokens);

      mockMessaging.sendEachForMulticast.resolves({
        successCount: 1,
        failureCount: 1,
        responses: [
          { success: true },
          {
            success: false,
            error: { code: "messaging/invalid-registration-token" },
          },
        ],
      });

      await service.deliver({ userIds: [userId], payload });

      expect((tokenRepo as any).deleteByTokens.calledOnce).to.be.true;
      expect((tokenRepo as any).deleteByTokens.firstCall.args[0]).to.deep.equal(
        ["invalid-token"],
      );
    });

    it("should delete unregistered tokens", async () => {
      const tokens = [{ id: "t1", userId, token: "unregistered-token" }];

      (tokenRepo as any).findByUserIds.resolves(tokens);

      mockMessaging.sendEachForMulticast.resolves({
        successCount: 0,
        failureCount: 1,
        responses: [
          {
            success: false,
            error: { code: "messaging/registration-token-not-registered" },
          },
        ],
      });

      await service.deliver({ userIds: [userId], payload });

      expect((tokenRepo as any).deleteByTokens.calledOnce).to.be.true;
      expect((tokenRepo as any).deleteByTokens.firstCall.args[0]).to.deep.equal(
        ["unregistered-token"],
      );
    });
  });
  describe("очередь push.send", () => {
    it("sendToUsers ставит задачу, а не отправляет сразу", async () => {
      await service.sendToUsers([userId, userId, userId2], payload);

      expect(jobs.enqueue.calledOnce).to.be.true;

      const [queue, data] = jobs.enqueue.firstCall.args;

      expect(queue).to.equal("push.send");
      expect(data).to.deep.equal({ userIds: [userId, userId2], payload });
      expect(mockMessaging.sendEachForMulticast.called).to.be.false;
    });

    it("без Firebase или без адресатов задача не ставится", async () => {
      await service.sendToUsers([], payload);
      (service as any)._messaging = null;
      await service.sendToUser(userId, payload);

      expect(jobs.enqueue.called).to.be.false;
    });

    it("PushSendJob: очередь push.send с повторами, handle → deliver", async () => {
      const deliver = sandbox.stub(service, "deliver").resolves();
      const handler = new PushSendJob(service);
      const data = { userIds: [userId], payload };

      expect(handler.definition.queue).to.equal("push.send");
      expect(handler.definition.retryLimit).to.be.greaterThan(0);

      await handler.handle({ data } as any);

      expect(deliver.calledOnceWith(data)).to.be.true;
    });
  });

  describe("повтор временных сбоев FCM", () => {
    const tokens = [
      { id: "t1", userId, token: "ok-token" },
      { id: "t2", userId, token: "flaky-token" },
    ];

    it("токены с временной ошибкой уходят отдельной задачей с задержкой", async () => {
      (tokenRepo as any).findByUserIds.resolves(tokens);
      mockMessaging.sendEachForMulticast.resolves({
        successCount: 1,
        failureCount: 1,
        responses: [
          { success: true },
          { success: false, error: { code: "messaging/server-unavailable" } },
        ],
      });

      await service.deliver({ userIds: [userId], payload });

      expect(jobs.enqueue.calledOnce).to.be.true;

      const [queue, data, options] = jobs.enqueue.firstCall.args;

      expect(queue).to.equal("push.send");
      expect(data.retry).to.equal(1);
      expect(data.deliveries).to.have.lengthOf(1);
      expect(data.deliveries[0].tokens).to.deep.equal(["flaky-token"]);
      expect(data.deliveries[0].message.notification.title).to.equal("Test");
      expect(options.startAfter).to.be.greaterThan(0);
      expect((tokenRepo as any).deleteByTokens.called).to.be.false;
    });

    it("FCM недоступен целиком — повторяются все токены рассылки", async () => {
      (tokenRepo as any).findByUserIds.resolves(tokens);
      mockMessaging.sendEachForMulticast.rejects(new Error("ECONNRESET"));

      await service.deliver({ userIds: [userId], payload });

      expect(jobs.enqueue.firstCall.args[1].deliveries[0].tokens).to.deep.equal(
        ["ok-token", "flaky-token"],
      );
    });

    it("повтор отправляет готовые рассылки без чтения токенов", async () => {
      await service.deliver({
        deliveries: [{ tokens: ["flaky-token"], message: { data: {} } }],
        retry: 1,
      });

      expect((tokenRepo as any).findByUserIds.called).to.be.false;
      expect(
        mockMessaging.sendEachForMulticast.firstCall.args[0].tokens,
      ).to.deep.equal(["flaky-token"]);
      expect(jobs.enqueue.called).to.be.false;
    });

    it("исчерпанные повторы — без новой задачи", async () => {
      mockMessaging.sendEachForMulticast.rejects(new Error("down"));

      await service.deliver({
        deliveries: [{ tokens: ["flaky-token"], message: {} }],
        retry: PUSH_MAX_RETRIES,
      });

      expect(jobs.enqueue.called).to.be.false;
    });

    it("неретраибельная ошибка токена не повторяется", async () => {
      (tokenRepo as any).findByUserIds.resolves([tokens[0]]);
      mockMessaging.sendEachForMulticast.resolves({
        successCount: 0,
        failureCount: 1,
        responses: [
          { success: false, error: { code: "messaging/invalid-argument" } },
        ],
      });

      await service.deliver({ userIds: [userId], payload });

      expect(jobs.enqueue.called).to.be.false;
      expect((tokenRepo as any).deleteByTokens.called).to.be.false;
    });
  });
});
