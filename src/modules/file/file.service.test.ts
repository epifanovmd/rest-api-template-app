import "reflect-metadata";

import { NotFoundException } from "@force-dev/utils";
import { expect } from "chai";
import sinon from "sinon";

import { createMockRepository, uuid, uuid2 } from "../../test/helpers";
import { FileService } from "./file.service";

describe("FileService", () => {
  let service: FileService;
  let fileRepo: ReturnType<typeof createMockRepository>;
  let sandbox: sinon.SinonSandbox;

  const fileId = uuid();

  const makeFileEntity = (overrides: Record<string, unknown> = {}) => ({
    id: fileId,
    name: "photo.jpg",
    type: "image/jpeg",
    url: "/uploads/photo.jpg",
    size: 1024,
    thumbnailUrl: "/uploads/photo_thumb.webp",
    width: 800,
    height: 600,
    createdAt: new Date(),
    updatedAt: new Date(),
    toDTO() {
      return {
        id: this.id,
        name: this.name,
        type: this.type,
        url: this.url,
        size: this.size,
        thumbnailUrl: this.thumbnailUrl,
        width: this.width,
        height: this.height,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
      };
    },
    ...overrides,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    fileRepo = createMockRepository();

    (fileRepo as any).findById = sinon.stub().resolves(null);

    service = new FileService(fileRepo as any);
  });

  afterEach(() => sandbox.restore());

  describe("getFileById", () => {
    it("should return file DTO when found", async () => {
      const file = makeFileEntity();

      (fileRepo as any).findById.resolves(file);

      const result = await service.getFileById(fileId);

      expect((fileRepo as any).findById.calledOnceWith(fileId)).to.be.true;
      expect(result).to.have.property("id", fileId);
      expect(result).to.have.property("name", "photo.jpg");
      expect(result).to.have.property("type", "image/jpeg");
      expect(result).to.have.property("size", 1024);
    });

    it("should throw NotFoundException when file not found", async () => {
      (fileRepo as any).findById.resolves(null);

      try {
        await service.getFileById(fileId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });

  describe("uploadFile", () => {
    it("should create file entities for non-image files", async () => {
      const file = {
        originalname: "document.pdf",
        mimetype: "application/pdf",
        path: "/tmp/uploads/document.pdf",
        size: 2048,
      };

      const savedEntity = makeFileEntity({
        name: "document.pdf",
        type: "application/pdf",
        url: "/tmp/uploads/document.pdf",
        size: 2048,
        thumbnailUrl: null,
        width: null,
        height: null,
      });

      fileRepo.createAndSave.resolves(savedEntity);

      const result = await service.uploadFile([file as any]);

      expect(fileRepo.createAndSave.calledOnce).to.be.true;
      expect(result).to.have.length(1);
      expect(result[0]).to.have.property("name", "document.pdf");
    });
  });

  describe("deleteFile", () => {
    it("should delete from DB and return true", async () => {
      const file = makeFileEntity();

      (fileRepo as any).findById.resolves(file);
      fileRepo.delete.resolves({ affected: 1 });

      // Stub the private method to prevent actual file system calls
      sandbox.stub(service as any, "_deleteFileFromServer").resolves();

      const result = await service.deleteFile(fileId);

      expect(result).to.be.true;
      expect(fileRepo.delete.calledOnceWith(fileId)).to.be.true;
    });

    it("should throw NotFoundException when file not found", async () => {
      (fileRepo as any).findById.resolves(null);

      try {
        await service.deleteFile(fileId);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).to.be.instanceOf(NotFoundException);
      }
    });
  });
});
