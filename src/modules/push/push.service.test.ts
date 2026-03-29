import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { createMockRepository, uuid, uuid2 } from "../../test/helpers";
import { PushService } from "./push.service";

describe("PushService", () => {
  let service: PushService;
  let tokenRepo: ReturnType<typeof createMockRepository>;
  let settingsRepo: ReturnType<typeof createMockRepository>;
  let sandbox: sinon.SinonSandbox;
  let mockMessaging: any;

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

    // Create service without Firebase init (we'll set _app manually)
    service = new PushService(tokenRepo as any, settingsRepo as any);
    // Set mock app
    (service as any)._app = {
      messaging: () => mockMessaging,
    };
  });

  afterEach(() => sandbox.restore());

  describe("sendToUser", () => {
    it("should get tokens and send multicast", async () => {
      const tokens = [
        { id: "t1", userId, token: "fcm-token-1" },
        { id: "t2", userId, token: "fcm-token-2" },
      ];

      (tokenRepo as any).findByUserId.resolves(tokens);

      await service.sendToUser(userId, payload);

      expect((tokenRepo as any).findByUserId.calledOnceWith(userId)).to.be.true;
      expect(mockMessaging.sendEachForMulticast.calledOnce).to.be.true;

      const msg = mockMessaging.sendEachForMulticast.firstCall.args[0];

      expect(msg.tokens).to.deep.equal(["fcm-token-1", "fcm-token-2"]);
      expect(msg.notification.title).to.equal("Test");
      expect(msg.notification.body).to.equal("Hello");
    });

    it("should not send when user has no tokens", async () => {
      (tokenRepo as any).findByUserId.resolves([]);

      await service.sendToUser(userId, payload);

      expect(mockMessaging.sendEachForMulticast.called).to.be.false;
    });

    it("should not send when user has muteAll enabled", async () => {
      const tokens = [{ id: "t1", userId, token: "fcm-token-1" }];

      (tokenRepo as any).findByUserId.resolves(tokens);
      (settingsRepo as any).findByUserId.resolves({ userId, muteAll: true });

      await service.sendToUser(userId, payload);

      expect(mockMessaging.sendEachForMulticast.called).to.be.false;
    });

    it("should not send when Firebase is not initialized", async () => {
      (service as any)._app = null;

      await service.sendToUser(userId, payload);

      expect((tokenRepo as any).findByUserId.called).to.be.false;
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

      await service.sendToUsers([userId, userId2], payload);

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
      (settingsRepo as any).findByUserIds.resolves([
        { userId, muteAll: true },
      ]);

      await service.sendToUsers([userId, userId2], payload);

      expect(mockMessaging.sendEachForMulticast.calledOnce).to.be.true;

      const msg = mockMessaging.sendEachForMulticast.firstCall.args[0];

      expect(msg.tokens).to.deep.equal(["token-2"]);
    });

    it("should not send when Firebase is not initialized", async () => {
      (service as any)._app = null;

      await service.sendToUsers([userId], payload);

      expect((tokenRepo as any).findByUserIds.called).to.be.false;
    });

    it("should not send when userIds is empty", async () => {
      await service.sendToUsers([], payload);

      expect((tokenRepo as any).findByUserIds.called).to.be.false;
    });
  });

  describe("invalid token cleanup", () => {
    it("should delete invalid tokens after send failure", async () => {
      const tokens = [
        { id: "t1", userId, token: "valid-token" },
        { id: "t2", userId, token: "invalid-token" },
      ];

      (tokenRepo as any).findByUserId.resolves(tokens);

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

      await service.sendToUser(userId, payload);

      expect((tokenRepo as any).deleteByTokens.calledOnce).to.be.true;
      expect((tokenRepo as any).deleteByTokens.firstCall.args[0]).to.deep.equal(["invalid-token"]);
    });

    it("should delete unregistered tokens", async () => {
      const tokens = [{ id: "t1", userId, token: "unregistered-token" }];

      (tokenRepo as any).findByUserId.resolves(tokens);

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

      await service.sendToUser(userId, payload);

      expect((tokenRepo as any).deleteByTokens.calledOnce).to.be.true;
      expect((tokenRepo as any).deleteByTokens.firstCall.args[0]).to.deep.equal(["unregistered-token"]);
    });
  });
});
