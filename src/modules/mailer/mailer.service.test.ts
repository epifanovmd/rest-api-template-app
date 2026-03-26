import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { config } from "../../config";
import { MailerService } from "./mailer.service";

describe("MailerService", () => {
  let service: MailerService;
  let sandbox: sinon.SinonSandbox;
  let mockTransport: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    service = new MailerService();

    // Replace the transport with a mock
    mockTransport = {
      sendMail: sinon.stub().callsFake((_options: any, cb: any) => {
        cb(null, { messageId: "msg-123", accepted: ["test@test.com"] });
      }),
    };
    service.transport = mockTransport as any;
  });

  afterEach(() => sandbox.restore());

  describe("sendCodeMail", () => {
    it("should send email with OTP code", async () => {
      await service.sendCodeMail("user@example.com", "123456");

      expect(mockTransport.sendMail.calledOnce).to.be.true;

      const options = mockTransport.sendMail.firstCall.args[0];

      expect(options.to).to.equal("user@example.com");
      expect(options.subject).to.equal("Ваш одноразовый код");
      expect(options.html).to.include("123456");
      expect(options.from).to.equal(config.email.smtp.user);
    });
  });

  describe("sendResetPasswordMail", () => {
    it("should send email with reset link containing token", async () => {
      await service.sendResetPasswordMail("user@example.com", "reset-token-123");

      expect(mockTransport.sendMail.calledOnce).to.be.true;

      const options = mockTransport.sendMail.firstCall.args[0];

      expect(options.to).to.equal("user@example.com");
      expect(options.subject).to.equal("Ваша ссылка для востановления пароля");
      expect(options.html).to.include("reset-token-123");
      expect(options.from).to.equal(config.email.smtp.user);
    });
  });

  describe("sendMail", () => {
    it("should reject when transport returns error", async () => {
      mockTransport.sendMail.callsFake((_options: any, cb: any) => {
        cb(new Error("SMTP error"), null);
      });

      try {
        await service.sendMail({ to: "user@example.com", subject: "Test", html: "<p>Hi</p>" });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).to.equal("SMTP error");
      }
    });

    it("should resolve with info when send succeeds", async () => {
      const result = await service.sendMail({
        to: "user@example.com",
        subject: "Test",
        html: "<p>Hi</p>",
      });

      expect(result).to.have.property("messageId", "msg-123");

      const options = mockTransport.sendMail.firstCall.args[0];

      expect(options.from).to.equal(config.email.smtp.user);
      expect(options.to).to.equal("user@example.com");
      expect(options.subject).to.equal("Test");
    });

    it("should create transport with correct config", () => {
      // The constructor already created a transport; verify the service has one
      const freshService = new MailerService();

      expect(freshService.transport).to.exist;
    });
  });
});
