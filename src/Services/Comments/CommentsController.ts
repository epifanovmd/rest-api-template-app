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
import { Comment, CommentDto } from "./CommentsModel";
import { CommentsService } from "./CommentsService";

const {
  createComment,
  deleteComment,
  getComments,
  getCommentsByAttr,
  getCommentsById,
  updateComment,
} = new CommentsService();

@Tags("Comments")
@Route("api/comments")
export class CommentsController extends Controller {
  @Security("jwt")
  @Get()
  getAllComments(
    @Request() req: KoaRequest,
    @Query("page") page?: number,
    @Query("limit") limit?: number,
    @Query("my") my?: boolean,
    @Query("postId") PostId?: string,
  ): Promise<BasePageResult<CommentDto[]>> {
    try {
      const UserId = assertNotNull<string>(
        req.ctx.request.user?.id,
        "userId is undefined",
      );

      return getComments({
        UserId,
        page,
        limit,
        my,
        PostId,
      }).then(result => ({
        page,
        limit,
        count: result.length,
        data: result,
      }));
    } catch (e) {
      return Promise.reject(
        new ApiError(
          500,
          ErrorType.DataBaseErrorException,
          e.message,
        ),
      );
    }
  }

  @Security("jwt")
  @Get("{id}")
  getCommentById(id: string): Promise<CommentDto> {
    return getCommentsById(id);
  }

  @Security("jwt")
  @Post()
  createComment(
    @Body() body: Comment,
    @Query("postId") postId: string,
    @Request() req: KoaRequest,
  ): Promise<CommentDto> {
    const userId = req.ctx.request.user?.id;

    if (userId) {
      return createComment(body, userId, postId);
    }

    return Promise.reject(
      new ApiError(
        401,
        ErrorType.UnauthorizedException,
        "No token provided",
      ),
    );
  }

  @Security("jwt")
  @Put("/{id}")
  updateComment(
    id: string,
    @Body() body: Comment,
    @Request() req: KoaRequest,
  ): Promise<CommentDto> {
    try {
      return updateComment(
        id,
        body,
        assertNotNull<string>(req.ctx.request.user?.id),
      );
    } catch (e) {
      return Promise.reject(
        new ApiError(
          401,
          ErrorType.UnauthorizedException,
          "No token provided",
        ),
      );
    }
  }

  @Security("jwt")
  @Delete("/{id}")
  deleteComment(id: string, @Request() req: KoaRequest): Promise<number> {
    try {
      return deleteComment(id, assertNotNull<string>(req.ctx.request.user?.id));
    } catch (e) {
      return Promise.reject(
        new ApiError(
          401,
          ErrorType.UnauthorizedException,
          "No token provided",
        ),
      );
    }
  }
}
