// errorHandler.js
//
// Central sanitized error handler. Controllers hand every failure here through
// `next(error)`, so this is the single place that decides what a client sees:
// - errors created by the services (with `status`/`statusCode`) keep their
//   message, because they are written for the client;
// - known Prisma failures are mapped to safe 4xx messages (no internals);
// - anything else is logged server-side and returned as a generic 500.

const { Prisma } = require("@prisma/client");

// Prisma error codes whose message is safe to describe generically per code
const PRISMA_CLIENT_ERRORS = {
  P2000: { statusCode: 400, message: "A provided value is too long." },
  P2002: { statusCode: 409, message: "A record with those details already exists." },
  P2003: { statusCode: 400, message: "The request references a record that does not exist." },
  P2011: { statusCode: 400, message: "A required value is missing." },
  P2012: { statusCode: 400, message: "A required value is missing." },
  P2014: { statusCode: 400, message: "The request conflicts with related records." },
  P2025: { statusCode: 404, message: "Record not found." },
};

// Malformed request bodies are reported by the body parser as client errors
const isBodyParserError = (error) =>
  error?.type === "entity.parse.failed" ||
  error?.type === "entity.too.large" ||
  error?.expose === true && Number.isInteger(error?.status);

const getClientStatus = (error) => {
  const status = Number(error?.status || error?.statusCode);
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : null;
};

// Resolve a safe status and message for an error, or null for an unexpected one
const resolveClientError = (error) => {
  if (error instanceof Prisma.PrismaClientValidationError) {
    return { statusCode: 400, message: "Invalid request data." };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return PRISMA_CLIENT_ERRORS[error.code] ?? null;
  }

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    return null;
  }

  if (isBodyParserError(error)) {
    const status = Number(error.status);
    const statusCode = error.type === "entity.too.large" ? 413 : status === 413 ? 413 : 400;
    return { statusCode, message: statusCode === 413 ? "Request body is too large." : "Malformed request body." };
  }

  const status = getClientStatus(error);
  if (status && status < 500) {
    return { statusCode: status, message: error.message || "Request failed." };
  }

  return null;
};

const errorHandler = (error, req, res, next) => {
  // A response that has already started (streaming/headers sent) cannot be
  // cleaned up here, so hand it back to Express.
  if (res.headersSent) return next(error);

  const clientError = resolveClientError(error);

  if (!clientError) {
    // Log the full error server-side only. The client never sees stack traces,
    // Prisma meta, SQL, or connection details.
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }

  // 5xx client errors are still worth logging, 4xx are expected client mistakes
  if (clientError.statusCode >= 500) console.error(error);

  return res.status(clientError.statusCode).json({ success: false, message: clientError.message });
};

errorHandler.resolveClientError = resolveClientError;

module.exports = errorHandler;
