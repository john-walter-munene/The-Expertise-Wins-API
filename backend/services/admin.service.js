const crypto = require("crypto");
const prisma = require("../lib/prisma");
const BUSINESS_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

// Select user fields returned to the client
const USER_SELECT = {
  id: true,
  email: true,
  username: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  telegramUsername: true,
  telegramUserId: true,
  lastLoginAt: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
};

// Select tip fields returned to the client
const TIP_SELECT = {
  id: true,
  source: true,
  externalId: true,
  sport: true,
  competition: true,
  league: true,
  country: true,
  homeTeam: true,
  awayTeam: true,
  kickoff: true,
  market: true,
  selection: true,
  odds: true,
  stakeUnits: true,
  previewTitle: true,
  preview: true,
  verdict: true,
  tips: true,
  analytics: true,
  confidenceIndex: true,
  predictedScore: true,
  detailsUrl: true,
  status: true,
  result: true,
  outcome: true,
  extraTips: true,
  scrapedAt: true,
  publishedAt: true,
  settledAt: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  publishedById: true,
};

// Select product fields returned to the client
const PRODUCT_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  type: true,
  status: true,
  isPublic: true,
  createdAt: true,
  updatedAt: true,
};

// Select access token fields returned to the client, excluding the hash
const ACCESS_TOKEN_SELECT = {
  id: true,
  tokenPrefix: true,
  productId: true,
  assignedUserId: true,
  status: true,
  expiresAt: true,
  usedAt: true,
  notes: true,
  createdAt: true,
  product: { select: { id: true, name: true, slug: true, type: true } },
  assignedUser: { select: { id: true, email: true, username: true, firstName: true, lastName: true } },
};

// Create an error with an HTTP status the error handler can read
const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.status = statusCode;
  error.statusCode = statusCode;
  return error;
};

// Keep the service mutation boundary safe even when methods are called outside
// Express route middleware (CLI tools/tests/internal jobs).
const requireActiveAdmin = async (userId) => {
  if (!userId || typeof userId !== "string") {
    throw createError("Authentication required.", 401);
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") throw createError("Active account required.", 403);
  if (user.role !== "ADMIN") throw createError("Admin access required.", 403);
  return user;
};

// Parse page and limit from the query string
const parsePagination = (query = {}) => {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};

// Identifier format shared by Prisma cuid() primary keys. Route validation
// checks this first; the service checks again so direct calls (tests, jobs,
// future internal callers) cannot reach Prisma with a malformed id.
const OBJECT_ID_PATTERN = /^c[0-9a-z]{6,40}$/;

const isObjectId = (value) => typeof value === "string" && OBJECT_ID_PATTERN.test(value);

const assertObjectId = (value, label = "ID") => {
  if (!isObjectId(value)) throw createError(`Invalid ${label} format.`, 400);
  return value;
};

// Largest bulk operation accepted in one request
const MAX_BULK_IDS = 100;

// Largest number of access tokens minted in one bulk request
const MAX_BULK_TOKEN_COUNT = 100;

// Access token lifetime bounds, in days
const MIN_TOKEN_DAYS = 1;
const MAX_TOKEN_DAYS = 365;

// Outcomes an admin may settle a tip to
const VALID_SETTLE_OUTCOMES = ["WON", "LOST", "VOID", "PUSH", "HALF_WON", "HALF_LOST", "CANCELLED"];

// Outcome -> the only status it may move a tip to
const OUTCOME_TARGET_STATUS = {
  WON: "SETTLED",
  LOST: "SETTLED",
  PUSH: "SETTLED",
  HALF_WON: "SETTLED",
  HALF_LOST: "SETTLED",
  VOID: "SETTLED",
  CANCELLED: "CANCELLED",
};

// Settlement is a one-way state transition. A tip that is already settled may
// only be re-settled to the very same outcome, which is how an idempotent
// retry is recognised; any other change is a double-payment risk and is
// rejected before the database is touched. Cancelled tips are final.
const assertSettlementTransition = (tip, outcome) => {
  if (!VALID_SETTLE_OUTCOMES.includes(outcome)) {
    throw createError("Invalid tip outcome.", 400);
  }
  if (!tip) throw createError("Tip not found.", 404);

  const currentOutcome = String(tip.outcome || "PENDING").toUpperCase();
  const currentStatus = String(tip.status || "PENDING").toUpperCase();
  const alreadyFinal =
    currentStatus === "CANCELLED" ||
    currentStatus === "SETTLED" ||
    VALID_SETTLE_OUTCOMES.includes(currentOutcome);

  // Nothing to change: the caller is retrying an already-applied settlement.
  if (!alreadyFinal) return true;

  // Replaying the exact same settlement is safe and keeps the original
  // settledAt untouched; the record is simply acknowledged.
  if (currentOutcome === outcome && currentStatus === OUTCOME_TARGET_STATUS[outcome]) return false;

  if (currentStatus === "CANCELLED" || currentOutcome === "CANCELLED") {
    throw createError("A cancelled tip cannot be settled again.", 409);
  }

  throw createError("This tip is already settled. Re-settling to a different outcome is not allowed.", 409);
};

// Cancel is the only terminal transition an admin may start from any live
// state; a cancelled or settled record must not be overwritten.
const assertNotFinalTip = (tip) => {
  if (!tip) throw createError("Tip not found.", 404);
  const currentOutcome = String(tip.outcome || "PENDING").toUpperCase();
  const currentStatus = String(tip.status || "PENDING").toUpperCase();
  if (currentStatus === "CANCELLED" || currentOutcome === "CANCELLED") {
    throw createError("This tip is already cancelled.", 409);
  }
  if (currentStatus === "SETTLED" || VALID_SETTLE_OUTCOMES.includes(currentOutcome)) {
    throw createError("A settled tip cannot be cancelled or deleted.", 409);
  }
  return true;
};

// In-memory idempotency keys for settlement requests. A replayed request with
// the same key returns the original response instead of settling twice. Entries
// expire after IDEMPOTENCY_TTL_MS and the map is bounded in size.
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_IDEMPOTENCY_ENTRIES = 5000;
const settlementIdempotencyKeys = new Map();

const normaliseIdempotencyKey = (key) => {
  if (key === undefined || key === null) return null;
  const value = String(key).trim();
  if (!value) return null;
  if (value.length < 8 || value.length > 128) {
    throw createError("Idempotency key must be between 8 and 128 characters.", 400);
  }
  return value;
};

const getIdempotentSettlement = (key) => {
  if (!key) return null;
  const entry = settlementIdempotencyKeys.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > IDEMPOTENCY_TTL_MS) {
    settlementIdempotencyKeys.delete(key);
    return null;
  }
  return entry.response;
};

