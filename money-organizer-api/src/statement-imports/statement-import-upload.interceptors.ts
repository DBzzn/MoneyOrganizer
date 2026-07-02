import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  mixin,
  NestInterceptor,
  Type,
} from '@nestjs/common';
import { transformException } from '@nestjs/platform-express/multer/multer/multer.utils';
import multer from 'multer';
import { Observable } from 'rxjs';

type MulterUploadOptions = multer.Options;

type MulterErrorLike = Error & {
  code?: multer.ErrorCode | 'LIMIT_FIELD_NESTING';
  field?: string;
};

function toUploadError(error: unknown): MulterErrorLike {
  if (error instanceof Error) {
    return error as MulterErrorLike;
  }

  return new Error(String(error));
}

function transformStatementImportUploadException(error: unknown): Error {
  const uploadError = toUploadError(error);

  if (uploadError.code === 'LIMIT_FIELD_NESTING') {
    const message = uploadError.field
      ? `${uploadError.message} - ${uploadError.field}`
      : uploadError.message;

    return new BadRequestException(message);
  }

  return transformException(uploadError) ?? uploadError;
}

export function StatementImportFileInterceptor(
  fieldName: string,
  localOptions?: MulterUploadOptions,
): Type<NestInterceptor> {
  class MixinInterceptor implements NestInterceptor {
    private readonly upload = multer(localOptions);

    async intercept(
      context: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<unknown>> {
      const ctx = context.switchToHttp();

      await new Promise<void>((resolve, reject) =>
        this.upload.single(fieldName)(
          ctx.getRequest(),
          ctx.getResponse(),
          (error?: unknown) => {
            if (error) {
              reject(transformStatementImportUploadException(error));
              return;
            }

            resolve();
          },
        ),
      );

      return next.handle() as Observable<unknown>;
    }
  }

  return mixin(MixinInterceptor);
}

export function StatementImportFilesInterceptor(
  fieldName: string,
  maxCount: number,
  localOptions?: MulterUploadOptions,
): Type<NestInterceptor> {
  class MixinInterceptor implements NestInterceptor {
    private readonly upload = multer(localOptions);

    async intercept(
      context: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<unknown>> {
      const ctx = context.switchToHttp();

      await new Promise<void>((resolve, reject) =>
        this.upload.array(fieldName, maxCount)(
          ctx.getRequest(),
          ctx.getResponse(),
          (error?: unknown) => {
            if (error) {
              reject(transformStatementImportUploadException(error));
              return;
            }

            resolve();
          },
        ),
      );

      return next.handle() as Observable<unknown>;
    }
  }

  return mixin(MixinInterceptor);
}
