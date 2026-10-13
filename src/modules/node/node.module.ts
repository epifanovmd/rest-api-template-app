import "./node.permissions";

import { asJobAccessPolicy, asJobHandler, Module } from "../../core";
import { asAgentAccessPolicy } from "../agent";
import {
  asSocketListener,
  asSocketRoomPolicy,
  permissionRoomPolicy,
} from "../socket";
import { NodeController } from "./node.controller";
import { Node } from "./node.entity";
import { NodeListener } from "./node.listener";
import { NodePermissions } from "./node.permissions";
import { NodeRepository } from "./node.repository";
import { NodeService } from "./node.service";
import { NODES_ROOM } from "./node.types";
import { NodeAgentController } from "./node-agent.controller";
import { NodeAgentService } from "./node-agent.service";
import { NodeAgentAccessPolicy } from "./node-agent-access.policy";
import { NodeInstallAgentJob } from "./node-install.job";
import { NodeJobAccessPolicy } from "./node-job-access.policy";
import { NodeProvisionService } from "./node-provision.service";
import { NodeRoomPolicy } from "./node-room.policy";
import { NodeSecretBox } from "./node-secret-box.service";
import { NodeUninstallAgentJob } from "./node-uninstall.job";
import { NodeViewService } from "./node-view.service";

/**
 * Узлы — машины с агентами: CRUD с областью «все / свои», вычисленный
 * статус, привязка агента при регистрации, установка и удаление агента по
 * SSH (задачи), доступ к агенту узла через права узла.
 */
@Module({
  entities: [Node],
  providers: [
    NodeRepository,
    NodeViewService,
    NodeService,
    NodeAgentService,
    NodeSecretBox,
    NodeProvisionService,
    NodeController,
    NodeAgentController,
    asJobHandler(NodeInstallAgentJob),
    asJobHandler(NodeUninstallAgentJob),
    asJobAccessPolicy(NodeJobAccessPolicy),
    asAgentAccessPolicy(NodeAgentAccessPolicy),
    asSocketListener(NodeListener),
    asSocketRoomPolicy(permissionRoomPolicy(NODES_ROOM, NodePermissions.VIEW)),
    asSocketRoomPolicy(NodeRoomPolicy),
  ],
})
export class NodeModule {}