const storeIdempotentSettlement = (key, response) => {
  if (!key) return;
  const now = Date.now();
  if (settlementIdempotencyKeys.size >= MAX_IDEMPOTENCY_ENTRIES) {
    for (const [storedKey, entry] of settlementIdempotencyKeys) {
      if (now - entry.storedAt > IDEMPOTENCY_TTL_MS) settlementIdempotencyKeys.delete(storedKey);
    }
    // Still full: drop the oldest entry so the map stays bounded.
    while (settlementIdempotencyKeys.size >= MAX_IDEMPOTENCY_ENTRIES) {
      settlementIdempotencyKeys.delete(settlementIdempotencyKeys.keys().next().value);
    }
  }
  settlementIdempotencyKeys.set(key, { storedAt: now, response });
};

const getBusinessDayKey = (timestamp = Date.now()) =>
  new Date(timestamp + BUSINESS_UTC_OFFSET_MS).toISOString().slice(0, 10);

const shiftBusinessDay = (dayKey, offset) => {
  const day = new Date(`${dayKey}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
};

const getBusinessDayRange = (dayKey) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) throw createError("Invalid admin tip date.", 400);
  const start = Date.parse(`${dayKey}T00:00:00.000Z`) - BUSINESS_UTC_OFFSET_MS;
  const end = Date.parse(`${dayKey}T23:59:59.999Z`) - BUSINESS_UTC_OFFSET_MS;
  return { gte: new Date(start), lte: new Date(end) };
};

// List users with filters and pagination
const getUsers = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.role) where.role = query.role;

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
};

// Get a single user with their access tokens
const getUserById = async (userId) => {
  assertObjectId(userId, "user ID");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...USER_SELECT,
      accessTokens: {
        select: ACCESS_TOKEN_SELECT,
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!user) throw createError("User not found.", 404);
  return user;
};

// Refuse any change that would leave the application without a usable admin.
// `nextRole`/`nextStatus` are the values the target user would have after the
// change; when a field is unchanged the caller passes the current value.
const assertLastAdminGuard = async (userId, nextRole, nextStatus) => {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true },
  });
  if (!existing) throw createError("User not found.", 404);

  const resolvedRole = nextRole ?? existing.role;
  const resolvedStatus = nextStatus ?? existing.status;

  // Only an active admin losing that standing can reduce the admin count
  const wasActiveAdmin = existing.role === "ADMIN" && existing.status === "ACTIVE";
  const staysActiveAdmin = resolvedRole === "ADMIN" && resolvedStatus === "ACTIVE";
  if (!wasActiveAdmin || staysActiveAdmin) return;

  const remainingAdmins = await prisma.user.count({
    where: { role: "ADMIN", status: "ACTIVE", NOT: { id: userId } },
  });
  if (remainingAdmins < 1) {
    throw createError("At least one active admin account must remain.", 400);
  }
};

// Update allowed user fields and check unique values first
const updateUser = async (userId, userData = {}, actorId) => {
  assertObjectId(userId, "user ID");
  await requireActiveAdmin(actorId);
  const allowedFields = ["email", "username", "firstName", "lastName", "telegramUsername", "telegramUserId", "role", "status"];
  const data = {};
  for (const field of allowedFields) {
    if (userData[field] !== undefined) data[field] = userData[field];
  }
  if (Object.keys(data).length === 0) throw createError("No user fields provided for update.");

  // Role/status changes can demote or lock out the last admin
  if (data.role !== undefined || data.status !== undefined) {
    await assertLastAdminGuard(userId, data.role, data.status);
  }

  // Build conflict checks only for unique fields being changed
  const uniqueChecks = [
    data.email ? { email: data.email, NOT: { id: userId } } : undefined,
    data.username ? { username: data.username, NOT: { id: userId } } : undefined,
    data.telegramUserId ? { telegramUserId: data.telegramUserId, NOT: { id: userId } } : undefined,
  ].filter(Boolean);

  if (uniqueChecks.length > 0) {
    const existingUser = await prisma.user.findFirst({
      where: { OR: uniqueChecks },
      select: { id: true },
    });
    if (existingUser) throw createError("Email, username, or Telegram user ID is already in use.", 409);
  }

  const user = await prisma.user.update({ where: { id: userId }, data, select: USER_SELECT });
  return user;
};

// Update a user's status after validating it
const updateUserStatus = async (userId, status, actorId) => {
  assertObjectId(userId, "user ID");
  await requireActiveAdmin(actorId);
  const validStatuses = ["ACTIVE", "SUSPENDED", "BANNED", "PENDING"];
  if (!validStatuses.includes(status)) throw createError("Invalid user status.");
  if (status !== "ACTIVE") await assertLastAdminGuard(userId, undefined, status);
  const user = await prisma.user.update({ where: { id: userId }, data: { status }, select: USER_SELECT });
  return user;
};

// Permanently delete a user account. Suspension is the reversible option; this
// removes the account for good. Access tokens owned by the user and usage
// events referencing them are detached first so the delete cannot trip a
// foreign-key constraint. Admins cannot delete their own account.
const deleteUser = async (userId, actorId) => {
  assertObjectId(userId, "user ID");
  await requireActiveAdmin(actorId);

  if (userId === actorId) {
    throw createError("You cannot delete your own account.", 400);
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true },
  });
  if (!existing) throw createError("User not found.", 404);

  // Deleting the last active admin would lock every administrator out
  if (existing.role === "ADMIN" && existing.status === "ACTIVE") {
    const remainingAdmins = await prisma.user.count({
      where: { role: "ADMIN", status: "ACTIVE", NOT: { id: userId } },
    });
    if (remainingAdmins < 1) {
      throw createError("At least one active admin account must remain.", 400);
    }
  }

  await prisma.$transaction([
    // Tokens are issued to one owner; keep the audit record but release the link.
    prisma.accessToken.updateMany({
      where: { assignedUserId: userId },
      data: { assignedUserId: null },
    }),
    // Usage events are analytics history and should survive the account.
    prisma.usageEvent.updateMany({
      where: { userId },
      data: { userId: null },
    }),
    // Tips authored or published by the user keep their history, just unsigned.
    prisma.tip.updateMany({
      where: { createdById: userId },
      data: { createdById: null },
    }),
    prisma.tip.updateMany({
      where: { publishedById: userId },
      data: { publishedById: null },
    }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  return { message: "User deleted successfully.", id: userId };
};

// Create a tip from allowed fields and check required fields
const createTip = async (tipData = {}, userId, actorId = userId) => {
  await requireActiveAdmin(actorId);
  const allowedFields = [
    "source",
    "externalId",
    "sport",
    "competition",
    "league",
    "country",
    "homeTeam",
    "awayTeam",
    "kickoff",
    "market",
    "selection",
    "odds",
    "stakeUnits",
    "previewTitle",
    "preview",
    "verdict",
    "tips",
    "analytics",
    "confidenceIndex",
    "predictedScore",
    "detailsUrl",
    "status",
    "result",
    "outcome",
    "extraTips",
    "scrapedAt",
  ];
  const data = { createdById: userId };
  for (const field of allowedFields) {
    if (tipData[field] !== undefined) data[field] = tipData[field];
  }
  const requiredFields = ["source", "sport", "market", "selection"];
  for (const field of requiredFields) {
    if (!data[field]) throw createError(`${field} is required.`);
  }
  return prisma.tip.create({ data, select: TIP_SELECT });
};

// List tips with filters and pagination
const getTips = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const where = {};
  const today = getBusinessDayKey();
  if (query.day && query.day !== "today" && query.day !== "yesterday") {
    throw createError("Admin tip day must be today or yesterday.", 400);
  }
  const dayKey = query.day === "yesterday" ? shiftBusinessDay(today, -1) : today;
  const range = getBusinessDayRange(dayKey);
  where.AND = [{
    OR: [
      { scrapedAt: range },
      { scrapedAt: null, publishedAt: range },
      { scrapedAt: null, publishedAt: null, createdAt: range },
    ],
  }];
  if (query.status) where.status = query.status;
  if (query.outcome) where.outcome = query.outcome;
  if (query.sport) where.sport = query.sport;
  if (query.source) where.source = query.source;

  const [tips, total] = await prisma.$transaction([
    prisma.tip.findMany({
      where,
      select: {
        ...TIP_SELECT,
        publications: {
          select: { status: true, product: { select: { id: true, name: true, slug: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.tip.count({ where }),
  ]);
  return { tips, day: dayKey, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

// Get a single tip with its product publications
const getTipById = async (tipId) => {
  assertObjectId(tipId, "tip ID");
  const tip = await prisma.tip.findUnique({
    where: { id: tipId },
    select: {
      ...TIP_SELECT,
      publications: { include: { product: { select: PRODUCT_SELECT } } },
    },
  });
  if (!tip) throw createError("Tip not found.", 404);
  return tip;
};

// Update allowed tip fields
const updateTip = async (tipId, tipData = {}, actorId) => {
  assertObjectId(tipId, "tip ID");
  await requireActiveAdmin(actorId);
  const allowedFields = [
    "source",
    "externalId",
    "sport",
    "competition",
    "league",
    "country",
    "homeTeam",
    "awayTeam",
    "kickoff",
    "market",
    "selection",
    "odds",
    "stakeUnits",
    "previewTitle",
    "preview",
    "verdict",
    "tips",
    "analytics",
    "confidenceIndex",
    "predictedScore",
    "detailsUrl",
    "status",
    "result",
    "outcome",
    "extraTips",
    "scrapedAt",
  ];
  const data = {};
  for (const field of allowedFields) {
    if (tipData[field] !== undefined) data[field] = tipData[field];
  }
  if (Object.keys(data).length === 0) throw createError("No tip fields provided for update.");
  return prisma.tip.update({ where: { id: tipId }, data, select: TIP_SELECT });
};

// Soft delete a tip by marking it cancelled. Cancelled and settled tips are
// final record: deleting them again is refused so a settled result can never
// be silently overwritten.
const deleteTip = async (tipId, actorId) => {
  assertObjectId(tipId, "tip ID");
  await requireActiveAdmin(actorId);
  const existing = await prisma.tip.findUnique({
    where: { id: tipId },
    select: { id: true, status: true },
  });
  if (!existing) throw createError("Tip not found.", 404);
  assertNotFinalTip(existing);
  return prisma.tip.update({
    where: { id: tipId },
    data: { status: "CANCELLED", outcome: "CANCELLED", settledAt: new Date() },
    select: TIP_SELECT,
  });
};

// Validate a list of tip ids and remove duplicates. The list is bounded so a
// single bulk request cannot lock the database with tens of thousands of ids.
const validateTipIds = (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) throw createError("At least one tip ID is required.");
  if (ids.length > MAX_BULK_IDS) {
    throw createError(`No more than ${MAX_BULK_IDS} tip IDs may be sent per request.`, 400);
  }
  const unique = [...new Set(ids)];
  for (const id of unique) assertObjectId(id, "tip ID");
  return unique;
};

// Update allowed fields on many tips
const updateTipsBulk = async (ids, data, actorId) => {
  await requireActiveAdmin(actorId);
  const tipIds = validateTipIds(ids);
  const allowedFields = ["status", "result", "outcome", "stakeUnits", "odds", "verdict", "preview", "previewTitle", "confidenceIndex", "predictedScore"];
  const updateData = {};
  for (const field of allowedFields) {
    if (data?.[field] !== undefined) updateData[field] = data[field];
  }
  if (Object.keys(updateData).length === 0) throw createError("No tip fields provided for bulk update.");
  const result = await prisma.tip.updateMany({ where: { id: { in: tipIds } }, data: updateData });
  return { message: "Tips updated successfully.", updated: result.count };
};

// Publish a single tip and record who published it. A cancelled or settled tip
// keeps its final state.
const publishTip = async (tipId, userId, actorId = userId) => {
  assertObjectId(tipId, "tip ID");
  await requireActiveAdmin(actorId);
  const existing = await prisma.tip.findUnique({
    where: { id: tipId },
    select: { id: true, status: true, outcome: true },
  });
  if (!existing) throw createError("Tip not found.", 404);
  if (existing.status === "CANCELLED") throw createError("A cancelled tip cannot be published.", 409);
  return prisma.tip.update({
    where: { id: tipId },
    data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: userId },
    select: TIP_SELECT,
  });
};

// Publish many tips and record who published them
const publishTipsBulk = async (ids, userId, actorId = userId) => {
  await requireActiveAdmin(actorId);
  const tipIds = validateTipIds(ids);
  const publishedAt = new Date();
  const result = await prisma.tip.updateMany({
    where: { id: { in: tipIds }, status: { not: "CANCELLED" } },
    data: { status: "PUBLISHED", publishedAt, publishedById: userId },
  });
  return { message: "Tips published successfully.", updated: result.count };
};

// Unpublish a single tip by locking it
const unpublishTip = async (tipId, actorId) => {
  assertObjectId(tipId, "tip ID");
  await requireActiveAdmin(actorId);
  return prisma.tip.update({ where: { id: tipId }, data: { status: "LOCKED" }, select: TIP_SELECT });
};

// Unpublish many tips by locking them
const unpublishTipsBulk = async (ids, actorId) => {
  await requireActiveAdmin(actorId);
  const tipIds = validateTipIds(ids);
  const result = await prisma.tip.updateMany({ where: { id: { in: tipIds } }, data: { status: "LOCKED" } });
  return { message: "Tips unpublished successfully.", updated: result.count };
};

// Settle a single tip with a validated outcome. Enum validation and the
// state-machine guard run before anything is written, and an optional
// idempotency key replays the original response instead of settling twice.
const settleTip = async (tipId, outcome, result, actorId, selectionOutcomes, idempotencyKey) => {
  assertObjectId(tipId, "tip ID");
  await requireActiveAdmin(actorId);
  const key = normaliseIdempotencyKey(idempotencyKey);

  const replay = getIdempotentSettlement(key);
  if (replay) return replay;

  if (!VALID_SETTLE_OUTCOMES.includes(outcome)) throw createError("Invalid tip outcome.");

  const currentTip = await prisma.tip.findUnique({
    where: { id: tipId },
    select: { id: true, status: true, outcome: true, tips: true },
  });
  if (!currentTip) throw createError("Tip not found.", 404);

  // Settled/cancelled tips can only be replayed with the identical outcome
  if (!assertSettlementTransition(currentTip, outcome)) {
    const unchanged = await prisma.tip.findUnique({ where: { id: tipId }, select: TIP_SELECT });
    storeIdempotentSettlement(key, unchanged);
    return unchanged;
  }

  const data = { status: "SETTLED", outcome, result: result ?? null, settledAt: new Date() };

  if (selectionOutcomes !== undefined) {
    if (!Array.isArray(selectionOutcomes)) {
      throw createError("Selection outcomes must be an array.");
    }
    if (!Array.isArray(currentTip.tips) || selectionOutcomes.length !== currentTip.tips.length) {
      throw createError("Provide one outcome for each selection in this tip.");
    }

    data.tips = currentTip.tips.map((selection, index) => {
      if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
        throw createError("Tip selections must be valid objects before they can be settled.");
      }
      const selectionOutcome = String(selectionOutcomes[index] || "").toUpperCase();
      if (!VALID_SETTLE_OUTCOMES.includes(selectionOutcome)) {
        throw createError(`Invalid outcome for selection ${index + 1}.`);
      }
      return { ...selection, outcome: selectionOutcome };
    });
  }

  const settledTip = await prisma.tip.update({
    where: { id: tipId },
    data,
    select: TIP_SELECT,
  });

  storeIdempotentSettlement(key, settledTip);
  return settledTip;
};

// Settle many tips with a validated outcome. A tip can hold several nested
// selections, and the nested `tips[].outcome` is what statistics read. Writing
// only the parent row would leave every selection on its old outcome, so a
// bulk WON would still be scored as a loss in profit and ROI. Settle the parent
// and every nested selection together, exactly like the single-tip path, and
// skip any tip that is already settled so a replay is idempotent.
const settleTipsBulk = async (ids, outcome, result, actorId, idempotencyKey) => {
  await requireActiveAdmin(actorId);
  const tipIds = validateTipIds(ids);
  if (!VALID_SETTLE_OUTCOMES.includes(outcome)) throw createError("Invalid tip outcome.");
  if (!tipIds.length) return { message: "Tips settled successfully.", updated: 0 };

  const key = normaliseIdempotencyKey(idempotencyKey);
  const replay = getIdempotentSettlement(key);
  if (replay) return replay;

  const tips = await prisma.tip.findMany({
    where: { id: { in: tipIds } },
    select: { id: true, status: true, outcome: true, tips: true },
  });

  // A bulk settlement skips tips that are already final; it never rewrites a
  // different settled outcome in bulk. `result` is validated outside the guard
  // so a legacy `null` placeholder is still accepted.
  const settleable = tips.filter((tip) => {
    if (!VALID_SETTLE_OUTCOMES.includes(outcome)) return false;
    return assertSettlementTransition(tip, outcome);
  });

  const settledAt = new Date();
  await prisma.$transaction(
    settleable.map((tip) => {
      const updateData = { status: "SETTLED", outcome, settledAt };
      if (result !== undefined) updateData.result = result;

      if (Array.isArray(tip.tips) && tip.tips.length > 0) {
        updateData.tips = tip.tips.map((selection) => {
          if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
            return selection;
          }
          return { ...selection, outcome };
        });
      }

      return prisma.tip.update({ where: { id: tip.id }, data: updateData });
    })
  );

  const response = { message: "Tips settled successfully.", updated: settleable.length };
  storeIdempotentSettlement(key, response);
  return response;
};

// Cancel a single tip. Settled and already-cancelled tips are final.
const cancelTip = async (tipId, actorId) => {
  assertObjectId(tipId, "tip ID");
  await requireActiveAdmin(actorId);
  const existing = await prisma.tip.findUnique({
    where: { id: tipId },
    select: { id: true, status: true, outcome: true },
  });
  if (!existing) throw createError("Tip not found.", 404);
  assertNotFinalTip(existing);
  return prisma.tip.update({
    where: { id: tipId },
    data: { status: "CANCELLED", outcome: "CANCELLED", settledAt: new Date() },
    select: TIP_SELECT,
  });
};

// Cancel many tips. Only live tips are cancelled; settled and cancelled rows
// keep their final state.
const cancelTipsBulk = async (ids, actorId) => {
  await requireActiveAdmin(actorId);
  const tipIds = validateTipIds(ids);
  const result = await prisma.tip.updateMany({
    where: {
      id: { in: tipIds },
      status: { notIn: ["SETTLED", "CANCELLED"] },
      outcome: { notIn: VALID_SETTLE_OUTCOMES },
    },
    data: { status: "CANCELLED", outcome: "CANCELLED", settledAt: new Date() },
  });
  return { message: "Tips cancelled successfully.", updated: result.count };
};

// Publish a tip to an active product, creating or reviving the publication
const publishTipToProduct = async (tipId, productId, actorId) => {
  assertObjectId(tipId, "tip ID");
  assertObjectId(productId, "product ID");
  await requireActiveAdmin(actorId);
  const [tip, product] = await Promise.all([
    prisma.tip.findUnique({ where: { id: tipId }, select: { id: true } }),
    prisma.product.findUnique({ where: { id: productId }, select: { id: true, status: true } }),
  ]);
  if (!tip) throw createError("Tip not found.", 404);
  if (!product) throw createError("Product not found.", 404);
  if (product.status !== "ACTIVE") throw createError("Cannot publish a tip to an inactive product.");
  return prisma.tipPublication.upsert({
    where: { tipId_productId: { tipId, productId } },
    update: { status: "PUBLISHED", publishedAt: new Date(), unpublishedAt: null },
    create: { tipId, productId, status: "PUBLISHED", publishedAt: new Date() },
    include: { product: { select: PRODUCT_SELECT } },
  });
};

// Mark a tip publication as unpublished
const removeTipPublication = async (tipId, productId, actorId) => {
  assertObjectId(tipId, "tip ID");
  assertObjectId(productId, "product ID");
  await requireActiveAdmin(actorId);
  const publication = await prisma.tipPublication.findUnique({ where: { tipId_productId: { tipId, productId } } });
  if (!publication) throw createError("Tip publication not found.", 404);
  return prisma.tipPublication.update({
    where: { id: publication.id },
    data: { status: "UNPUBLISHED", unpublishedAt: new Date() },
    include: { product: { select: PRODUCT_SELECT } },
  });
};

// Generate a random raw access token
const generateRawAccessToken = () => crypto.randomBytes(32).toString("hex");

// Hash an access token for storage
const hashAccessToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

// Get the display prefix of an access token
const getTokenPrefix = (token) => token.slice(0, 10);

// Shape an access token for the response
const formatAccessToken = (accessToken) => ({
  id: accessToken.id,
  tokenPrefix: accessToken.tokenPrefix,
  productId: accessToken.productId,
  assignedUserId: accessToken.assignedUserId,
  status: accessToken.status,
  expiresAt: accessToken.expiresAt,
  usedAt: accessToken.usedAt,
  notes: accessToken.notes,
  createdAt: accessToken.createdAt,
  product: accessToken.product,
  assignedUser: accessToken.assignedUser,
});

// Parse an optional expiry date
const parseExpiry = (expiresAt) => {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) throw createError("Invalid expiration date.");
  return date;
};

// Clamp a requested token lifetime to the supported 1–365 day window so a
// caller can never mint a token that expires in decades.
const clampTokenDays = (days) => {
  const numberOfDays = Number.parseInt(days, 10);
  if (!Number.isInteger(numberOfDays)) {
    throw createError(`Days must be a whole number between ${MIN_TOKEN_DAYS} and ${MAX_TOKEN_DAYS}.`, 400);
  }
  if (numberOfDays < MIN_TOKEN_DAYS || numberOfDays > MAX_TOKEN_DAYS) {
    throw createError(`Days must be between ${MIN_TOKEN_DAYS} and ${MAX_TOKEN_DAYS}.`, 400);
  }
  return numberOfDays;
};

// Add days to a base date
const addTokenDays = (baseDate, numberOfDays) => {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + numberOfDays);
  return next;
};

// Resolve and clamp the expiry supplied when a token is created. A lifetime is
// accepted only inside the 1–365 day window.
const resolveTokenExpiry = (expiresAt) => {
  const parsed = parseExpiry(expiresAt);
  if (!parsed) return null;
  const now = new Date();
  const days = (parsed.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
  if (days < MIN_TOKEN_DAYS || days > MAX_TOKEN_DAYS) {
    throw createError(`Token expiry must be between ${MIN_TOKEN_DAYS} and ${MAX_TOKEN_DAYS} days from now.`, 400);
  }
  return parsed;
};

const isExpiredToken = (accessToken) => Boolean(accessToken.expiresAt && accessToken.expiresAt <= new Date());

// Resolve the registered user an access token is being issued to. Tokens are
// only ever minted by an admin for a specific, active, registered account so
// that every token has exactly one owner and access cannot be transferred.
const resolveAssignedUser = async (assignedUserId) => {
  if (!assignedUserId || typeof assignedUserId !== "string" || !assignedUserId.trim()) {
    throw createError("A registered user must be selected for this token.", 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: assignedUserId.trim() },
    select: { id: true, status: true },
  });

  if (!user) throw createError("The selected user does not exist.", 404);
  if (user.status !== "ACTIVE") {
    throw createError("Tokens can only be issued to an active user.", 400);
  }

  return user.id;
};

// Create a single access token for an active product and a registered user.
// The raw token is returned exactly once so the admin can pass it on.
const createAccessToken = async (tokenData = {}, actorId) => {
  await requireActiveAdmin(actorId);
  const { productId, expiresAt, notes, assignedUserId } = tokenData;
  assertObjectId(productId, "product ID");
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, status: true } });
  if (!product) throw createError("Product not found.", 404);
  if (product.status !== "ACTIVE") throw createError("Cannot create a token for an inactive product.");

  const ownerId = await resolveAssignedUser(assignedUserId);

  const rawToken = generateRawAccessToken();
  const tokenHash = hashAccessToken(rawToken);
  const accessToken = await prisma.accessToken.create({
    data: { tokenHash, tokenPrefix: getTokenPrefix(rawToken), productId, assignedUserId: ownerId, expiresAt: resolveTokenExpiry(expiresAt), notes: notes ?? null },
    select: ACCESS_TOKEN_SELECT,
  });
  return { token: rawToken, accessToken: formatAccessToken(accessToken) };
};

// Create many access tokens for an active product, all assigned to the same
// registered user.
const createAccessTokensBulk = async (tokenData = {}, actorId) => {
  await requireActiveAdmin(actorId);
  const { productId, count, expiresAt, notes, assignedUserId } = tokenData;
  const tokenCount = Number.parseInt(count, 10);
  assertObjectId(productId, "product ID");
  if (!Number.isInteger(tokenCount) || tokenCount < 1 || tokenCount > MAX_BULK_TOKEN_COUNT) {
    throw createError(`Token count must be between 1 and ${MAX_BULK_TOKEN_COUNT}.`);
  }
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, status: true } });
  if (!product) throw createError("Product not found.", 404);
  if (product.status !== "ACTIVE") throw createError("Cannot create tokens for an inactive product.");

  const ownerId = await resolveAssignedUser(assignedUserId);

  const parsedExpiry = resolveTokenExpiry(expiresAt);
  const tokens = [];
  for (let i = 0; i < tokenCount; i++) {
    const rawToken = generateRawAccessToken();
    tokens.push({ rawToken, tokenHash: hashAccessToken(rawToken), tokenPrefix: getTokenPrefix(rawToken) });
  }
  await prisma.accessToken.createMany({
    data: tokens.map((t) => ({ tokenHash: t.tokenHash, tokenPrefix: t.tokenPrefix, productId, assignedUserId: ownerId, expiresAt: parsedExpiry, notes: notes ?? null })),
  });
  return { count: tokens.length, tokens: tokens.map((t) => t.rawToken) };
};

// List access tokens with filters and pagination
const getAccessTokens = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const where = {};
  if (query.productId) where.productId = query.productId;
  if (query.status) where.status = query.status;
  if (query.assignedUserId) where.assignedUserId = query.assignedUserId;
  const [accessTokens, total] = await prisma.$transaction([
    prisma.accessToken.findMany({ where, select: ACCESS_TOKEN_SELECT, orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.accessToken.count({ where }),
  ]);
  return { accessTokens: accessTokens.map(formatAccessToken), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

// Get a single access token by id
const getAccessTokenById = async (accessTokenId) => {
  assertObjectId(accessTokenId, "access token ID");
  const accessToken = await prisma.accessToken.findUnique({ where: { id: accessTokenId }, select: ACCESS_TOKEN_SELECT });
  if (!accessToken) throw createError("Access token not found.", 404);
  return formatAccessToken(accessToken);
};

// Update allowed access token fields. The assigned user is deliberately not
// reassignable here: a token always belongs to the user it was issued to, so
// ownership can only be fixed at creation time.
const updateAccessToken = async (accessTokenId, tokenData = {}, actorId) => {
  assertObjectId(accessTokenId, "access token ID");
  await requireActiveAdmin(actorId);
  if (tokenData.assignedUserId !== undefined) {
    throw createError("An access token cannot be reassigned to a different user.", 400);
  }

  const allowedFields = ["notes", "status", "expiresAt"];
  if (tokenData.status !== undefined && !["ACTIVE", "REVOKED", "EXPIRED"].includes(tokenData.status)) {
    throw createError("Invalid access token status.", 400);
  }
  const data = {};
  for (const field of allowedFields) {
    if (tokenData[field] !== undefined) data[field] = field === "expiresAt" ? parseExpiry(tokenData[field]) : tokenData[field];
  }
  if (Object.keys(data).length === 0) throw createError("No access token fields provided for update.");

  const existing = await prisma.accessToken.findUnique({
    where: { id: accessTokenId },
    select: { id: true, status: true, expiresAt: true, usedAt: true },
  });
  if (!existing) throw createError("Access token not found.", 404);

  // A revoked or already-used token is final: it may be annotated or deleted,
  // but never re-activated, extended, or given a new expiry.
  const isFinal = existing.status === "REVOKED" || Boolean(existing.usedAt);
  if (isFinal) {
    if (data.status !== undefined && data.status !== existing.status) {
      throw createError("A revoked or used access token cannot be reactivated.", 409);
    }
    if (data.expiresAt !== undefined) {
      throw createError("A revoked or used access token cannot be extended.", 409);
    }
    delete data.status;
  }
  if (data.expiresAt !== undefined) {
    if (existing.expiresAt && existing.expiresAt <= new Date() && existing.status !== "ACTIVE") {
      throw createError("An expired or inactive access token cannot be extended.", 409);
    }
  }

  const accessToken = await prisma.accessToken.update({ where: { id: accessTokenId }, data, select: ACCESS_TOKEN_SELECT });
  return formatAccessToken(accessToken);
};

// Revoke an access token
const revokeAccessToken = async (accessTokenId, actorId) => {
  assertObjectId(accessTokenId, "access token ID");
  await requireActiveAdmin(actorId);
  const accessToken = await prisma.accessToken.update({ where: { id: accessTokenId }, data: { status: "REVOKED" }, select: ACCESS_TOKEN_SELECT });
  return formatAccessToken(accessToken);
};

// Permanently delete an access token. This is distinct from revocation, which
// preserves the token record for audit/history purposes.
const deleteAccessToken = async (accessTokenId, actorId) => {
  assertObjectId(accessTokenId, "access token ID");
  await requireActiveAdmin(actorId);
  const existing = await prisma.accessToken.findUnique({ where: { id: accessTokenId }, select: { id: true } });
  if (!existing) throw createError("Access token not found.", 404);
  await prisma.accessToken.delete({ where: { id: accessTokenId } });
  return { message: "Access token deleted successfully.", id: accessTokenId };
};

// Extend an access token from its current expiry or from now. The extension is
// clamped to 1–365 days and a revoked or expired token is never revived.
const extendAccessToken = async (accessTokenId, days, actorId) => {
  assertObjectId(accessTokenId, "access token ID");
  await requireActiveAdmin(actorId);
  const numberOfDays = clampTokenDays(days);
  const accessToken = await prisma.accessToken.findUnique({ where: { id: accessTokenId }, select: { id: true, status: true, expiresAt: true } });
  if (!accessToken) throw createError("Access token not found.", 404);
  if (accessToken.status === "REVOKED") throw createError("Cannot extend a revoked access token.", 409);
  if (accessToken.status === "EXPIRED" || isExpiredToken(accessToken)) {
    throw createError("Cannot extend an expired access token. Issue a new one.", 409);
  }
  const now = new Date();
  const baseDate = accessToken.expiresAt && accessToken.expiresAt > now ? accessToken.expiresAt : now;
  const newExpiry = addTokenDays(baseDate, numberOfDays);
  const updated = await prisma.accessToken.update({
    where: { id: accessTokenId },
    data: { expiresAt: newExpiry, status: "ACTIVE" },
    select: ACCESS_TOKEN_SELECT,
  });
  return formatAccessToken(updated);
};

// Create a product after checking required fields
const createProduct = async (productData = {}, actorId) => {
  await requireActiveAdmin(actorId);
  const { name, slug, description, type, status, isPublic } = productData;
  if (!name || !slug || !type) throw createError("Name, slug, and type are required.");
  return prisma.product.create({
    data: { name, slug, description: description ?? null, type, status: status ?? "ACTIVE", isPublic: isPublic ?? false },
    select: PRODUCT_SELECT,
  });
};

// List products with filters
const getProducts = async (query = {}) => {
  const where = {};
  if (query.type) where.type = query.type;
  if (query.status) where.status = query.status;
  return prisma.product.findMany({ where, select: PRODUCT_SELECT, orderBy: { createdAt: "desc" } });
};

// Get a single product with token and publication counts
const getProductById = async (productId) => {
  assertObjectId(productId, "product ID");
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { ...PRODUCT_SELECT, _count: { select: { accessTokens: true, publications: true } } },
  });
  if (!product) throw createError("Product not found.", 404);
  return product;
};

// Update allowed product fields
const updateProduct = async (productId, productData = {}, actorId) => {
  assertObjectId(productId, "product ID");
  await requireActiveAdmin(actorId);
  const allowedFields = ["name", "slug", "description", "type", "status", "isPublic"];
  const data = {};
  for (const field of allowedFields) {
    if (productData[field] !== undefined) data[field] = productData[field];
  }
  if (Object.keys(data).length === 0) throw createError("No product fields provided for update.");
  return prisma.product.update({ where: { id: productId }, data, select: PRODUCT_SELECT });
};

// Update a product's status after validating it
const updateProductStatus = async (productId, status, actorId) => {
  assertObjectId(productId, "product ID");
  await requireActiveAdmin(actorId);
  const validStatuses = ["ACTIVE", "INACTIVE", "ARCHIVED"];
  if (!validStatuses.includes(status)) throw createError("Invalid product status.");
  return prisma.product.update({ where: { id: productId }, data: { status }, select: PRODUCT_SELECT });
};

module.exports = {
  getUsers,
  getUserById,
  updateUser,
  updateUserStatus,
  deleteUser,
  createTip,
  getTips,
  getTipById,
  updateTip,
  deleteTip,
  updateTipsBulk,
  publishTipsBulk,
  unpublishTipsBulk,
  settleTipsBulk,
  cancelTipsBulk,
  publishTip,
  unpublishTip,
  settleTip,
  cancelTip,
  publishTipToProduct,
  removeTipPublication,
  createAccessToken,
  createAccessTokensBulk,
  getAccessTokens,
  getAccessTokenById,
  updateAccessToken,
  revokeAccessToken,
  deleteAccessToken,
  extendAccessToken,
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  updateProductStatus,
};
