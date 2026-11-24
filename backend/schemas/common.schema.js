// backend/schemas/common.schema.js
//
// Shared strict zod building blocks. Every schema in this directory is strict:
// unknown keys are rejected with a 400 instead of being silently dropped, so a
// client can never smuggle `role`, `status`, `assignedUserId`, `balance`-style
// fields into a service call.

const { z } = require("zod");

// Identifier format used by Prisma `cuid()` primary keys
const OBJECT_ID_PATTERN = /^c[0-9a-z]{6,40}$/;

// Validate a single id used in a route param or body
const objectIdSchema = z
  .string({ required_error: "ID is required.", invalid_type_error: "ID must be a string." })
  .trim()
  .regex(OBJECT_ID_PATTERN, "Invalid ID format.");

// A bounded bulk id list: max 100 entries, duplicates removed, at least one id
const MAX_BULK_IDS = 100;
const bulkIdsSchema = z
  .array(objectIdSchema, { required_error: "IDs are required.", invalid_type_error: "IDs must be an array." })
  .min(1, "At least one ID is required.")
  .max(MAX_BULK_IDS, `No more than ${MAX_BULK_IDS} IDs may be sent per request.`)
  .transform((ids) => [...new Set(ids)]);

// Page and limit come from the query string, so coerce before validating
const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(20);

// ISO date string or Date instance
const dateSchema = z
  .union([z.string(), z.date()])
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date.");

// Accept `YYYY-MM-DD` business day keys only
const dayKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format.")
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()), "Invalid date.");

// Free-text search filter used by the public archive (trimmed, length bounded)
const searchTermSchema = z.string().trim().min(1).max(100);

// Treat an empty query value ("") as "filter not set", which is what the
// archive UI sends for an unselected filter.
const blankToUndefined = (value) => (typeof value === "string" && value.trim() === "" ? undefined : value);

// A single allowed archive tier
const archiveTierSchema = z.enum(["free", "vip", "maxbet"]).optional();

// The outcome filter accepted by the public archive
const archiveOutcomeSchema = z
  .enum(["PENDING", "WON", "LOST", "VOID", "PUSH", "HALF_WON", "HALF_LOST"])
  .optional();

// Turn a zod issue into one readable message the controller can return
const formatIssues = (issues) =>
  issues.map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message));

module.exports = {
  z,
  objectIdSchema,
  bulkIdsSchema,
  MAX_BULK_IDS,
  pageSchema,
  limitSchema,
  dateSchema,
  dayKeySchema,
  searchTermSchema,
  blankToUndefined,
  archiveTierSchema,
  archiveOutcomeSchema,
  formatIssues,
};
