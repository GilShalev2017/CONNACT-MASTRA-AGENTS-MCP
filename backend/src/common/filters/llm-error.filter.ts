import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Response } from "express";

/**
 * The most common way this demo fails is a missing/invalid ANTHROPIC_API_KEY
 * (every chat, meeting-analysis, and workflow request calls the LLM). The
 * default NestJS error handler collapses that into an opaque
 * "Internal server error" - this filter recognizes provider auth errors
 * and returns a message that actually tells the user what to fix, while
 * still passing through NestJS's own HttpExceptions (404s, validation
 * errors) unchanged.
 */
@Catch()
export class LlmErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(LlmErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    const message = exception instanceof Error ? exception.message : String(exception);
    this.logger.error(message, exception instanceof Error ? exception.stack : undefined);

    if (/api[-_]?key/i.test(message)) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message:
          "The AI agent could not reach the LLM provider. Set ANTHROPIC_API_KEY (see .env.example) and restart the backend.",
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message,
    });
  }
}
