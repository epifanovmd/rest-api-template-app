import { inject, optional } from "inversify";

import {
  IJobHandler,
  Injectable,
  JobContext,
  JobDefinition,
  logger,
} from "../../core";
import { INodeInstallJobData, NODE_INSTALL_QUEUE } from "./node.types";
import { NodeAgentService } from "./node-agent.service";
import { NodeSecretBox } from "./node-secret-box.service";
import {
  buildInstallPlan,
  createWorkDir,
  removeWorkDir,
  runSshPlan,
  sshAccessOf,
  toJobError,
  workFiles,
} from "./ssh-plan";
import {
  SSH_SESSION_FACTORY,
  SshRunner,
  TSshSessionFactory,
} from "./ssh-runner";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Агент пойдёт к серверу по http не на localhost — токен в открытом виде. */
const isInsecureUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);

    return parsed.protocol === "http:" && !LOCAL_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
};

/**
 * Установка агента на узел по SSH: рабочий каталог, токен регистрации
 * файлом, установщик с этого сервера (`/api/v1/agent-link/install.sh`) с
 * `--token-file`. Вывод — в журнал задачи построчно. Узел получает агента,
 * когда тот зарегистрируется токеном с меткой узла. Провал — токен
 * отзывается, узел в `error`.
 */
@Injectable()
export class NodeInstallAgentJob implements IJobHandler<INodeInstallJobData> {
  readonly definition: JobDefinition = {
    queue: NODE_INSTALL_QUEUE,
    tracked: true,
    retryLimit: 0,
    concurrency: 2,
    expireInSeconds: 1_200,
  };

  constructor(
    @inject(NodeAgentService) private readonly _agents: NodeAgentService,
    @inject(NodeSecretBox) private readonly _secrets: NodeSecretBox,
    @inject(SSH_SESSION_FACTORY)
    @optional()
    private readonly _sessions: TSshSessionFactory = () => new SshRunner(),
  ) {}

  async handle(ctx: JobContext<INodeInstallJobData>): Promise<void> {
    const data = ctx.data;
    const session = this._sessions();
    const open = (sealed: string) => this._secrets.open(sealed);
    let workDir: string | null = null;

    try {
      if (isInsecureUrl(data.backendUrl)) {
        await ctx.log(
          `⚠ Агент будет связываться с сервером по http (${data.backendUrl}): токен и данные — в открытом виде. Настройте HTTPS.`,
        );
      }

      const access = sshAccessOf(data, open);

      await ctx.progress(0.02, "Подключение по SSH");
      await ctx.log(`Подключение ${data.username}@${data.host}:${data.port}`);
      await session.connect(access.connect);

      await ctx.progress(0.05, "Подготовка рабочего каталога");
      workDir = await createWorkDir(session);
      await session.upload(
        workFiles(workDir).token,
        Buffer.from(open(data.tokenEnc), "utf8"),
      );

      await runSshPlan(
        ctx,
        session,
        buildInstallPlan(workDir, data.backendUrl, data.workers, data.instance),
        access.privilege,
        { from: 0.1, to: 0.95 },
      );
      await ctx.progress(1, "Агент установлен, ждём регистрации");
    } catch (err) {
      logger.warn(
        { err, nodeId: data.nodeId },
        "[Node] Установка агента не удалась",
      );
      await this._agents.revokeToken(data.tokenId);
      throw toJobError(err, "NODE_INSTALL_FAILED");
    } finally {
      if (workDir) await removeWorkDir(session, workDir);
      session.end();
    }
  }
}
