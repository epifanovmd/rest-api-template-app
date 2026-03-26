import "reflect-metadata";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@force-dev/utils";
import { expect } from "chai";
import sinon from "sinon";

import { createMockEventBus, createMockRepository, uuid, uuid2 } from "../../test/helpers";
import { ContactService } from "./contact.service";
import { EContactStatus } from "./contact.types";
import { ContactAcceptedEvent, ContactRequestEvent } from "./events";

describe("ContactService", () => {
  let service: ContactService;
  let contactRepo: ReturnType<typeof createMockRepository>;
  let eventBus: ReturnType<typeof createMockEventBus>;
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

    service = new ContactService(
      contactRepo as any,
      eventBus as any,
    );

    // Default stubs
    (contactRepo as any).findByUserPair = sinon.stub().resolves(null);
    (contactRepo as any).findById = sinon.stub().resolves(null);
    (contactRepo as any).findAllForUser = sinon.stub().resolves([]);
  });

  afterEach(() => sandbox.restore());

  // ───── addContact ─────

  describe("addContact", () => {
    it("should create 2 entries (initiator ACCEPTED, target PENDING) and emit ContactRequestEvent", async () => {
      const initiatorContact = makeContactEntity({ status: EContactStatus.ACCEPTED });

      contactRepo.createAndSave
        .onFirstCall().resolves(initiatorContact)
        .onSecondCall().resolves(makeContactEntity({ id: "contact-2", userId: contactUserId, contactUserId: userId, status: EContactStatus.PENDING }));
      (contactRepo as any).findById.resolves(initiatorContact);

      const result = await service.addContact(userId, contactUserId, "Friend");

      expect(contactRepo.createAndSave.calledTwice).to.be.true;

      // First call: initiator with ACCEPTED
      const firstCall = contactRepo.createAndSave.firstCall.args[0];

      expect(firstCall.userId).to.equal(userId);
      expect(firstCall.contactUserId).to.equal(contactUserId);
      expect(firstCall.status).to.equal(EContactStatus.ACCEPTED);
      expect(firstCall.displayName).to.equal("Friend");

      // Second call: target with PENDING
      const secondCall = contactRepo.createAndSave.secondCall.args[0];

      expect(secondCall.userId).to.equal(contactUserId);
      expect(secondCall.contactUserId).to.equal(userId);
      expect(secondCall.status).to.equal(EContactStatus.PENDING);

      expect(eventBus.emit.calledOnce).to.be.true;
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(ContactRequestEvent);

      expect(result).to.have.property("id", "contact-1");
    });

    it("should throw BadRequestException when adding self", async () => {
      try {
        await service.addContact(userId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });

    it("should throw ConflictException when contact already exists", async () => {
      (contactRepo as any).findByUserPair.resolves(makeContactEntity());

      try {
        await service.addContact(userId, contactUserId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ConflictException);
      }
    });

    it("should throw ForbiddenException when contact is blocked", async () => {
      (contactRepo as any).findByUserPair.resolves(makeContactEntity({ status: EContactStatus.BLOCKED }));

      try {
        await service.addContact(userId, contactUserId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
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
      expect(eventBus.emit.firstCall.args[0]).to.be.instanceOf(ContactAcceptedEvent);
      expect(result).to.have.property("status", EContactStatus.ACCEPTED);
    });

    it("should throw NotFoundException when contact not found", async () => {
      (contactRepo as any).findById.resolves(null);

      try {
        await service.acceptContact(userId, "nonexistent");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });

    it("should throw NotFoundException when contact belongs to another user", async () => {
      (contactRepo as any).findById.resolves(makeContactEntity({ userId: contactUserId }));

      try {
        await service.acceptContact(userId, "contact-1");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });

    it("should throw BadRequestException when contact is not PENDING", async () => {
      (contactRepo as any).findById.resolves(makeContactEntity({ status: EContactStatus.ACCEPTED }));

      try {
        await service.acceptContact(userId, "contact-1");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });
  });

  // ───── removeContact ─────

  describe("removeContact", () => {
    it("should remove both sides of the contact relationship", async () => {
      (contactRepo as any).findById.resolves(makeContactEntity());

      const result = await service.removeContact(userId, "contact-1");

      expect(contactRepo.delete.calledTwice).to.be.true;

      // First delete: initiator side
      expect(contactRepo.delete.firstCall.args[0]).to.deep.equal({
        userId,
        contactUserId,
      });

      // Second delete: target side
      expect(contactRepo.delete.secondCall.args[0]).to.deep.equal({
        userId: contactUserId,
        contactUserId: userId,
      });

      expect(result).to.equal("contact-1");
    });

    it("should throw NotFoundException when contact not found", async () => {
      (contactRepo as any).findById.resolves(null);

      try {
        await service.removeContact(userId, "nonexistent");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });

    it("should throw NotFoundException when contact belongs to another user", async () => {
      (contactRepo as any).findById.resolves(makeContactEntity({ userId: contactUserId }));

      try {
        await service.removeContact(userId, "contact-1");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  // ───── blockContact ─────

  describe("blockContact", () => {
    it("should change status to BLOCKED", async () => {
      const contact = makeContactEntity({ status: EContactStatus.ACCEPTED });

      (contactRepo as any).findById.resolves(contact);

      const result = await service.blockContact(userId, "contact-1");

      expect(contact.status).to.equal(EContactStatus.BLOCKED);
      expect(contactRepo.save.calledOnce).to.be.true;
      expect(result).to.have.property("status", EContactStatus.BLOCKED);
    });

    it("should throw NotFoundException when contact not found", async () => {
      (contactRepo as any).findById.resolves(null);

      try {
        await service.blockContact(userId, "nonexistent");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });

    it("should throw NotFoundException when contact belongs to another user", async () => {
      (contactRepo as any).findById.resolves(makeContactEntity({ userId: contactUserId }));

      try {
        await service.blockContact(userId, "contact-1");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  // ───── getContacts ─────

  describe("getContacts", () => {
    it("should return all contacts for the user", async () => {
      const contacts = [
        makeContactEntity(),
        makeContactEntity({ id: "contact-2", contactUserId: "user-3" }),
      ];

      (contactRepo as any).findAllForUser.resolves(contacts);

      const result = await service.getContacts(userId);

      expect(result).to.have.length(2);
      expect((contactRepo as any).findAllForUser.calledWith(userId, undefined)).to.be.true;
    });

    it("should return filtered contacts by status", async () => {
      const contacts = [makeContactEntity({ status: EContactStatus.PENDING })];

      (contactRepo as any).findAllForUser.resolves(contacts);

      const result = await service.getContacts(userId, EContactStatus.PENDING);

      expect(result).to.have.length(1);
      expect((contactRepo as any).findAllForUser.calledWith(userId, EContactStatus.PENDING)).to.be.true;
    });

    it("should return empty array when no contacts", async () => {
      (contactRepo as any).findAllForUser.resolves([]);

      const result = await service.getContacts(userId);

      expect(result).to.have.length(0);
    });
  });
});
