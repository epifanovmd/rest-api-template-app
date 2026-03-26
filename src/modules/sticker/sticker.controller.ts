import { inject } from "inversify";
import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Query,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";

import { getContextUser, Injectable, ValidateBody } from "../../core";
import { KoaRequest } from "../../types/koa";
import { StickerPackDto } from "./dto";
import { StickerService } from "./sticker.service";
import { AddStickerToPackSchema, CreateStickerPackSchema } from "./validation";

interface ICreateStickerPackBody {
  name: string;
  title: string;
  isAnimated?: boolean;
}

interface IAddStickerBody {
  emoji?: string;
  fileId: string;
}

interface IStickerPackListDto {
  data: StickerPackDto[];
  totalCount: number;
}

@Injectable()
@Tags("Sticker")
@Route("api/sticker")
export class StickerController extends Controller {
  constructor(
    @inject(StickerService) private _stickerService: StickerService,
  ) {
    super();
  }

  /**
   * Создать набор стикеров.
   * @summary Создание набора
   */
  @Security("jwt")
  @ValidateBody(CreateStickerPackSchema)
  @Post("pack")
  createPack(
    @Request() req: KoaRequest,
    @Body() body: ICreateStickerPackBody,
  ): Promise<StickerPackDto> {
    const user = getContextUser(req);

    return this._stickerService.createPack(user.userId, body);
  }

  /**
   * Получить мои наборы стикеров.
   * @summary Мои стикеры
   */
  @Security("jwt")
  @Get("pack")
  getUserPacks(@Request() req: KoaRequest): Promise<StickerPackDto[]> {
    const user = getContextUser(req);

    return this._stickerService.getUserPacks(user.userId);
  }

  /**
   * Получить рекомендуемые наборы стикеров.
   * @summary Рекомендуемые стикеры
   */
  @Security("jwt")
  @Get("pack/featured")
  getFeaturedPacks(
    @Query() limit?: number,
    @Query() offset?: number,
  ): Promise<IStickerPackListDto> {
    return this._stickerService.getFeaturedPacks(limit, offset);
  }

  /**
   * Поиск наборов стикеров.
   * @summary Поиск стикеров
   */
  @Security("jwt")
  @Get("pack/search")
  searchPacks(
    @Query() q: string,
    @Query() limit?: number,
    @Query() offset?: number,
  ): Promise<IStickerPackListDto> {
    return this._stickerService.searchPacks(q, limit, offset);
  }

  /**
   * Получить набор стикеров по ID.
   * @summary Набор стикеров
   */
  @Security("jwt")
  @Get("pack/{id}")
  getPackById(@Path() id: string): Promise<StickerPackDto> {
    return this._stickerService.getPackById(id);
  }

  /**
   * Добавить набор стикеров в свою коллекцию.
   * @summary Добавить набор
   */
  @Security("jwt")
  @Post("pack/{id}/add")
  async addPack(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._stickerService.addPackToUser(user.userId, id);
  }

  /**
   * Удалить набор стикеров из своей коллекции.
   * @summary Удалить набор
   */
  @Security("jwt")
  @Delete("pack/{id}/remove")
  async removePack(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._stickerService.removePackFromUser(user.userId, id);
  }

  /**
   * Добавить стикер в набор.
   * @summary Добавить стикер
   */
  @Security("jwt")
  @ValidateBody(AddStickerToPackSchema)
  @Post("pack/{id}/sticker")
  addSticker(
    @Request() req: KoaRequest,
    @Path() id: string,
    @Body() body: IAddStickerBody,
  ): Promise<StickerPackDto> {
    const user = getContextUser(req);

    return this._stickerService.addStickerToPack(id, user.userId, body);
  }

  /**
   * Удалить стикер.
   * @summary Удаление стикера
   */
  @Security("jwt")
  @Delete("{id}")
  async removeSticker(
    @Request() req: KoaRequest,
    @Path() id: string,
  ): Promise<void> {
    const user = getContextUser(req);

    await this._stickerService.removeStickerFromPack(id, user.userId);
  }
}
