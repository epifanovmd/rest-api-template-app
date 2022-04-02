import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Query,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";
import { assertNotNull } from "../../common/assertNotNull";
import { ErrorType } from "../../common/errorType";
import { ApiError } from "../../common/handlers/errorHandler";
import { BasePageResult } from "../../dto/BasePageResult";
import { KoaRequest } from "../../types/koa";
import { IPost, PostDto } from "./PostsModel";
import { PostsService } from "./PostsService";

const { getPostsById, deletePost, getPosts, updatePost, createPost } =
  new PostsService();

@Tags("Posts")
@Route("api/posts")
export class PostsController extends Controller {
  @Security("jwt")
  @Get()
  getAllPosts(
    @Request() req: KoaRequest,
    @Query("page") page?: number,
    @Query("limit") limit?: number,
    @Query("my") my?: boolean,
  ): Promise<BasePageResult<PostDto[]>> {
    try {
      const UserId = assertNotNull<string>(
        req.ctx.request.user?.id,
        "userId is undefined",
      );

      return getPosts({
        UserId,
        page,
        limit,
        my,
      }).then(result => ({
        page,
        limit,
        count: result.length,
        data: result,
      }));
    } catch (e) {
      return Promise.reject(
        new ApiError(
          "ServerError",
          500,
          ErrorType.DataBaseErrorException,
          e.message,
        ),
      );
    }
  }

  @Get("/{id}")
  getPostById(id: string): Promise<PostDto> {
    return getPostsById(id);
  }

  @Security("jwt")
  @Post()
  createPost(
    @Body() body: IPost,
    @Request() req: KoaRequest,
  ): Promise<PostDto> {
    try {
      return createPost(body, assertNotNull<string>(req.ctx.request.user?.id));
    } catch (e) {
      return Promise.reject(
        new ApiError(
          "Unauthorized",
          401,
          ErrorType.UnauthorizedException,
          "No token provided",
        ),
      );
    }
  }

  @Security("jwt")
  @Put("/{id}")
  updatePost(
    id: string,
    @Body() body: IPost,
    @Request() req: KoaRequest,
  ): Promise<PostDto> {
    try {
      return updatePost(
        id,
        body,
        assertNotNull<string>(req.ctx.request.user?.id),
      );
    } catch (e) {
      return Promise.reject(
        new ApiError(
          "Unauthorized",
          401,
          ErrorType.UnauthorizedException,
          "No token provided",
        ),
      );
    }
  }

  @Security("jwt")
  @Delete("/{id}")
  deletePost(id: string, @Request() req: KoaRequest): Promise<number> {
    try {
      return deletePost(id, assertNotNull<string>(req.ctx.request.user?.id));
    } catch (e) {
      return Promise.reject(
        new ApiError(
          "Unauthorized",
          401,
          ErrorType.UnauthorizedException,
          "No token provided",
        ),
      );
    }
  }
}
