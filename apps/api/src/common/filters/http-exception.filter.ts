import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId = request.headers['x-correlation-id'] as string;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;
      message = typeof exceptionResponse === 'string' ? exceptionResponse : exceptionResponse.message;
      details = Array.isArray(exceptionResponse.message) ? exceptionResponse.message : undefined;
      code = this.getErrorCode(status);
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled exception [${correlationId}]: ${exception.message}`, exception.stack);
    }

    response.status(status).json({
      error: {
        code,
        message: Array.isArray(message) ? 'Validation failed' : message,
        details,
        correlationId,
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    });
  }

  private getErrorCode(status: number): string {
    const codes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'RATE_LIMIT_EXCEEDED',
      500: 'INTERNAL_SERVER_ERROR',
    };
    return codes[status] || 'UNKNOWN_ERROR';
  }
}
