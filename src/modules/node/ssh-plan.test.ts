import { expect } from "chai";

import {
  buildInstallPlan,
  buildUninstallPlan,
  elevate,
  installScriptUrl,
  shQuote,
  sshAccessOf,
  WORK_DIR_PATTERN,
} from "./ssh-plan";

describe("ssh-plan", () => {
  it("shQuote: одинарные кавычки POSIX", () => {
    expect(shQuote("a b")).to.equal("'a b'");
    expect(shQuote("it's")).to.equal(`'it'\\''s'`);
  });

  it("повышение прав: root — как есть; ключ — sudo -n; пароль — sudo -S со stdin", () => {
    expect(elevate("id", { sudo: false })).to.deep.equal({ command: "id" });
    expect(elevate("echo $?", { sudo: true })).to.deep.equal({
      command: "sudo -n sh -c 'echo $?'",
    });
    expect(elevate("id", { sudo: true, password: "p'w" })).to.deep.equal({
      command: "sudo -S -p '' sh -c 'id'",
      stdin: "p'w\n",
    });
  });

  it("установка: установщик архива папки агента с этого сервера, токен файлом, не в аргументах", () => {
    const dir = "/tmp/agent-node.abc123";
    const [download, install] = buildInstallPlan(
      dir,
      "https://api.example.com/",
    );

    expect(installScriptUrl("https://api.example.com/")).to.equal(
      "https://api.example.com/api/v1/agent-bundle/install.sh",
    );
    expect(download.privileged).to.equal(false);
    expect(download.command).to.include(
      "'https://api.example.com/api/v1/agent-bundle/install.sh'",
    );
    expect(install.privileged).to.equal(true);
    expect(install.command).to.equal(
      `sh ${dir}/install.sh --token-file ${dir}/token; ` +
        `code=$?; rm -rf ${dir}; exit $code`,
    );
  });

  it("удаление: --uninstall и --purge по запросу (экземпляр — из архива)", () => {
    const dir = "/tmp/agent-node.abc123";

    expect(buildUninstallPlan(dir, "https://x", false)[1].command).to.match(
      /install\.sh --uninstall; /,
    );
    expect(buildUninstallPlan(dir, "https://x", true)[1].command).to.match(
      /--uninstall --purge; /,
    );
  });

  it("рабочий каталог — только вывод mktemp", () => {
    expect(WORK_DIR_PATTERN.test("/tmp/agent-node.Ab12")).to.equal(true);
    expect(WORK_DIR_PATTERN.test("/tmp/agent-node.x; rm -rf /")).to.equal(
      false,
    );
  });

  it("доступ из данных задачи: секреты раскрываются, пароль — и для sudo", () => {
    const access = sshAccessOf(
      {
        host: "h",
        port: 2222,
        username: "deploy",
        sudo: true,
        passwordEnc: "enc:pw",
        privateKeyEnc: "enc:key",
      },
      sealed => sealed.replace("enc:", ""),
    );

    expect(access.connect).to.include({
      host: "h",
      port: 2222,
      username: "deploy",
      password: "pw",
      privateKey: "key",
    });
    expect(access.privilege).to.deep.equal({ sudo: true, password: "pw" });
  });
});
