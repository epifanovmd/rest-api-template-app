import { inject } from "inversify";

import { Injectable, JobQueue } from "../../core";
import type { AuthContext } from "../../types/koa";
import { AgentService } from "../agent";
import type {
  IInstallNodeAgentBody,
  INodeJobStartedDto,
  INodeSshAccessBody,
  IUninstallNodeAgentBody,
} from "./dto";
import { Node } from "./node.entity";
import { NodeError } from "./node.errors";
import { NodePermissions } from "./node.permissions";
import { NodeService } from "./node.service";
import {
  INodeInstallJobData,
  INodeSshJobData,
  INodeUninstallJobData,
  NETPROBE_WORKER,
  NODE_INSTALL_QUEUE,
  NODE_JOB_SCOPE,
  NODE_SSH_TOKEN_TTL_MINUTES,
  NODE_UNINSTALL_QUEUE,
} from "./node.types";
import { NodeAgentService } from "./node-agent.service";
import { NodeSecretBox } from "./node-secret-box.service";

const SSH_PORT = 22;
const SSH_USER = "root";

/** Одна задача установки или удаления на узел. */
const singletonKey = (nodeId: string): string => `node-ssh:${nodeId}`;

/**
 * Постановка установки и удаления агента по SSH: SSH-данные и токен
 * регистрации шифруются до записи в очередь; одна задача на узел.
 */
@Injectable()
export class NodeProvisionService {
  constructor(
    @inject(JobQueue) private readonly _jobs: JobQueue,
    @inject(NodeService) private readonly _nodes: NodeService,
    @inject(NodeAgentService) private readonly _nodeAgents: NodeAgentService,
    @inject(AgentService) private readonly _agents: AgentService,
    @inject(NodeSecretBox) private readonly _secrets: NodeSecretBox,
  ) {}

  async install(
    actor: AuthContext,
    nodeId: string,
    body: IInstallNodeAgentBody,
  ): Promise<INodeJobStartedDto> {
    const node = await this._nodes.findFor(
      actor,
      nodeId,
      NodePermissions.PROVISION,
    );
    const ssh = this._sshData(actor, node, body);
    const token = await this._nodeAgents.issueToken(
      actor.userId,
      node,
      NODE_SSH_TOKEN_TTL_MINUTES,
    );
    const data: INodeInstallJobData = {
      ...ssh,
      tokenId: token.tokenId,
      tokenEnc: this._secrets.seal(token.token),
      workers: body.workers ?? [NETPROBE_WORKER],
    };
    const jobId = await this._jobs.enqueue(NODE_INSTALL_QUEUE, data, {
      title: `Установка агента: ${node.name}`,
      ownerId: actor.userId,
      singletonKey: singletonKey(node.id),
      scope: { type: NODE_JOB_SCOPE, id: node.id },
    });

    if (!jobId) {
      await this._nodeAgents.revokeToken(token.tokenId);
      throw NodeError.JOB_RUNNING();
    }

    return { jobId };
  }

  async uninstall(
    actor: AuthContext,
    nodeId: string,
    body: IUninstallNodeAgentBody,
  ): Promise<INodeJobStartedDto> {
    const node = await this._nodes.findFor(
      actor,
      nodeId,
      NodePermissions.PROVISION,
    );
    const data: INodeUninstallJobData = {
      ...this._sshData(actor, node, body),
      purge: body.purge ?? false,
    };
    const jobId = await this._jobs.enqueue(NODE_UNINSTALL_QUEUE, data, {
      title: `Удаление агента: ${node.name}`,
      ownerId: actor.userId,
      singletonKey: singletonKey(node.id),
      scope: { type: NODE_JOB_SCOPE, id: node.id },
    });

    if (!jobId) throw NodeError.JOB_RUNNING();

    return { jobId };
  }

  private _sshData(
    actor: AuthContext,
    node: Node,
    body: INodeSshAccessBody,
  ): INodeSshJobData {
    const host = body.host ?? node.host;

    if (!host) throw NodeError.HOST_REQUIRED();

    const username = body.username ?? SSH_USER;
    const seal = (value?: string) =>
      value ? this._secrets.seal(value) : undefined;

    return {
      nodeId: node.id,
      actorId: actor.userId,
      host,
      port: body.port ?? SSH_PORT,
      username,
      sudo: body.sudo ?? username !== SSH_USER,
      passwordEnc: seal(body.password),
      privateKeyEnc: seal(body.privateKey),
      passphraseEnc: seal(body.passphrase),
      backendUrl: body.backendUrl ?? this._agents.publicUrl(),
      instance: this._agents.instance(),
    };
  }
}
