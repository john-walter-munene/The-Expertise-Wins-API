// backend/schemas/admin.schema.js
//
// Strict zod request schemas for every admin mutation and list query. These
// schemas are the first line of defence against mass assignment: a payload may
// only contain the keys listed here, and the matching service method applies a
// second allowlist before anything is written.

const {
  z,
  objectIdSchema,
  bulkIdsSchema,
  pageSchema,
  limitSchema,
  dateSchema,
  dayKeySchema,
  searchTermSchema,
  archiveTierSchema,
  archiveOutcomeSchema,
  blankToUndefined,
} = require("./common.schema");

// Enumerations mirrored from prisma/schema.prisma
const userRoles = ["USER", "ADMIN", "TIPSTER", "EDITOR"];
const userStatuses = ["ACTIVE", "SUSPENDED", "BANNED", "PENDING"];
const tipStatuses = ["PENDING", "PUBLISHED", "LOCKED", "SETTLED", "CANCELLED", "VOID"];
const tipOutcomes = ["PENDING", "WON", "LOST", "VOID", "PUSH", "HALF_WON", "HALF_LOST", "CANCELLED"];
const settledTipOutcomes = ["WON", "LOST", "VOID", "PUSH", "HALF_WON", "HALF_LOST", "CANCELLED"];
const productTypes = ["FREE", "VIP", "MAXBET", "API", "CUSTOM"];
const productStatuses = ["ACTIVE", "INACTIVE", "ARCHIVED"];
const accessTokenStatuses = ["ACTIVE", "REVOKED", "EXPIRED"];

// Short optional free text fields
const trimmedString = (max) => z.string().trim().max(max);

// Maximum selections accepted on a tip
const MAX_SELECTIONS = 50;

// Tip selections are stored as Json. Each selection must be a flat object so a
// nested payload cannot bloat or smuggle structure into statistics.
const selectionSchema = z.record(
  z.union([z.string().max(500), z.number(), z.boolean(), z.null(), z.array(z.string().max(200)).max(20)])
);

// Fields accepted when an admin creates or edits a tip
const tipWriteFields = {
  source: z.string().trim().min(1).max(100).optional(),
  externalId: trimmedString(200).optional().nullable(),
  sport: z.string().trim().min(1).max(100).optional(),
  competition: trimmedString(200).optional().nullable(),
  league: trimmedString(200).optional().nullable(),
  country: trimmedString(100).optional().nullable(),
  homeTeam: trimmedString(200).optional().nullable(),
  awayTeam: trimmedString(200).optional().nullable(),
  kickoff: trimmedString(100).optional().nullable(),
  market: z.string().trim().min(1).max(200).optional(),
  selection: z.string().trim().min(1).max(300).optional(),
  odds: z.number().min(1).max(1000).optional().nullable(),
  stakeUnits: z.number().min(0).max(1000).optional().nullable(),
  previewTitle: trimmedString(300).optional().nullable(),
  preview: z.string().max(20000).optional().nullable(),
  verdict: z.string().max(5000).optional().nullable(),
  tips: z.array(selectionSchema).max(MAX_SELECTIONS).optional().nullable(),
  analytics: z.record(z.any()).optional().nullable(),
  confidenceIndex: z.number().min(0).max(100).optional().nullable(),
  predictedScore: trimmedString(100).optional().nullable(),
  detailsUrl: z.string().trim().url().max(2000).optional().nullable(),
  status: z.enum(tipStatuses).optional(),
  result: trimmedString(500).optional().nullable(),
  outcome: z.enum(tipOutcomes).optional(),
  extraTips: z.array(selectionSchema).max(MAX_SELECTIONS).optional().nullable(),
  scrapedAt: dateSchema.optional().nullable(),
};

// Publishing, authorship and settlement timestamps are state the service owns,
// so they are simply not part of the accepted key set.
const createTipSchema = z
  .object(tipWriteFields)
  .strict()
  .refine((data) => Boolean(data.source && data.sport && data.market && data.selection), {
    message: "source, sport, market and selection are required.",
  });

// An edit must change at least one field
const updateTipSchema = z
  .object(tipWriteFields)
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "No tip fields provided for update." });

