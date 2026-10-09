import { inject, optional } from "inversify";

import {
  IJobHandler,
  Injectable,
  JobContext,
  JobDefinition,
  logger,
} from "../../core";
import { INodeUninstallJobData, NODE_UNINSTALL_QUEUE } from "./node.types";
import { NodeAgentService } from "./node-agent.service";
import { NodeSecretBox } from "./node-secret-box.service";
import {
  buildUninstallPlan,
  createWorkDir,
  removeWorkDir,
  runSshPlan,
  sshAccessOf,
  toJobError,
} from "./ssh-plan";
import {
  SSH_SESSION_FACTORY,
  SshRunner,
  TSshSessionFactory,
} from "./ssh-runner";

/**
 * Удаление агента с узла по SSH: установщик сервера с `--uninstall`
 * (`--purge` — и данные), затем агент отзывается и удаляется, узел — без
 * агента (можно установить заново).
 */
@Injectable()
export class NodeUninstallAgentJob implements IJobHandler<INodeUninstallJobData> {
  readonly definition: JobDefinition = {
    queue: NODE_UNINSTALL_QUEUE,
    tracked: true,
    retryLimit: 0,
    concurrency: 2,
    expireInSeconds: 900,
  };

  constructor(
    @inject(NodeAgentService) private readonly _agents: NodeAgentService,
    @inject(NodeSecretBox) private readonly _secrets: NodeSecretBox,
    @inject(SSH_SESSION_FACTORY)
    @optional()
    private readonly _sessions: TSshSessionFactory = () => new SshRunner(),
  ) {}

  async handle(ctx: JobContext<INodeUninstallJobData>): Promise<void> {
    const data = ctx.data;
    const session = this._sessions();
    let workDir: string | null = null;

    try {
      const access = sshAccessOf(data, sealed => this._secrets.open(sealed));

      await ctx.progress(0.02, "Подключение по SSH");
      await ctx.log(`Подключение ${data.username}@${data.host}:${data.port}`);
      await session.connect(access.connect);

      await ctx.progress(0.05, "Подготовка рабочего каталога");
      workDir = await createWorkDir(session);

      await runSshPlan(
        ctx,
        session,
        buildUninstallPlan(workDir, data.backendUrl, data.purge),
        access.privilege,
        { from: 0.1, to: 0.9 },
      );

      await ctx.progress(0.95, "Отзыв и удаление агента");
      await this._agents.detach(data.nodeId, data.actorId);
      await ctx.progress(1, "Агент удалён");
    } catch (err) {
      logger.warn(
        { err, nodeId: data.nodeId },
        "[Node] Удаление агента не удалось",
      );
      throw toJobError(err, "NODE_UNINSTALL_FAILED");
    } finally {
      if (workDir) await removeWorkDir(session, workDir);
      session.end();
    }
  }
}
