import { Request, Response, NextFunction } from "express";

/**
 * Base shape for errors that may include extra details
 */
interface ErrorWithDetails extends Error {
  details?: unknown;
  status?: number;
}

/**
 * 400 - Input validation error
 */
export class ValidationError extends Error implements ErrorWithDetails {
  public readonly details?: unknown;
  public readonly status = 400;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * 404 - Resource not found
 */
export class NotFoundError extends Error implements ErrorWithDetails {
  public readonly details?: unknown;
  public readonly status = 404;

  constructor(message = "Resource not found", details?: unknown) {
    super(message);
    this.name = "NotFoundError";
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * 401 - Unauthorized access
 */
export class UnauthorizedError extends Error implements ErrorWithDetails {
  public readonly details?: unknown;
  public readonly status = 401;

  constructor(message = "Unauthorized", details?: unknown) {
    super(message);
    this.name = "UnauthorizedError";
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Centralized error handler middleware for Express.
 * Always keep the 4-argument signature to be recognized by Express.
 */
export function errorHandler(
  err: ErrorWithDetails,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isProd = process.env.NODE_ENV === "production";
  const timestamp = new Date().toISOString();

  // Log full error with stack trace (logs are for operators; response will hide stack in prod)
  const route = `${req.method} ${req.originalUrl}`;
  const stack = err.stack || "";
  // eslint-disable-next-line no-console
  console.error(`[${timestamp}] ${route} -> ${err.name}: ${err.message}\n${stack}`);

  // Map to HTTP status codes
  let status = 500;
  let errorCode = "ServerError";

  if (err instanceof ValidationError) {
    status = 400;
    errorCode = "ValidationError";
  } else if (err instanceof NotFoundError) {
    status = 404;
    errorCode = "NotFoundError";
  } else if (err instanceof UnauthorizedError) {
    status = 401;
    errorCode = "UnauthorizedError";
  } else if (typeof err.status === "number") {
    // Allow upstream errors to hint a status code
    status = err.status;
  }

  const payload: {
    status: number;
    error: string;
    message: string;
    details?: unknown;
    stack?: string;
  } = {
    status,
    error: errorCode,
    message: err.message || "An unexpected error occurred",
  };

  if (err.details !== undefined) {
    payload.details = err.details;
  }
  if (!isProd && stack) {
    payload.stack = stack;
  }

  res.status(status).json(payload);
}

/**
 * 404 handler for unmatched routes.
 * Must be placed AFTER all routers and BEFORE the errorHandler.
 */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    status: 404,
    error: "NotFoundError",
    message: "Route not found",
  });
}