// Bulk tip update: only these fields are editable in bulk
const bulkTipUpdateDataSchema = z
  .object({
    status: z.enum(tipStatuses).optional(),
    result: trimmedString(500).optional().nullable(),
    outcome: z.enum(tipOutcomes).optional(),
    stakeUnits: z.number().min(0).max(1000).optional().nullable(),
    odds: z.number().min(1).max(1000).optional().nullable(),
    verdict: z.string().max(5000).optional().nullable(),
    preview: z.string().max(20000).optional().nullable(),
    previewTitle: trimmedString(300).optional().nullable(),
    confidenceIndex: z.number().min(0).max(100).optional().nullable(),
    predictedScore: trimmedString(100).optional().nullable(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "No tip fields provided for bulk update." });

const updateTipsBulkSchema = z.object({ ids: bulkIdsSchema, data: bulkTipUpdateDataSchema }).strict();

// Settlement: outcome is a required enum and `result` is optional free text
const settleTipSchema = z
  .object({
    outcome: z.enum(settledTipOutcomes, { required_error: "outcome is required." }),
    result: trimmedString(500).optional().nullable(),
    selectionOutcomes: z.array(z.enum(settledTipOutcomes)).max(MAX_SELECTIONS).optional(),
  })
  .strict();

// Optional idempotency key for a settlement request (Max 128 characters)
const idempotencyKeyHeader = z.string().trim().min(8).max(128).optional();

const settleTipsBulkSchema = z
  .object({
    ids: bulkIdsSchema,
    outcome: z.enum(settledTipOutcomes, { required_error: "outcome is required." }),
    result: trimmedString(500).optional().nullable(),
  })
  .strict();

// Bulk id-only operations
const tipIdsBodySchema = z.object({ ids: bulkIdsSchema }).strict();

const publishTipToProductSchema = z.object({ productId: objectIdSchema }).strict();

// User management. `id` is validated separately; body keys are strict.
const updateUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().optional(),
    username: z
      .string()
      .trim()
      .min(3)
      .max(30)
      .regex(/^[A-Za-z0-9._-]+$/, "Username may only contain letters, numbers, dots, hyphens, and underscores.")
      .optional(),
    firstName: z.string().trim().max(50).optional().nullable(),
    lastName: z.string().trim().max(50).optional().nullable(),
    telegramUsername: trimmedString(100).optional().nullable(),
    telegramUserId: trimmedString(100).optional().nullable(),
    role: z.enum(userRoles).optional(),
    status: z.enum(userStatuses).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "No user fields provided for update." });

const updateUserStatusSchema = z.object({ status: z.enum(userStatuses, { required_error: "status is required." }) }).strict();

// Access tokens
const accessTokenWriteFields = {
  productId: objectIdSchema,
  assignedUserId: objectIdSchema,
  expiresAt: dateSchema.optional().nullable(),
  notes: trimmedString(1000).optional().nullable(),
};

const createAccessTokenSchema = z.object(accessTokenWriteFields).strict();

const createAccessTokensBulkSchema = z
  .object({ ...accessTokenWriteFields, count: z.number().int().min(1).max(100) })
  .strict();

// An assigned token cannot be reassigned; only notes, status and expiry change
const updateAccessTokenSchema = z
  .object({
    notes: trimmedString(1000).optional().nullable(),
    status: z.enum(accessTokenStatuses).optional(),
    expiresAt: dateSchema.optional().nullable(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "No access token fields provided for update." });

const extendAccessTokenSchema = z
  .object({ days: z.number().int().min(1).max(365, "Days must be between 1 and 365.") })
  .strict();

// Products
const productWriteFields = {
  name: z.string().trim().min(1).max(120).optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers, and hyphens.")
    .optional(),
  description: z.string().max(5000).optional().nullable(),
  type: z.enum(productTypes).optional(),
  status: z.enum(productStatuses).optional(),
  isPublic: z.boolean().optional(),
};

const createProductSchema = z
  .object(productWriteFields)
  .strict()
  .refine((data) => Boolean(data.name && data.slug && data.type), {
    message: "Name, slug, and type are required.",
  });

const updateProductSchema = z
  .object(productWriteFields)
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "No product fields provided for update." });

