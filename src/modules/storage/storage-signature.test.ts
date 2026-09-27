import { expect } from "chai";

import { HttpException } from "../../core";
import {
  deriveSigningKey,
  expiryFor,
  signedQuery,
  verifySignedQuery,
} from "./storage-signature";
import { StorageUrlSigner } from "./storage-url.signer";

const key = deriveSigningKey("x".repeat(32));
const now = Date.UTC(2026, 0, 1, 0, 1);
const exp = Math.floor(now / 1000) + 60;

const query = (raw: string) => Object.fromEntries(new URLSearchParams(raw));

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (err) {
    return (err as HttpException).code;
  }

  return undefined;
};

describe("storage-signature", () => {
  it("верная подпись проходит и возвращает параметры", () => {
    const q = query(
      signedQuery(key, { method: "GET", key: "a/b.png", exp, dl: "b.png" }),
    );

    expect(verifySignedQuery(key, "GET", "a/b.png", q, now)).to.include({
      exp,
      dl: "b.png",
    });
  });

  it("просроченная ссылка — STORAGE_URL_EXPIRED", () => {
    const q = query(signedQuery(key, { method: "GET", key: "a", exp }));

    expect(
      codeOf(() => verifySignedQuery(key, "GET", "a", q, (exp + 1) * 1000)),
    ).to.equal("STORAGE_URL_EXPIRED");
  });

  it("подделанные ключ, срок, dl или метод — STORAGE_SIGNATURE_INVALID", () => {
    const raw = signedQuery(key, { method: "GET", key: "a", exp, dl: "x" });

    expect(
      codeOf(() => verifySignedQuery(key, "GET", "b", query(raw), now)),
    ).to.equal("STORAGE_SIGNATURE_INVALID");
    expect(
      codeOf(() =>
        verifySignedQuery(
          key,
          "GET",
          "a",
          { ...query(raw), exp: exp + 3600 },
          now,
        ),
      ),
    ).to.equal("STORAGE_SIGNATURE_INVALID");
    expect(
      codeOf(() =>
        verifySignedQuery(key, "GET", "a", { ...query(raw), dl: "y" }, now),
      ),
    ).to.equal("STORAGE_SIGNATURE_INVALID");
    expect(
      codeOf(() => verifySignedQuery(key, "PUT", "a", query(raw), now)),
    ).to.equal("STORAGE_SIGNATURE_INVALID");
  });

  it("подпись другим секретом не принимается", () => {
    const other = deriveSigningKey("y".repeat(32));
    const q = query(signedQuery(other, { method: "GET", key: "a", exp }));

    expect(codeOf(() => verifySignedQuery(key, "GET", "a", q, now))).to.equal(
      "STORAGE_SIGNATURE_INVALID",
    );
  });

  it("без sig или с нечисловым exp — STORAGE_SIGNATURE_INVALID", () => {
    expect(
      codeOf(() =>
        verifySignedQuery(key, "GET", "a", { exp: String(exp) }, now),
      ),
    ).to.equal("STORAGE_SIGNATURE_INVALID");
    expect(
      codeOf(() =>
        verifySignedQuery(key, "GET", "a", { exp: "x", sig: "s" }, now),
      ),
    ).to.equal("STORAGE_SIGNATURE_INVALID");
  });

  it("длинный срок округляется до корзины — ссылки стабильны для кэша", () => {
    const a = expiryFor(3600, now);
    const b = expiryFor(3600, now + 1000);

    expect(a).to.equal(b);
    expect(a % 300).to.equal(0);
    expect(expiryFor(60, now)).to.equal(Math.floor(now / 1000) + 60);
  });
});

describe("StorageUrlSigner", () => {
  const signer = new StorageUrlSigner({
    secret: "s".repeat(32),
    publicUrl: "https://api.test/",
    ttlSeconds: 60,
  });

  it("ссылка на публичный адрес с закодированными сегментами ключа", () => {
    const url = new URL(signer.getUrl("files/a b/ф.png"));

    expect(url.origin).to.equal("https://api.test");
    expect(url.pathname).to.equal("/files/files/a%20b/%D1%84.png");
    expect(() =>
      signer.verify(
        "GET",
        "files/a b/ф.png",
        Object.fromEntries(url.searchParams),
      ),
    ).not.to.throw();
  });

  it("ключ с выходом за корень не подписывается", () => {
    expect(codeOf(() => signer.getUrl("../etc/passwd"))).to.equal(
      "STORAGE_INVALID_KEY",
    );
  });
});
