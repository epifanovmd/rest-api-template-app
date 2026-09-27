import { expect } from "chai";

import { MAIL_LOCALES, MailRenderer } from "../mailer";
import { WORKSPACE_INVITE_MAIL_TEMPLATE } from "./workspace-invite.mail";

describe("письмо workspace-invite", () => {
  const renderer = new MailRenderer();

  for (const locale of MAIL_LOCALES) {
    it(`${locale}: пространство, роль, ссылка и срок действия`, () => {
      const mail = renderer.render(WORKSPACE_INVITE_MAIL_TEMPLATE, locale, {
        workspaceName: "Team <A&B>",
        role: "editor",
        inviteLink: "https://x.test/workspaces/invite?token=t1",
      });

      expect(mail.subject).to.include("Team <A&B>");
      expect(mail.html).to.include("Team &lt;A&amp;B&gt;");
      expect(mail.html).to.include(
        'href="https://x.test/workspaces/invite?token=t1"',
      );
      expect(mail.text).to.include("https://x.test/workspaces/invite?token=t1");
      expect(mail.text).to.include("editor");
      expect(mail.text).to.include("7");
    });
  }
});
