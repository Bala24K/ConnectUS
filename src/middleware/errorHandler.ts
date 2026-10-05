import { Request, Response, NextFunction } from 'express';
import { logger } from '../observability/logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(400, message, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(401, message);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Forbidden: insufficient permissions') {
    super(403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
  }
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  const statusCode = err.statusCode || (err.status ? Number(err.status) : 500);
  const message = err.message || 'Internal Server Error';

  logger.error(
    {
      err,
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode,
    },
    'Request error occurred'
  );

  res.status(statusCode).json({
    error: message,
    details: err.details,
    requestId: req.requestId,
  });
}
