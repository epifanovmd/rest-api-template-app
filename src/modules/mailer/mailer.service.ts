import { render } from "ejs";
import fs from "fs";
import { injectable } from "inversify";
import { createTransport, SendMailOptions } from "nodemailer";

import { config } from "../../../config";
import { Injectable } from "../../decorators/injectable.decorator";

@Injectable()
export class MailerService {
  transport: ReturnType<typeof createTransport>;

  constructor() {
    this.transport = createTransport({
      service: "gmail",
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASS,
      },
    });
  }

  public sendCodeMail = async (email: string, code: string) => {
    const path = `${__dirname}/html-code-template.ejs`;
    const codeTemplate = fs.readFileSync(path, "utf-8");

    return this.sendMail({
      to: email,
      subject: "Ваш одноразовый код",
      html: render(codeTemplate, { code }),
    });
  };

  public sendResetPasswordMail = async (email: string, token: string) => {
    const path = `${__dirname}/html-reset-password-template.ejs`;
    const codeTemplate = fs.readFileSync(path, "utf-8");

    return this.sendMail({
      to: email,
      subject: "Ваша ссылка для востановления пароля",
      html: render(codeTemplate, {
        resetLink: config.WEB_URL_RESET_PASSWORD.replace("{{token}}", token),
      }),
    });
  };

  public sendMail = (options: Omit<SendMailOptions, "from">) => {
    return new Promise((resolve, reject) => {
      this.transport.sendMail(
        {
          ...options,
          from: config.SMTP_USER,
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
