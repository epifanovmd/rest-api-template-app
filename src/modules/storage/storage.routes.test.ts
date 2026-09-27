import "reflect-metadata";

import KoaRouter from "@koa/router";
import { expect } from "chai";
import fs from "fs/promises";
import http from "http";
import Koa from "koa";
import { AddressInfo } from "net";
import os from "os";
import path from "path";

import { errorMiddleware } from "../../middleware/error.middleware";
import { LocalFileStorage } from "./local-file.storage";
import { StorageRouteProvider } from "./storage.routes";
import { StorageUrlSigner } from "./storage-url.signer";

interface IRawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** Сырой запрос: fetch нормализует `..` в URL, http.request — нет. */
const request = (
  port: number,
  method: string,
  rawPath: string,
  headers: Record<string, string> = {},
  body?: Buffer,
): Promise<IRawResponse> =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method, path: rawPath, headers },
      res => {
        let data = "";

        res.setEncoding("utf8");
        res.on("data", chunk => (data += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: data,
          }),
        );
      },
    );

    req.on("error", reject);
    req.end(body);
  });

const pathOf = (url: string) => {
  const parsed = new URL(url);

  return `${parsed.pathname}${parsed.search}`;
};

describe("StorageRouteProvider: /files по подписи", () => {
  let base: string;
  let server: http.Server;
  let port: number;
  let storage: LocalFileStorage;
  let signer: StorageUrlSigner;

  before(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), "storage-routes-"));
    await fs.writeFile(path.join(base, "secret.txt"), "TOP-SECRET");
    signer = new StorageUrlSigner({
      secret: "s".repeat(32),
      publicUrl: "http://api.test",
      ttlSeconds: 600,
    });
    storage = new LocalFileStorage(signer, path.join(base, "root"));
    await storage.put("files/1/photo.png", Buffer.from("0123456789"), {
      contentType: "image/png",
    });
    await storage.put("files/1/page.html", Buffer.from("<script>1</script>"), {
      contentType: "text/html",
    });

    const app = new Koa();
    const router = new KoaRouter();

    new StorageRouteProvider(storage, signer).register(router);
    app.use(errorMiddleware);
    app.use(router.routes());
    app.use(router.allowedMethods());
    server = app.listen(0);
    port = (server.address() as AddressInfo).port;
  });

  after(async () => {
    server.close();
    await fs.rm(base, { recursive: true, force: true });
  });

  it("GET по подписи: 200, тип, nosniff, private-кэш, inline для медиа", async () => {
    const res = await request(
      port,
      "GET",
      pathOf(signer.getUrl("files/1/photo.png")),
    );

    expect(res.status).to.equal(200);
    expect(res.body).to.equal("0123456789");
    expect(res.headers["content-type"]).to.equal("image/png");
    expect(res.headers["x-content-type-options"]).to.equal("nosniff");
    expect(res.headers["cache-control"]).to.match(/^private, max-age=\d+$/);
    expect(res.headers["content-disposition"]).to.equal("inline");
    expect(res.headers["accept-ranges"]).to.equal("bytes");
  });

  it("не-медиа отдаётся вложением; dl — вложение с именем", async () => {
    const html = await request(
      port,
      "GET",
      pathOf(signer.getUrl("files/1/page.html")),
    );

    expect(html.headers["content-disposition"]).to.equal("attachment");

    const named = await request(
      port,
      "GET",
      pathOf(signer.getUrl("files/1/photo.png", { downloadName: "фото.png" })),
    );

    expect(named.headers["content-disposition"]).to.equal(
      `attachment; filename*=UTF-8''${encodeURIComponent("фото.png")}`,
    );
  });

  it("без подписи, с чужой подписью или просроченная — 403", async () => {
    const noSig = await request(port, "GET", "/files/files/1/photo.png");
    const url = new URL(signer.getUrl("files/1/photo.png"));
    const forged = await request(
      port,
      "GET",
      `/files/files/1/page.html${url.search}`,
    );
    const expired = new StorageUrlSigner({
      secret: "s".repeat(32),
      publicUrl: "http://api.test",
      ttlSeconds: -10,
    });
    const old = await request(
      port,
      "GET",
      pathOf(expired.getUrl("files/1/photo.png")),
    );

    expect(noSig.status).to.equal(403);
    expect(JSON.parse(noSig.body).code).to.equal("STORAGE_SIGNATURE_INVALID");
    expect(forged.status).to.equal(403);
    expect(old.status).to.equal(403);
    expect(JSON.parse(old.body).code).to.equal("STORAGE_URL_EXPIRED");
  });

  it("выход за корень через .. и его кодировки — 400, содержимое не утекает", async () => {
    for (const raw of [
      "/files/../secret.txt",
      "/files/%2e%2e/secret.txt",
      "/files/files/%2e%2e%2f%2e%2e%2fsecret.txt",
      "/files/..%5csecret.txt",
    ]) {
      const res = await request(port, "GET", `${raw}?exp=9999999999&sig=x`);

      expect(res.body, raw).to.not.include("TOP-SECRET");
      expect(res.status, raw).to.be.oneOf([400, 404]);
    }
  });

  it("Range: 206 с Content-Range, 416 за пределами", async () => {
    const url = pathOf(signer.getUrl("files/1/photo.png"));
    const partial = await request(port, "GET", url, { Range: "bytes=2-4" });
    const tail = await request(port, "GET", url, { Range: "bytes=-3" });
    const bad = await request(port, "GET", url, { Range: "bytes=50-" });

    expect(partial.status).to.equal(206);
    expect(partial.body).to.equal("234");
    expect(partial.headers["content-range"]).to.equal("bytes 2-4/10");
    expect(partial.headers["content-length"]).to.equal("3");
    expect(tail.body).to.equal("789");
    expect(bad.status).to.equal(416);
    expect(bad.headers["content-range"]).to.equal("bytes */10");
  });

  it("ETag / If-None-Match → 304; HEAD без тела с длиной", async () => {
    const url = pathOf(signer.getUrl("files/1/photo.png"));
    const first = await request(port, "GET", url);
    const etag = String(first.headers.etag);
    const cached = await request(port, "GET", url, { "If-None-Match": etag });
    const head = await request(port, "HEAD", url);

    expect(etag).to.match(/^".+"$/);
    expect(cached.status).to.equal(304);
    expect(cached.body).to.equal("");
    expect(head.status).to.equal(200);
    expect(head.body).to.equal("");
    expect(head.headers["content-length"]).to.equal("10");
  });

  it("отсутствующий объект с верной подписью — 404", async () => {
    const res = await request(
      port,
      "GET",
      pathOf(signer.getUrl("files/1/none.png")),
    );

    expect(res.status).to.equal(404);
  });

  it("PUT по подписи сохраняет объект с подписанным типом", async () => {
    const url = pathOf(
      signer.putUrl("up/a.png", { contentType: "image/png", contentLength: 4 }),
    );
    const res = await request(
      port,
      "PUT",
      url,
      { "Content-Type": "image/png" },
      Buffer.from("PNG!"),
    );

    expect(res.status).to.equal(204);
    expect(await storage.stat("up/a.png")).to.include({
      size: 4,
      contentType: "image/png",
    });
  });

  it("PUT: больше подписанного размера — 413, меньше — 400, объект не остаётся", async () => {
    const url = pathOf(signer.putUrl("up/b.bin", { contentLength: 4 }));
    const big = await request(port, "PUT", url, {}, Buffer.from("123456"));
    const small = await request(port, "PUT", url, {}, Buffer.from("12"));

    const chunked = await request(
      port,
      "PUT",
      url,
      { "Transfer-Encoding": "chunked" },
      Buffer.from("123456"),
    );

    expect(big.status).to.equal(413);
    expect(chunked.status).to.equal(413);
    expect(small.status).to.equal(400);
    expect(JSON.parse(small.body).code).to.equal("STORAGE_SIZE_MISMATCH");
    expect(await storage.stat("up/b.bin")).to.equal(null);
  });

  it("PUT: чужой Content-Type — 415; GET-подпись для PUT не годится", async () => {
    const url = pathOf(signer.putUrl("up/c.png", { contentType: "image/png" }));
    const wrongType = await request(
      port,
      "PUT",
      url,
      { "Content-Type": "text/html" },
      Buffer.from("x"),
    );
    const getSigned = await request(
      port,
      "PUT",
      pathOf(signer.getUrl("up/c.png")),
      {},
      Buffer.from("x"),
    );

    expect(wrongType.status).to.equal(415);
    expect(getSigned.status).to.equal(403);
    expect(await storage.stat("up/c.png")).to.equal(null);
  });
});
