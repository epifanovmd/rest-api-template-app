import { expect } from "chai";
import fs from "fs/promises";
import os from "os";
import path from "path";

import {
  defineUploadRules,
  isAllowedUpload,
  isInlineMedia,
  resetUploadRules,
  verifyFileSignature,
  verifyFileSignatureHead,
} from "./file-upload.policy";

const PNG_HEADER = Buffer.from("89504E470D0A1A0A0000000D49484452", "hex");
const PDF_HEADER = Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj\n", "latin1");

describe("file-upload.policy", () => {
  let dir: string;

  const write = async (name: string, data: Buffer | string) => {
    const filePath = path.join(dir, name);

    await fs.writeFile(filePath, data);

    return filePath;
  };

  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "upload-policy-"));
  });

  after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  describe("isAllowedUpload", () => {
    it("пропускает расширение из белого списка с согласованным mime", () => {
      expect(isAllowedUpload("photo.PNG", "image/png")).to.equal(true);
      expect(isAllowedUpload("doc.pdf", "application/pdf")).to.equal(true);
    });

    it("отклоняет расширение вне белого списка", () => {
      expect(isAllowedUpload("run.exe", "application/octet-stream")).to.equal(
        false,
      );
      expect(isAllowedUpload("page.html", "text/html")).to.equal(false);
      expect(isAllowedUpload("noext", "image/png")).to.equal(false);
    });

    it("отклоняет расхождение расширения и mime", () => {
      expect(isAllowedUpload("photo.png", "application/pdf")).to.equal(false);
      expect(isAllowedUpload("script.txt", "image/png")).to.equal(false);
    });
  });

  describe("verifyFileSignature", () => {
    it("совпадение магических байт с расширением — ок", async () => {
      const file = await write("a.png", PNG_HEADER);

      expect(await verifyFileSignature(file, "photo.png")).to.equal(true);
    });

    it("pdf с сигнатурой pdf — ок", async () => {
      const file = await write("b.pdf", PDF_HEADER);

      expect(await verifyFileSignature(file, "doc.pdf")).to.equal(true);
    });

    it("подмена: png-сигнатура под расширением pdf — отказ", async () => {
      const file = await write("c.pdf", PNG_HEADER);

      expect(await verifyFileSignature(file, "doc.pdf")).to.equal(false);
    });

    it("бинарь без сигнатуры под видом картинки — отказ", async () => {
      const file = await write("d.png", "just text, not an image");

      expect(await verifyFileSignature(file, "photo.png")).to.equal(false);
    });

    it("текстовый файл без сигнатуры — ок", async () => {
      const file = await write("e.txt", "hello,world\n1,2\n");

      expect(await verifyFileSignature(file, "notes.txt")).to.equal(true);
    });

    it("бинарь под видом текста — отказ", async () => {
      const file = await write("f.txt", PNG_HEADER);

      expect(await verifyFileSignature(file, "notes.txt")).to.equal(false);
    });
  });

  describe("verifyFileSignatureHead", () => {
    it("проверяет начало объекта без файла на диске", async () => {
      expect(await verifyFileSignatureHead(PNG_HEADER, "a.png")).to.equal(true);
      expect(await verifyFileSignatureHead(PDF_HEADER, "a.pdf")).to.equal(true);
      expect(await verifyFileSignatureHead(PNG_HEADER, "a.pdf")).to.equal(
        false,
      );
      expect(
        await verifyFileSignatureHead(Buffer.from("a,b\n1,2"), "t.csv"),
      ).to.equal(true);
      expect(await verifyFileSignatureHead(PNG_HEADER, "t.txt")).to.equal(
        false,
      );
      expect(await verifyFileSignatureHead(PNG_HEADER, "a.exe")).to.equal(
        false,
      );
    });
  });

  describe("isInlineMedia", () => {
    it("медиа отдаётся inline, остальное — вложением", () => {
      expect(isInlineMedia("abc.webp")).to.equal(true);
      expect(isInlineMedia("abc.m4a")).to.equal(true);
      expect(isInlineMedia("abc.pdf")).to.equal(false);
      expect(isInlineMedia("abc.txt")).to.equal(false);
    });
  });

  describe("defineUploadRules", () => {
    afterEach(() => resetUploadRules());

    it("модуль добавляет свои форматы: zip-контейнер и бинарный без сигнатуры", async () => {
      defineUploadRules({
        pt: {
          mimes: ["application/octet-stream"],
          signatures: ["zip"],
          inline: false,
        },
        onnx: {
          mimes: ["application/octet-stream"],
          signatures: "binary",
          inline: false,
        },
      });

      expect(isAllowedUpload("best.pt", "application/octet-stream")).to.equal(
        true,
      );
      expect(isAllowedUpload("best.pt", "image/png")).to.equal(false);

      const zipHead = Buffer.from("504B030414000000", "hex");
      const onnx = Buffer.from([
        0x08, 0x07, 0x12, 0x07, 0x70, 0x79, 0x74, 0x6f,
      ]);

      expect(await verifyFileSignatureHead(zipHead, "best.pt")).to.equal(true);
      expect(await verifyFileSignatureHead(PNG_HEADER, "best.pt")).to.equal(
        false,
      );
      expect(await verifyFileSignatureHead(onnx, "model.onnx")).to.equal(true);
      // «Бинарный» формат не должен оказаться узнаваемым файлом другого типа.
      expect(await verifyFileSignatureHead(PNG_HEADER, "model.onnx")).to.equal(
        false,
      );
      expect(isInlineMedia("best.pt")).to.equal(false);
    });

    it("базовое расширение переопределить нельзя, имя расширения проверяется", () => {
      const rule = { mimes: ["image/png"], signatures: ["png"], inline: true };

      expect(() => defineUploadRules({ png: rule })).to.throw();
      expect(() => defineUploadRules({ "../x": rule })).to.throw();
    });
  });
});
