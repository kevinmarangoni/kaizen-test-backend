import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";

type ReqWithId = Request & { id?: string };

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<ReqWithId>();

    const requestId =
      (typeof request.headers["x-request-id"] === "string"
        ? request.headers["x-request-id"]
        : undefined) ||
      request.id ||
      randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = "Erro interno do servidor";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === "string"
          ? body
          : typeof body === "object" && body !== null && "message" in body
            ? (body as { message: string | string[] }).message
            : exception.message;
    } else if (this.isMongoDuplicate(exception)) {
      status = HttpStatus.CONFLICT;
      message = "Conflito de recurso (duplicado).";
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
    });
  }

  private isMongoDuplicate(exception: unknown): boolean {
    return (
      typeof exception === "object" &&
      exception !== null &&
      "code" in exception &&
      (exception as { code: number }).code === 11000
    );
  }
}
