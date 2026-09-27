import "reflect-metadata";

import { expect } from "chai";

import { createMockFileStorage } from "../../test/helpers";
import { File } from "./file.entity";
import { EFileStatus } from "./file.types";
import { FileUrlService } from "./file-url.service";
import { NO_SIGNED_FILES, signedFileOf, signedUrlOf } from "./signed-files";

const file = (id: string, status = EFileStatus.Ready) =>
  ({
    id,
    name: `${id}.png`,
    status,
    key: `files/${id}/original.png`,
    optimizedKey: null,
    thumbnailKey: null,
    mediumKey: null,
  }) as unknown as File;

describe("FileUrlService", () => {
  let storage: ReturnType<typeof createMockFileStorage>;
  let service: FileUrlService;

  beforeEach(() => {
    storage = createMockFileStorage();
    service = new FileUrlService(storage as any);
  });

  describe("toDtoMap", () => {
    it("подписывает пачкой: повторы и пустые пропускаются", async () => {
      const a = file("a");
      const files = await service.toDtoMap([a, null, undefined, a, file("b")]);

      expect([...files.keys()]).to.deep.equal(["a", "b"]);
      expect(files.get("a")!.url).to.equal(
        "https://files.test/files/a/original.png?sig=x",
      );
      // url + downloadUrl на каждый уникальный файл
      expect(storage.signedGetUrl.callCount).to.equal(4);
    });

    it("нет файлов — пустая карта без обращений к хранилищу", async () => {
      const files = await service.toDtoMap([null, undefined]);

      expect(files.size).to.equal(0);
      expect(storage.signedGetUrl.called).to.be.false;
    });

    it("pending-файл: ссылок нет", async () => {
      const files = await service.toDtoMap([file("p", EFileStatus.Pending)]);

      expect(files.get("p")).to.include({ url: null, downloadUrl: null });
    });
  });

  describe("buildWithFiles", () => {
    it("собирает DTO из одной карты подписей на все сущности", async () => {
      const entities = [{ avatar: file("a") }, { avatar: null }];

      const dtos = await service.buildWithFiles(
        entities,
        list => list.map(e => e.avatar),
        (entity, files) => signedUrlOf(entity.avatar, files),
      );

      expect(dtos).to.deep.equal([
        "https://files.test/files/a/original.png?sig=x",
        null,
      ]);
    });

    it("buildOneWithFiles — для одной сущности", async () => {
      const dto = await service.buildOneWithFiles(
        { avatar: file("a") },
        list => list.map(e => e.avatar),
        (entity, files) => signedFileOf(entity.avatar, files)?.id,
      );

      expect(dto).to.equal("a");
    });
  });

  it("signedUrlOf / signedFileOf: нет в карте — пусто, синхронной подписи нет", () => {
    expect(signedUrlOf(file("a"), NO_SIGNED_FILES)).to.equal(null);
    expect(signedFileOf(file("a"), NO_SIGNED_FILES)).to.equal(undefined);
    expect(signedUrlOf(null, NO_SIGNED_FILES)).to.equal(null);
  });
});
