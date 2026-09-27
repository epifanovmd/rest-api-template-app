import "reflect-metadata";

import { expect } from "chai";

import { S3FileStorage } from "./s3-file.storage";

const options = {
  bucket: "files",
  region: "us-east-1",
  endpoint: "http://s3:8333",
  accessKeyId: "key",
  secretAccessKey: "secret",
  forcePathStyle: true,
  ttlSeconds: 600,
};

describe("S3FileStorage: публичный адрес ссылок", () => {
  it("ссылки подписываются публичным адресом, а не внутренним", async () => {
    const storage = new S3FileStorage({
      ...options,
      publicEndpoint: "https://files.example.com",
    });

    const get = new URL(await storage.signedGetUrl("a/b.png"));
    const put = new URL(
      await storage.signedPutUrl("a/b.png", {
        contentType: "image/png",
        contentLength: 10,
      }),
    );

    expect(get.origin).to.equal("https://files.example.com");
    expect(put.origin).to.equal("https://files.example.com");
    expect(get.searchParams.get("X-Amz-Signature")).to.be.a("string");
  });

  it("без публичного адреса — адрес хранилища", async () => {
    const storage = new S3FileStorage(options);

    expect(new URL(await storage.signedGetUrl("a/b.png")).origin).to.equal(
      "http://s3:8333",
    );
  });
});
