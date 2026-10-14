import { inject } from "inversify";
import { Readable } from "stream";
import {
  Body,
  Controller,
  Path,
  Post,
  Produces,
  Request,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from "tsoa";

import type { IErrorResponseDto } from "../../core";
import { getContextUser, Injectable, ValidateBody } from "../../core";
import { UUID } from "../../core/http";
import { KoaRequest } from "../../types/koa";
import type { IAgentIssuedEnvDto, IAgentIssuedLinkDto } from "../agent";
import {
  ICreateNodeInstallCommandBody,
  IInstallNodeAgentBody,
  IIssueNodeAgentBody,
  IIssueNodeAgentLinkBody,
  INodeInstallCommandDto,
  INodeJobStartedDto,
  IUninstallNodeAgentBody,
} from "./dto";
import { NodeAgentService } from "./node-agent.service";
import { NodeProvisionService } from "./node-provision.service";
import {
  CreateNodeInstallCommandSchema,
  InstallNodeAgentSchema,
  IssueNodeAgentLinkSchema,
  IssueNodeAgentSchema,
  UninstallNodeAgentSchema,
} from "./validation";

@Injectable()
@Tags("Node")
@Response<IErrorResponseDto>("default", "Ошибка")
@Route("api/v1/nodes")
export class NodeAgentController extends Controller {
  constructor(
    @inject(NodeAgentService) private readonly _nodeAgents: NodeAgentService,
    @inject(NodeProvisionService)
    private readonly _provision: NodeProvisionService,
  ) {
    super();
  }

  /**
   * Команда установки агента на узел вручную: одноразовый токен регистрации
   * с меткой узла (агент привяжется к узлу) и строка `curl … | sudo sh`.
   * Токен — только в этом ответе.
   * @summary Команда установки агента узла
   */
  @Security("jwt", ["permission:node:provision:own"])
  @ValidateBody(CreateNodeInstallCommandSchema)
  @SuccessResponse(201, "Created")
  @Post("{id}/install-command")
  async createNodeInstallCommand(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: ICreateNodeInstallCommandBody,
  ): Promise<INodeInstallCommandDto> {
    const created = await this._nodeAgents.installCommand(
      getContextUser(req),
      id,
      body,
    );

    this.setStatus(201);

    return created;
  }

  /**
   * `.env` агента узла: адрес, одноразовый токен с меткой узла (агент привяжется к узлу), имя
   * агента — для архива агента или образа (`--env-file`). Токен — только в этом ответе.
   * @summary Выдать .env агента узла
   */
  @Security("jwt", ["permission:node:provision:own"])
  @ValidateBody(IssueNodeAgentSchema)
  @SuccessResponse(201, "Created")
  @Post("{id}/agent/issue/env")
  async issueNodeAgentEnv(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: IIssueNodeAgentBody,
  ): Promise<IAgentIssuedEnvDto> {
    const issued = await this._nodeAgents.issueEnv(
      getContextUser(req),
      id,
      body,
    );

    this.setStatus(201);

    return issued;
  }

  /**
   * Архив агента (все платформы) с `.env` агента узла: распаковать и запустить — службой, на
   * месте или в Docker.
   * @summary Выдать архив агента узла
   */
  @Security("jwt", ["permission:node:provision:own"])
  @ValidateBody(IssueNodeAgentSchema)
  @Produces("application/gzip")
  @Post("{id}/agent/issue/archive")
  async issueNodeAgentArchive(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: IIssueNodeAgentBody,
  ): Promise<Readable> {
    const archive = await this._nodeAgents.issueArchive(
      getContextUser(req),
      id,
      body,
    );

    this.setHeader("Content-Type", "application/gzip");
    this.setHeader(
      "Content-Disposition",
      `attachment; filename="${archive.file}"`,
    );
    this.setHeader("Cache-Control", "no-store");

    return Readable.from(archive.data);
  }

  /**
   * Одноразовая ссылка на архив агента узла: скачать можно один раз и до срока, токен с
   * меткой узла создаётся при скачивании.
   * @summary Выдать ссылку на архив агента узла
   */
  @Security("jwt", ["permission:node:provision:own"])
  @ValidateBody(IssueNodeAgentLinkSchema)
  @SuccessResponse(201, "Created")
  @Post("{id}/agent/issue/link")
  async issueNodeAgentLink(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: IIssueNodeAgentLinkBody,
  ): Promise<IAgentIssuedLinkDto> {
    const link = await this._nodeAgents.issueLink(
      getContextUser(req),
      id,
      body,
    );

    this.setStatus(201);

    return link;
  }

  /**
   * Установить агента по SSH (задача): установщик с этого сервера и
   * одноразовый токен файлом. Прогресс и журнал — в задаче (`jobId`,
   * комната узла). SSH-данные шифруются и в открытом виде не хранятся. Уже
   * идёт установка или удаление — 409.
   * @summary Установка агента по SSH
   */
  @Security("jwt", ["permission:node:provision:own"])
  @ValidateBody(InstallNodeAgentSchema)
  @SuccessResponse(202, "Accepted")
  @Post("{id}/agent/install")
  async installNodeAgent(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: IInstallNodeAgentBody,
  ): Promise<INodeJobStartedDto> {
    const started = await this._provision.install(
      getContextUser(req),
      id,
      body,
    );

    this.setStatus(202);

    return started;
  }

  /**
   * Удалить агента с узла по SSH (задача): `install.sh --uninstall`
   * (`purge` — и данные), затем агент отзывается и удаляется, узел остаётся
   * без агента. Уже идёт установка или удаление — 409.
   * @summary Удаление агента по SSH
   */
  @Security("jwt", ["permission:node:provision:own"])
  @ValidateBody(UninstallNodeAgentSchema)
  @SuccessResponse(202, "Accepted")
  @Post("{id}/agent/uninstall")
  async uninstallNodeAgent(
    @Request() req: KoaRequest,
    @Path() id: UUID,
    @Body() body: IUninstallNodeAgentBody,
  ): Promise<INodeJobStartedDto> {
    const started = await this._provision.uninstall(
      getContextUser(req),
      id,
      body,
    );

    this.setStatus(202);

    return started;
  }
}
