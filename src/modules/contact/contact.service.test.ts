import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import {
  createMockEventBus,
  createMockFileStorage,
  createMockRepository,
  uuid,
  uuid2,
} from "../../test/helpers";
import { FileUrlService } from "../file";
import { ContactService } from "./contact.service";
import { EContactStatus } from "./contact.types";
import {
  ContactAcceptedEvent,
  ContactBlockedEvent,
  ContactRequestEvent,
  ContactUnblockedEvent,
} from "./events";

describe("ContactService", () => {
  let service: ContactService;
  let contactRepo: ReturnType<typeof createMockRepository>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let userBlock: { isBlockedEither: sinon.SinonStub };
  let mockTxRepo: Record<string, sinon.SinonStub>;
  let sandbox: sinon.SinonSandbox;

  const userId = uuid();
  const contactUserId = uuid2();

  const makeContactEntity = (overrides: Record<string, unknown> = {}) => ({
    id: "contact-1",
    userId,
    contactUserId,
    displayName: null,
    status: EContactStatus.ACCEPTED,
    createdAt: new Date(),
    updatedAt: new Date(),
    contactUser: null,
    ...overrides,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    contactRepo = createMockRepository();
    eventBus = createMockEventBus();

    userBlock = { isBlockedEither: sinon.stub().resolves(false) };
    mockTxRepo = {
      findOne: sinon.stub().resolves(null),
      create: sinon
        .stub()
        .callsFake((data: any) => ({ id: "test-id", ...data })),
      save: sinon
        .stub()
        .callsFake((data: any) => Promise.resolve({ id: "test-id", ...data })),
      delete: sinon.stub().resolves({ affected: 1 }),
    };

    service = new ContactService(
      contactRepo as any,
      eventBus as any,
      {
        transaction: sinon
          .stub()
          .callsFake((cb: any) =>
            cb({ getRepository: sinon.stub().returns(mockTxRepo) }),
          ),
      } as any,
      userBlock as any,
      new FileUrlService(createMockFileStorage() as any),
    );

    // Default stubs
    (contactRepo as any).findByUserPair = sinon.stub().resolves(null);
    (contactRepo as any).findById = sinon.stub().resolves(null);
    (contactRepo as any).findAllForUser = sinon.stub().resolves([[], 0]);
    (contactRepo as any).userExists = sinon.stub().resolves(true);
  });

  afterEach(() => sandbox.restore());

  // ───── addContact ─────

  describe("addContact", () => {
    it("should create 2 entries (initiator ACCEPTED, target PENDING) and emit ContactRequestEvent", async () => {
      const initiatorContact = makeContactEntity({
        status: EContactStatus.ACCEPTED,
      });

      (contactRepo as any).findById.resolves(initiatorContact);

      const result = await service.addContact(userId, contactUserId, "Friend");

      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(
        ContactRequestEvent,
      );

      expect(result).to.have.property("id", "contact-1");
    });

    it("should throw BadRequestException when adding self", async () => {
      try {
        await service.addContact(userId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 400);
        expect(err).to.have.property("code", "CONTACT_SELF");
      }
    });

    it("should throw ConflictException when contact already exists", async () => {
      (contactRepo as any).findByUserPair.resolves(makeContactEntity());

      try {
        await service.addContact(userId, contactUserId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 409);
        expect(err).to.have.property("code", "CONTACT_ALREADY_EXISTS");
      }
    });

    it("should throw ForbiddenException when either side blocked the other", async () => {
      userBlock.isBlockedEither.resolves(true);

      try {
        await service.addContact(userId, contactUserId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 403);
        expect(err).to.have.property("code", "CONTACT_BLOCKED");
      }
      expect(userBlock.isBlockedEither.calledWith(userId, contactUserId)).to.be
        .true;
    });

    it("несуществующий пользователь — NotFoundException", async () => {
      (contactRepo as any).userExists.resolves(false);

      try {
        await service.addContact(userId, contactUserId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 404);
      }
    });
  });

  // ───── acceptContact ─────

  describe("acceptContact", () => {
    it("should change PENDING contact to ACCEPTED and emit ContactAcceptedEvent", async () => {
      const contact = makeContactEntity({ status: EContactStatus.PENDING });

      (contactRepo as any).findById.resolves(contact);

      const result = await service.acceptContact(userId, "contact-1");

      expect(contact.status).to.equal(EContactStatus.ACCEPTED);
      expect(contactRepo.save.calledOnce).to.be.true;
      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(
        ContactAcceptedEvent,
      );
      expect(result).to.have.property("status", EContactStatus.ACCEPTED);
    });

    it("should throw NotFoundException when contact not found", async () => {
      (contactRepo as any).findById.resolves(null);

      try {
        await service.acceptContact(userId, "nonexistent");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 404);
      }
    });

    it("should throw NotFoundException when contact belongs to another user", async () => {
      (contactRepo as any).findById.resolves(
        makeContactEntity({ userId: contactUserId }),
      );

      try {
        await service.acceptContact(userId, "contact-1");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 404);
      }
    });

    it("should throw BadRequestException when contact is not PENDING", async () => {
      (contactRepo as any).findById.resolves(
        makeContactEntity({ status: EContactStatus.ACCEPTED }),
      );

      try {
        await service.acceptContact(userId, "contact-1");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 400);
      }
    });
  });

  // ───── removeContact ─────

  describe("removeContact", () => {
    it("should remove both sides of the contact relationship", async () => {
      (contactRepo as any).findById.resolves(makeContactEntity());
      mockTxRepo.findOne.resolves(
        makeContactEntity({
          id: "reverse",
          userId: contactUserId,
          contactUserId: userId,
          status: EContactStatus.ACCEPTED,
        }),
      );

      await service.removeContact(userId, "contact-1");

      expect(mockTxRepo.delete.calledWith({ id: "contact-1" })).to.be.true;
      expect(mockTxRepo.delete.calledWith({ id: "reverse" })).to.be.true;
    });

    it("не удаляет встречную BLOCKED-строку (блокировка сохраняется)", async () => {
      (contactRepo as any).findById.resolves(makeContactEntity());
      mockTxRepo.findOne.resolves(
        makeContactEntity({
          id: "reverse",
          userId: contactUserId,
          contactUserId: userId,
          status: EContactStatus.BLOCKED,
        }),
      );

      await service.removeContact(userId, "contact-1");

      expect(mockTxRepo.delete.calledOnceWith({ id: "contact-1" })).to.be.true;
    });

    it("свою блокировку снимают только разблокировкой (409)", async () => {
      (contactRepo as any).findById.resolves(
        makeContactEntity({ status: EContactStatus.BLOCKED }),
      );

      try {
        await service.removeContact(userId, "contact-1");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 409);
      }
    });

    it("should throw NotFoundException when contact not found", async () => {
      (contactRepo as any).findById.resolves(null);

      try {
        await service.removeContact(userId, "nonexistent");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 404);
      }
    });

    it("should throw NotFoundException when contact belongs to another user", async () => {
      (contactRepo as any).findById.resolves(
        makeContactEntity({ userId: contactUserId }),
      );

      try {
        await service.removeContact(userId, "contact-1");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 404);
      }
    });
  });

  // ───── blockUser / unblockUser ─────

  describe("blockUser", () => {
    it("создаёт BLOCKED-строку, если контакта нет, и шлёт ContactBlockedEvent", async () => {
      (contactRepo as any).findByUserPair.resolves(null);
      (contactRepo as any).findById.resolves(
        makeContactEntity({ status: EContactStatus.BLOCKED }),
      );

      await service.blockUser(userId, contactUserId);

      expect(contactRepo.createAndSave.firstCall.args[0]).to.include({
        userId,
        contactUserId,
        status: EContactStatus.BLOCKED,
      });

      const event = eventBus.emit.firstCall.args[0] as ContactBlockedEvent;

      expect(event).to.be.instanceOf(ContactBlockedEvent);
      expect(event.blockedUserId).to.equal(contactUserId);
    });

    it("переводит существующий контакт в BLOCKED", async () => {
      const contact = makeContactEntity({ status: EContactStatus.ACCEPTED });

      (contactRepo as any).findByUserPair.resolves(contact);

      await service.blockUser(userId, contactUserId);

      expect(contact.status).to.equal(EContactStatus.BLOCKED);
      expect(contactRepo.save.calledOnce).to.be.true;
    });

    it("повторная блокировка — без события", async () => {
      (contactRepo as any).findByUserPair.resolves(
        makeContactEntity({ status: EContactStatus.BLOCKED }),
      );

      await service.blockUser(userId, contactUserId);

      expect(eventBus.emit.called).to.be.false;
    });

    it("себя — BadRequestException", async () => {
      try {
        await service.blockUser(userId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 400);
      }
    });

    it("несуществующий пользователь — NotFoundException", async () => {
      (contactRepo as any).userExists.resolves(false);

      try {
        await service.blockUser(userId, contactUserId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 404);
      }
    });
  });

  describe("unblockUser", () => {
    it("удаляет BLOCKED-строку и шлёт ContactUnblockedEvent", async () => {
      (contactRepo as any).findByUserPair.resolves(
        makeContactEntity({ status: EContactStatus.BLOCKED }),
      );

      await service.unblockUser(userId, contactUserId);

      expect(contactRepo.delete.calledWith({ id: "contact-1" })).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(
        ContactUnblockedEvent,
      );
    });

    it("не заблокирован — NotFoundException", async () => {
      (contactRepo as any).findByUserPair.resolves(
        makeContactEntity({ status: EContactStatus.ACCEPTED }),
      );

      try {
        await service.unblockUser(userId, contactUserId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 404);
      }
      expect(contactRepo.delete.called).to.be.false;
    });
  });

  // ───── getContacts ─────

  describe("getContacts", () => {
    it("should return all contacts for the user", async () => {
      const contacts = [
        makeContactEntity(),
        makeContactEntity({ id: "contact-2", contactUserId: "user-3" }),
      ];

      (contactRepo as any).findAllForUser.resolves([contacts, 2]);

      const result = await service.getContacts(userId);

      expect(result.items).to.have.length(2);
      expect(result).to.include({ total: 2, offset: 0, limit: 20 });
      expect(
        (contactRepo as any).findAllForUser.calledWith(
          userId,
          undefined,
          0,
          20,
        ),
      ).to.be.true;
    });

    it("should return filtered contacts by status", async () => {
      const contacts = [makeContactEntity({ status: EContactStatus.PENDING })];

      (contactRepo as any).findAllForUser.resolves([contacts, 1]);

      const result = await service.getContacts(
        userId,
        EContactStatus.PENDING,
        10,
        5,
      );

      expect(result.items).to.have.length(1);
      expect(
        (contactRepo as any).findAllForUser.calledWith(
          userId,
          EContactStatus.PENDING,
          10,
          5,
        ),
      ).to.be.true;
    });

    it("недопустимый status — CONTACT_INVALID_STATUS", async () => {
      try {
        await service.getContacts(userId, "weird" as EContactStatus);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.have.property("status", 400);
        expect(err).to.have.property("code", "CONTACT_INVALID_STATUS");
      }
    });

    it("should return empty page when no contacts", async () => {
      (contactRepo as any).findAllForUser.resolves([[], 0]);

      const result = await service.getContacts(userId);

      expect(result.items).to.have.length(0);
      expect(result.total).to.equal(0);
    });
  });
});
