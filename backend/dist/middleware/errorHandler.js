"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnauthorizedError = exports.NotFoundError = exports.ValidationError = void 0;
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
/**
 * 400 - Input validation error
 */
class ValidationError extends Error {
    details;
    status = 400;
    constructor(message, details) {
        super(message);
        this.name = "ValidationError";
        this.details = details;
        Object.setPrototypeOf(this, new.target.prototype);
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
exports.ValidationError = ValidationError;
/**
 * 404 - Resource not found
 */
class NotFoundError extends Error {
    details;
    status = 404;
    constructor(message = "Resource not found", details) {
        super(message);
        this.name = "NotFoundError";
        this.details = details;
        Object.setPrototypeOf(this, new.target.prototype);
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
exports.NotFoundError = NotFoundError;
/**
 * 401 - Unauthorized access
 */
class UnauthorizedError extends Error {
    details;
    status = 401;
    constructor(message = "Unauthorized", details) {
        super(message);
        this.name = "UnauthorizedError";
        this.details = details;
        Object.setPrototypeOf(this, new.target.prototype);
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
exports.UnauthorizedError = UnauthorizedError;
/**
 * Centralized error handler middleware for Express.
 * Always keep the 4-argument signature to be recognized by Express.
 */
function errorHandler(err, req, res, _next) {
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
    }
    else if (err instanceof NotFoundError) {
        status = 404;
        errorCode = "NotFoundError";
    }
    else if (err instanceof UnauthorizedError) {
        status = 401;
        errorCode = "UnauthorizedError";
    }
    else if (typeof err.status === "number") {
        // Allow upstream errors to hint a status code
        status = err.status;
    }
    const payload = {
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
function notFoundHandler(_req, res) {
    res.status(404).json({
        status: 404,
        error: "NotFoundError",
        message: "Route not found",
    });
}