const updateProductStatusSchema = z
  .object({ status: z.enum(productStatuses, { required_error: "status is required." }) })
  .strict();

// List query schemas. Only the allowlisted filters below reach Prisma; any other
// query parameter is rejected rather than forwarded to a where clause.
const adminTipListQuerySchema = z
  .object({
    page: pageSchema,
    limit: limitSchema,
    day: z.enum(["today", "yesterday"]).optional(),
    status: z.enum(tipStatuses).optional(),
    outcome: z.enum(tipOutcomes).optional(),
    sport: trimmedString(100).optional(),
    source: trimmedString(100).optional(),
  })
  .strict();

const adminUserListQuerySchema = z
  .object({
    page: pageSchema,
    limit: limitSchema,
    status: z.enum(userStatuses).optional(),
    role: z.enum(userRoles).optional(),
  })
  .strict();

const adminAccessTokenListQuerySchema = z
  .object({
    page: pageSchema,
    limit: limitSchema,
    productId: objectIdSchema.optional(),
    assignedUserId: objectIdSchema.optional(),
    status: z.enum(["ACTIVE", "USED", "EXPIRED", "REVOKED"]).optional(),
  })
  .strict();

const adminProductListQuerySchema = z
  .object({
    page: pageSchema,
    limit: limitSchema,
    type: z.enum(productTypes).optional(),
    status: z.enum(productStatuses).optional(),
  })
  .strict();

// Route params shared by every `/:id` admin route
const idParamsSchema = z.object({ id: objectIdSchema }).strict();
const tipPublicationParamsSchema = z.object({ id: objectIdSchema, productId: objectIdSchema }).strict();

// Public tip query schemas. Only the documented filters reach the service, and
// pagination is bounded exactly like the admin lists.
const publicTipListQuerySchema = z
  .object({
    page: pageSchema,
    limit: limitSchema,
    day: dayKeySchema.optional(),
    sport: trimmedString(100).optional(),
    outcome: z.enum(["PENDING", "WON", "LOST", "VOID", "PUSH", "HALF_WON", "HALF_LOST"]).optional(),
  })
  .strict();

const archiveQuerySchema = z.preprocess(
  (raw) => {
    // The archive UI sends "" for an unselected filter; treat that as not set
    if (!raw || typeof raw !== "object") return raw;
    const cleaned = {};
    for (const [key, value] of Object.entries(raw)) {
      const normalised = blankToUndefined(value);
      if (normalised !== undefined) cleaned[key] = normalised;
    }
    return cleaned;
  },
  z
    .object({
      page: pageSchema,
      limit: limitSchema,
      tier: archiveTierSchema,
      sport: trimmedString(100).optional(),
      outcome: archiveOutcomeSchema,
      search: searchTermSchema.optional(),
      day: dayKeySchema.optional(),
      from: dayKeySchema.optional(),
      to: dayKeySchema.optional(),
    })
    .strict()
    .refine((query) => !(query.day && (query.from || query.to)), {
      message: "Send either day or from/to, not both.",
    })
);

module.exports = {
  userRoles,
  userStatuses,
  tipStatuses,
  tipOutcomes,
  settledTipOutcomes,
  productTypes,
  productStatuses,
  accessTokenStatuses,
  dayKeySchema,
  createTipSchema,
  updateTipSchema,
  updateTipsBulkSchema,
  settleTipSchema,
  settleTipsBulkSchema,
  tipIdsBodySchema,
  publishTipToProductSchema,
  updateUserSchema,
  updateUserStatusSchema,
  createAccessTokenSchema,
  createAccessTokensBulkSchema,
  updateAccessTokenSchema,
  extendAccessTokenSchema,
  createProductSchema,
  updateProductSchema,
  updateProductStatusSchema,
  adminTipListQuerySchema,
  adminUserListQuerySchema,
  adminAccessTokenListQuerySchema,
  adminProductListQuerySchema,
  idParamsSchema,
  tipPublicationParamsSchema,
  publicTipListQuerySchema,
  archiveQuerySchema,
  idempotencyKeyHeader,
};
