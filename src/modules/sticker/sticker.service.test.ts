import "reflect-metadata";

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@force-dev/utils";
import { expect } from "chai";
import sinon from "sinon";

import {
  createMockRepository,
  uuid,
  uuid2,
  uuid3,
} from "../../test/helpers";
import { StickerService } from "./sticker.service";

describe("StickerService", () => {
  let service: StickerService;
  let packRepo: ReturnType<typeof createMockRepository>;
  let stickerRepo: ReturnType<typeof createMockRepository>;
  let userPackRepo: ReturnType<typeof createMockRepository>;
  let sandbox: sinon.SinonSandbox;

  const userId = uuid();
  const packId = uuid2();
  const stickerId = uuid3();

  const makePack = (overrides: Record<string, unknown> = {}) => ({
    id: packId,
    name: "cool_pack",
    title: "Cool Pack",
    creatorId: userId,
    isOfficial: false,
    isAnimated: false,
    stickers: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const makeSticker = (overrides: Record<string, unknown> = {}) => ({
    id: stickerId,
    packId,
    emoji: "😀",
    fileId: "file-1",
    position: 0,
    createdAt: new Date(),
    file: { url: "/files/sticker.webp" },
    pack: makePack(),
    ...overrides,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    packRepo = createMockRepository();
    stickerRepo = createMockRepository();
    userPackRepo = createMockRepository();

    (packRepo as any).findById = sinon.stub().resolves(null);
    (packRepo as any).searchPacks = sinon.stub().resolves([[], 0]);
    (packRepo as any).findFeatured = sinon.stub().resolves([[], 0]);
    (stickerRepo as any).findById = sinon.stub().resolves(null);
    (stickerRepo as any).getMaxPosition = sinon.stub().resolves(-1);
    (userPackRepo as any).findByUserAndPack = sinon.stub().resolves(null);
    (userPackRepo as any).findByUser = sinon.stub().resolves([]);

    service = new StickerService(
      packRepo as any,
      stickerRepo as any,
      userPackRepo as any,
    );
  });

  afterEach(() => sandbox.restore());

  describe("createPack", () => {
    it("should create a sticker pack", async () => {
      const pack = makePack();

      packRepo.findOne.resolves(null); // no existing pack with same name
      packRepo.create.returns(pack);
      packRepo.save.resolves(pack);
      (packRepo as any).findById.resolves(pack);

      const result = await service.createPack(userId, { name: "cool_pack", title: "Cool Pack" });

      expect(packRepo.create.calledOnce).to.be.true;
      expect(packRepo.save.calledOnce).to.be.true;
      expect(result).to.have.property("id", packId);
      expect(result).to.have.property("name", "cool_pack");
    });

    it("should throw when pack name already exists", async () => {
      packRepo.findOne.resolves(makePack());

      try {
        await service.createPack(userId, { name: "cool_pack", title: "Cool Pack" });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });
  });

  describe("addStickerToPack", () => {
    it("should add a sticker when creator", async () => {
      const pack = makePack();

      (packRepo as any).findById.resolves(pack);
      (stickerRepo as any).getMaxPosition.resolves(2);
      stickerRepo.create.returns(makeSticker({ position: 3 }));
      stickerRepo.save.resolves(makeSticker({ position: 3 }));

      // After adding, return updated pack
      (packRepo as any).findById.onSecondCall().resolves(makePack({ stickers: [makeSticker()] }));

      const result = await service.addStickerToPack(packId, userId, { fileId: "file-1" });

      expect(stickerRepo.create.calledOnce).to.be.true;
      const createArgs = stickerRepo.create.firstCall.args[0];

      expect(createArgs.position).to.equal(3);
      expect(result).to.have.property("id", packId);
    });

    it("should throw ForbiddenException when not the creator", async () => {
      const pack = makePack({ creatorId: "other-user" });

      (packRepo as any).findById.resolves(pack);

      try {
        await service.addStickerToPack(packId, userId, { fileId: "file-1" });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("should throw NotFoundException when pack not found", async () => {
      (packRepo as any).findById.resolves(null);

      try {
        await service.addStickerToPack(packId, userId, { fileId: "file-1" });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  describe("removeStickerFromPack", () => {
    it("should remove the sticker", async () => {
      const sticker = makeSticker();

      (stickerRepo as any).findById.resolves(sticker);

      await service.removeStickerFromPack(stickerId, userId);

      expect(stickerRepo.delete.calledOnceWith({ id: stickerId })).to.be.true;
    });

    it("should throw ForbiddenException when not the creator", async () => {
      const sticker = makeSticker({ pack: makePack({ creatorId: "other-user" }) });

      (stickerRepo as any).findById.resolves(sticker);

      try {
        await service.removeStickerFromPack(stickerId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(ForbiddenException);
      }
    });

    it("should throw NotFoundException when sticker not found", async () => {
      (stickerRepo as any).findById.resolves(null);

      try {
        await service.removeStickerFromPack(stickerId, userId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  describe("getPackById", () => {
    it("should return pack with stickers", async () => {
      const pack = makePack({ stickers: [makeSticker()] });

      (packRepo as any).findById.resolves(pack);

      const result = await service.getPackById(packId);

      expect(result).to.have.property("id", packId);
      expect(result.stickers).to.have.length(1);
    });

    it("should throw NotFoundException when pack not found", async () => {
      (packRepo as any).findById.resolves(null);

      try {
        await service.getPackById(packId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  describe("searchPacks", () => {
    it("should search by name and return paginated result", async () => {
      const packs = [makePack()];

      (packRepo as any).searchPacks.resolves([packs, 1]);

      const result = await service.searchPacks("cool", 10, 0);

      expect((packRepo as any).searchPacks.calledOnceWith("cool", 10, 0)).to.be.true;
      expect(result.data).to.have.length(1);
      expect(result.totalCount).to.equal(1);
    });

    it("should use default limit and offset", async () => {
      (packRepo as any).searchPacks.resolves([[], 0]);

      await service.searchPacks("test");

      expect((packRepo as any).searchPacks.calledOnceWith("test", 20, 0)).to.be.true;
    });
  });

  describe("addPackToUser", () => {
    it("should add pack association", async () => {
      (packRepo as any).findById.resolves(makePack());
      (userPackRepo as any).findByUserAndPack.resolves(null);
      userPackRepo.createAndSave.resolves({});

      await service.addPackToUser(userId, packId);

      expect(userPackRepo.createAndSave.calledOnce).to.be.true;
      const savedData = userPackRepo.createAndSave.firstCall.args[0];

      expect(savedData.userId).to.equal(userId);
      expect(savedData.packId).to.equal(packId);
    });

    it("should throw when pack not found", async () => {
      (packRepo as any).findById.resolves(null);

      try {
        await service.addPackToUser(userId, packId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });

    it("should throw when pack already added", async () => {
      (packRepo as any).findById.resolves(makePack());
      (userPackRepo as any).findByUserAndPack.resolves({ id: "existing" });

      try {
        await service.addPackToUser(userId, packId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(BadRequestException);
      }
    });
  });

  describe("removePackFromUser", () => {
    it("should remove the association", async () => {
      (userPackRepo as any).findByUserAndPack.resolves({ id: "assoc-1" });

      await service.removePackFromUser(userId, packId);

      expect(userPackRepo.delete.calledOnceWith({ id: "assoc-1" })).to.be.true;
    });

    it("should throw NotFoundException when association not found", async () => {
      (userPackRepo as any).findByUserAndPack.resolves(null);

      try {
        await service.removePackFromUser(userId, packId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  describe("getUserPacks", () => {
    it("should return user's packs", async () => {
      const pack = makePack();

      (userPackRepo as any).findByUser.resolves([{ pack }]);

      const result = await service.getUserPacks(userId);

      expect(result).to.have.length(1);
      expect(result[0]).to.have.property("id", packId);
    });

    it("should filter out entries without pack", async () => {
      (userPackRepo as any).findByUser.resolves([{ pack: null }, { pack: makePack() }]);

      const result = await service.getUserPacks(userId);

      expect(result).to.have.length(1);
    });
  });
});
