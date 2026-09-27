import "reflect-metadata";

import { expect } from "chai";
import sinon from "sinon";

import { createMockJobQueue, uuid } from "../../test/helpers";
import { MailError, MailerService, MailRenderer } from "../mailer";
import { WorkspaceRoomPolicy } from "./workspace.room-policy";
import { WorkspaceRoomProvider } from "./workspace.room-provider";
import {
  WORKSPACE_INVITE_MAIL_TEMPLATE,
  workspaceInviteLink,
  WorkspaceInviteMailer,
} from "./workspace-invite.mail";
import { WorkspaceJobAccessPolicy } from "./workspace-job-access.policy";

const WS = "00000000-0000-0000-0000-00000000000a";
const USER = uuid();

describe("Workspace: комнаты, задачи, письмо", () => {
  describe("WorkspaceRoomProvider", () => {
    it("комнаты всех пространств пользователя", async () => {
      const members = {
        findWorkspaceIdsByUser: sinon.stub().resolves([WS, "b"]),
      };

      expect(
        await new WorkspaceRoomProvider(members as any).rooms(USER),
      ).to.deep.equal([`workspace_${WS}`, "workspace_b"]);
    });
  });

  describe("WorkspaceRoomPolicy", () => {
    it("тип workspace, вход — только участнику", async () => {
      const access = { isMember: sinon.stub().resolves(false) };
      const policy = new WorkspaceRoomPolicy(access as any);

      expect(policy.type).to.equal("workspace");
      expect(policy.room(WS)).to.equal(`workspace_${WS}`);
      expect(await policy.canJoin(USER, WS)).to.equal(false);

      access.isMember.resolves(true);
      expect(await policy.canJoin(USER, WS)).to.equal(true);
    });
  });

  describe("WorkspaceJobAccessPolicy", () => {
    const policyFor = (role: string | null) =>
      new WorkspaceJobAccessPolicy({
        roleOf: sinon.stub().resolves(role),
      } as any);

    it("scope workspace; видят все участники", async () => {
      expect(policyFor("viewer").scopeType).to.equal("workspace");
      expect(await policyFor("viewer").canAccess(USER, WS, "view")).to.equal(
        true,
      );
      expect(await policyFor("viewer").canView(USER, WS)).to.equal(true);
      expect(await policyFor(null).canAccess(USER, WS, "view")).to.equal(false);
    });

    it("отменяют — editor и выше", async () => {
      expect(await policyFor("viewer").canAccess(USER, WS, "cancel")).to.equal(
        false,
      );
      expect(await policyFor("editor").canAccess(USER, WS, "cancel")).to.equal(
        true,
      );
    });
  });

  describe("WorkspaceInviteMailer", () => {
    const mailerWith = (
      jobs: unknown,
      configured: boolean,
      production: boolean,
    ) =>
      Object.assign(new MailerService(jobs as any, new MailRenderer()), {
        configured,
        production,
      });

    it("ставит задачу mail.send с шаблоном и транзакцией", async () => {
      const jobs = createMockJobQueue();
      const manager = {} as any;
      const data = { workspaceName: "T", role: "editor", inviteLink: "x" };

      await new WorkspaceInviteMailer(mailerWith(jobs, true, true)).send(
        "a@b.c",
        data,
        manager,
      );

      expect(jobs.enqueue.firstCall.args).to.deep.equal([
        "mail.send",
        {
          template: WORKSPACE_INVITE_MAIL_TEMPLATE,
          to: "a@b.c",
          data,
          locale: "ru",
        },
        { manager },
      ]);
    });

    it("production без SMTP — MAIL_NOT_CONFIGURED, задачи нет", async () => {
      const jobs = createMockJobQueue();

      try {
        await new WorkspaceInviteMailer(mailerWith(jobs, false, true)).send(
          "a@b.c",
          {
            workspaceName: "T",
            role: "viewer",
            inviteLink: "x",
          },
        );
        expect.fail("ожидалась ошибка");
      } catch (err) {
        expect((err as { code: string }).code).to.equal(
          MailError.codes.NOT_CONFIGURED,
        );
      }
      expect(jobs.enqueue.called).to.equal(false);
    });

    it("ссылка содержит токен в query", () => {
      const url = new URL(workspaceInviteLink("a b"));

      expect(url.pathname).to.equal("/workspaces/invite");
      expect(url.searchParams.get("token")).to.equal("a b");
    });
  });
});
