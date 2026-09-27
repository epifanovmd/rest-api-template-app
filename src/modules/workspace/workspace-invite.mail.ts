import { inject } from "inversify";
import type { EntityManager } from "typeorm";

import { Injectable } from "../../core";
import { MailerService } from "../mailer";
import { workspaceConfig } from "./workspace.config";

/** Имя шаблона в `templates/mail/<locale>/`. */
export const WORKSPACE_INVITE_MAIL_TEMPLATE = "workspace-invite" as const;

/** Данные шаблона письма-приглашения. */
export interface IWorkspaceInviteMailData {
  workspaceName: string;
  role: string;
  inviteLink: string;
}

declare module "../mailer/mailer.types" {
  interface IMailTemplateData {
    [WORKSPACE_INVITE_MAIL_TEMPLATE]: IWorkspaceInviteMailData;
  }
}

/** Ссылка из письма: шаблон `WEB_URL_WORKSPACE_INVITE` с подставленным токеном. */
export const workspaceInviteLink = (token: string): string =>
  workspaceConfig.inviteWebUrl.replace("{{token}}", encodeURIComponent(token));

/**
 * Письмо-приглашение через очередь `mail.send` (шаблон `workspace-invite`).
 * `manager` — транзакция приглашения: без неё письма нет. В production без
 * SMTP — `MAIL_NOT_CONFIGURED` (503), задача не ставится.
 */
@Injectable()
export class WorkspaceInviteMailer {
  constructor(@inject(MailerService) private readonly _mailer: MailerService) {}

  send(
    to: string,
    data: IWorkspaceInviteMailData,
    manager?: EntityManager,
  ): Promise<void> {
    return this._mailer.send(WORKSPACE_INVITE_MAIL_TEMPLATE, to, data, {
      manager,
    });
  }
}
