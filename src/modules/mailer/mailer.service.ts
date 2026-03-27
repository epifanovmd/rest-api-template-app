import { render } from "ejs";
import fs from "fs";
import { createTransport, SendMailOptions } from "nodemailer";

import { config } from "../../config";
import { Injectable } from "../../core";

/** Сервис для отправки email через SMTP (Gmail). */
@Injectable()
export class MailerService {
  // Nodemailer transport, инициализируется в конструкторе
  transport: ReturnType<typeof createTransport>;

  private _codeTemplate: string | null = null;
  private _resetPasswordTemplate: string | null = null;

  constructor() {
    this.transport = createTransport({
      service: "gmail",
      auth: {
        user: config.email.smtp.user,
        pass: config.email.smtp.pass,
      },
    });
  }

  private _getCodeTemplate(): string {
    if (!this._codeTemplate) {
      const templatePath = `${__dirname}/html-code-template.ejs`;

      this._codeTemplate = fs.readFileSync(templatePath, "utf-8");
    }

    return this._codeTemplate;
  }

  private _getResetPasswordTemplate(): string {
    if (!this._resetPasswordTemplate) {
      const templatePath = `${__dirname}/html-reset-password-template.ejs`;

      this._resetPasswordTemplate = fs.readFileSync(templatePath, "utf-8");
    }

    return this._resetPasswordTemplate;
  }

  /** Отправить письмо с одноразовым кодом подтверждения. */
  public sendCodeMail = async (email: string, code: string) => {
    return this.sendMail({
      to: email,
      subject: "Ваш одноразовый код",
      html: render(this._getCodeTemplate(), { code }),
    });
  };

  /** Отправить письмо со ссылкой для сброса пароля. */
  public sendResetPasswordMail = async (email: string, token: string) => {
    return this.sendMail({
      to: email,
      subject: "Ваша ссылка для востановления пароля",
      html: render(this._getResetPasswordTemplate(), {
        resetLink: config.auth.resetPassword.webUrl.replace("{{token}}", token),
      }),
    });
  };

  /** Отправить произвольное письмо; поле from подставляется автоматически из конфига. */
  public sendMail = (options: Omit<SendMailOptions, "from">) => {
    return new Promise((resolve, reject) => {
      this.transport.sendMail(
        {
          ...options,
          from: config.email.smtp.user,
        },
        (error, info) => {
          if (error) {
            reject(error);
          } else {
            resolve(info);
          }
        },
      );
    });
  };
}
