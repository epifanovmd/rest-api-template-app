import { expect } from "chai";

import {
  Actor,
  call,
  expectStatus,
  items,
  mail,
  signUp,
  tokenFrom,
  uniqueEmail,
} from "./client";

describe("пример workspaces", () => {
  let alice: Actor;
  let bob: Actor;

  before(async () => {
    alice = await signUp("w-alice", { firstName: "Alice" });
    bob = await signUp("w-bob", { firstName: "Bob" });
  });

  describe("рабочие пространства", () => {
    it("новичок по ссылке из письма: email подтверждается принятием", async () => {
      const ws = expectStatus(
        await call(alice, "POST", "/api/v1/workspaces", {
          name: "Newcomers",
          slug: `new-${Date.now().toString(36)}`,
        }),
        201,
      );
      const email = uniqueEmail("w-newcomer");

      expectStatus(
        await call(alice, "POST", `/api/v1/workspaces/${ws.data.id}/invites`, {
          email,
          role: "viewer",
        }),
        201,
      );

      const token = tokenFrom(
        await mail.last(email, m => m.Text.includes("token=")),
      );
      const res = expectStatus(
        await call(null, "POST", "/api/v1/auth/sign-up", {
          email,
          password: "newcomer-Pass-2026",
        }),
        201,
      );
      const newcomer = res.data.tokens.accessToken;

      expectStatus(
        await call(newcomer, "POST", "/api/v1/workspaces/invites/accept", {
          token,
        }),
        200,
      );
      expect(
        expectStatus(await call(newcomer, "GET", "/api/v1/user/my"), 200).data
          .emailVerified,
      ).to.equal(true);
    });

    it("создание, приглашение по письму, роли, передача владения, удаление", async () => {
      const slug = `acme-${Date.now().toString(36)}`;
      const ws = expectStatus(
        await call(alice, "POST", "/api/v1/workspaces", { name: "Acme", slug }),
        201,
      );
      const id = ws.data.id;

      expectStatus(await call(alice, "GET", "/api/v1/workspaces"), 200);
      expectStatus(await call(bob, "GET", `/api/v1/workspaces/${id}`), 404);

      const bobVerified = await signUp("p-invitee");

      expectStatus(
        await call(bobVerified, "POST", "/api/v1/user/verify-email/request"),
        204,
      );

      const verifyCode = (await mail.last(bobVerified.email)).Text.match(
        /\b(\d{6})\b/,
      )?.[1];

      expectStatus(
        await call(bobVerified, "POST", "/api/v1/user/verify-email", {
          code: verifyCode,
        }),
        204,
      );

      const invite = expectStatus(
        await call(alice, "POST", `/api/v1/workspaces/${id}/invites`, {
          email: bobVerified.email,
          role: "editor",
        }),
        201,
      );

      expectStatus(
        await call(alice, "GET", `/api/v1/workspaces/${id}/invites`),
        200,
      );

      const token = tokenFrom(
        await mail.last(bobVerified.email, m => m.Text.includes("token=")),
      );

      expectStatus(
        await call(bob, "POST", "/api/v1/workspaces/invites/accept", { token }),
        [403, 400],
        "WORKSPACE_INVITE_EMAIL_MISMATCH",
      );
      expectStatus(
        await call(bobVerified, "POST", "/api/v1/workspaces/invites/accept", {
          token,
        }),
        200,
      );
      expectStatus(
        await call(bobVerified, "GET", `/api/v1/workspaces/${id}`),
        200,
      );
      expectStatus(
        await call(bobVerified, "PATCH", `/api/v1/workspaces/${id}`, {
          name: "hack",
        }),
        403,
      );
      expectStatus(
        await call(alice, "PATCH", `/api/v1/workspaces/${id}`, {
          name: "Acme Inc",
        }),
        200,
      );

      const members = expectStatus(
        await call(alice, "GET", `/api/v1/workspaces/${id}/members`),
        200,
      );

      expect(items(members.data)).to.have.length(2);
      expectStatus(
        await call(
          alice,
          "PATCH",
          `/api/v1/workspaces/${id}/members/${bobVerified.id}`,
          {
            role: "admin",
          },
        ),
        200,
      );

      const second = expectStatus(
        await call(alice, "POST", `/api/v1/workspaces/${id}/invites`, {
          email: uniqueEmail("p-nobody"),
          role: "viewer",
        }),
        201,
      );

      expectStatus(
        await call(
          alice,
          "DELETE",
          `/api/v1/workspaces/${id}/invites/${second.data.id}`,
        ),
        204,
      );
      expect(invite.data).to.not.have.property("token");
      expectStatus(
        await call(
          alice,
          "POST",
          `/api/v1/workspaces/${id}/transfer-ownership`,
          {
            userId: bobVerified.id,
          },
        ),
        200,
      );
      expectStatus(
        await call(alice, "POST", `/api/v1/workspaces/${id}/leave`),
        204,
      );
      expectStatus(await call(alice, "GET", `/api/v1/workspaces/${id}`), 404);

      const third = await signUp("p-member");
      const inv3 = expectStatus(
        await call(bobVerified, "POST", `/api/v1/workspaces/${id}/invites`, {
          email: third.email,
          role: "viewer",
        }),
        201,
      );

      expect(inv3.data.id).to.be.a("string");
      expectStatus(
        await call(
          bobVerified,
          "DELETE",
          `/api/v1/workspaces/${id}/members/${third.id}`,
        ),
        [204, 404],
      );
      expectStatus(
        await call(bobVerified, "DELETE", `/api/v1/workspaces/${id}`),
        204,
      );
    });
  });
});
