import "reflect-metadata";

import multer from "@koa/multer";
import { expect } from "chai";
import http from "http";
import Koa from "koa";
import type { AddressInfo } from "net";
import os from "os";

import { UnsupportedMediaTypeException } from "./core/http";
import multerOpts, { UPLOAD_TMP_DIR } from "./multerOpts";

type FileFilterCallback = Parameters<
  NonNullable<typeof multerOpts.fileFilter>
>[2];

const runFilter = (mimetype: string, originalname = "file.png") =>
  new Promise<{ error: unknown; accepted?: boolean }>(resolve => {
    const callback = ((error: unknown, accepted?: boolean) =>
      resolve({ error, accepted })) as FileFilterCallback;

    multerOpts.fileFilter!(
      {} as never,
      { mimetype, originalname } as multer.File,
      callback,
    );
  });

describe("multerOpts.fileFilter", () => {
  it("пропускает разрешённый тип", async () => {
    const { error, accepted } = await runFilter("image/png");

    expect(error).to.equal(null);
    expect(accepted).to.equal(true);
  });

  it("недопустимый тип отклоняет HTTP 415, а не 500", async () => {
    const { error } = await runFilter("application/x-msdownload", "a.exe");

    expect(error).to.be.instanceOf(UnsupportedMediaTypeException);
    expect((error as UnsupportedMediaTypeException).status).to.equal(415);
  });

  it("расширение вне белого списка при разрешённом mime — 415", async () => {
    const { error } = await runFilter("image/png", "page.html");

    expect(error).to.be.instanceOf(UnsupportedMediaTypeException);
  });

  it("mime не соответствует расширению — 415", async () => {
    const { error } = await runFilter("text/plain", "photo.png");

    expect(error).to.be.instanceOf(UnsupportedMediaTypeException);
  });
});

describe("multerOpts.limits", () => {
  it("ограничивает число файлов, частей и размер полей", () => {
    expect(multerOpts.limits).to.include.keys("files", "parts", "fieldSize");
  });
});

describe("multerOpts.storage", () => {
  it("пишет во временный каталог, а не в хранилище файлов", () => {
    expect(UPLOAD_TMP_DIR.startsWith(os.tmpdir())).to.equal(true);
  });
});

describe("multerOpts: имя файла", () => {
  it("кириллица в имени (сырой UTF-8, как шлют браузер и RN) не превращается в кракозябры", async () => {
    const app = new Koa();
    let originalname = "";

    app.use(multer(multerOpts).single("file"));
    app.use(ctx => {
      originalname = (ctx as unknown as { file: multer.File }).file
        .originalname;
      ctx.status = 204;
    });

    const server = http.createServer(app.callback()).listen(0);
    const { port } = server.address() as AddressInfo;
    const boundary = "----test";
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="Снимок экрана.png"\r\nContent-Type: image/png\r\n\r\n`,
        "utf8",
      ),
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ]);

    try {
      await fetch(`http://127.0.0.1:${port}/`, {
        method: "POST",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });
    } finally {
      server.close();
    }

    expect(originalname).to.equal("Снимок экрана.png");
  });
});
