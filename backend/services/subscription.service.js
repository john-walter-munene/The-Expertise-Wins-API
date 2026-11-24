const crypto = require("crypto");

const prisma = require("../lib/prisma");

// Select product summary fields returned with a subscription
const PRODUCT_SUMMARY_SELECT = {
  id: true,
  name: true,
  slug: true,
  type: true,
};

// Create an error with an HTTP status the error handler can read
const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.status = statusCode;
  error.statusCode = statusCode;
  return error;
};

// Bound every customer-initiated token extension to one year
const MIN_RENEWAL_DAYS = 1;
const MAX_RENEWAL_DAYS = 365;

// Identifier format used by Prisma cuid() primary keys
const OBJECT_ID_PATTERN = /^c[0-9a-z]{6,40}$/;

// Validate the token id from the path before it reaches Prisma
const assertAccessTokenId = (value) => {
  if (typeof value !== "string" || !OBJECT_ID_PATTERN.test(value)) {
    throw createError("Invalid access ID format.", 400);
  }
  return value;
};

// Hash an access token for lookup
const hashAccessToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

// Build a filter for a user's active, unexpired tokens
const getActiveTokenWhere = (userId) => {
  return {
    assignedUserId: userId,
    status: "ACTIVE",
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
};

// Shape an access token as a subscription for the response
const formatSubscription = (accessToken) => {
  if (!accessToken) return null;

  return {
    id: accessToken.id,
    product: accessToken.product,
    status: accessToken.status,
    expiresAt: accessToken.expiresAt,
    usedAt: accessToken.usedAt,
    createdAt: accessToken.createdAt,
    notes: accessToken.notes,
  };
};

// List all subscriptions for a user, newest first
const getMySubscriptions = async (userId) => {
  const accessTokens = await prisma.accessToken.findMany({
    where: { assignedUserId: userId },
    orderBy: { createdAt: "desc" },
    include: { product: { select: PRODUCT_SUMMARY_SELECT } },
  });

  return accessTokens.map(formatSubscription);
};

// Get the user's active subscription that expires soonest
const getActiveSubscription = async (userId) => {
  const accessToken = await prisma.accessToken.findFirst({
    where: getActiveTokenWhere(userId),
    orderBy: { expiresAt: "asc" },
    include: { product: { select: PRODUCT_SUMMARY_SELECT } },
  });

  return formatSubscription(accessToken);
};

// List the user's subscription history, newest first
const getSubscriptionHistory = async (userId) => {
  const accessTokens = await prisma.accessToken.findMany({
    where: { assignedUserId: userId },
    orderBy: { createdAt: "desc" },
    include: { product: { select: PRODUCT_SUMMARY_SELECT } },
  });

  return accessTokens.map(formatSubscription);
};

// Redeem an access token, linking it to the user when logged in
const redeemAccessToken = async (userId, token) => {
  if (!token || typeof token !== "string") throw createError("Access token is required.", 400);
  if (!userId) {
    throw createError("Sign in with your registered account before redeeming an access token.", 401);
  }

  const tokenHash = hashAccessToken(token);

  const accessToken = await prisma.accessToken.findUnique({
    where: { tokenHash },
    include: { product: { select: PRODUCT_SUMMARY_SELECT } },
  });

  if (!accessToken) throw createError("Invalid access token.", 404);

  if (accessToken.status !== "ACTIVE") {
    throw createError("This access token is no longer available.", 400);
  }

  // Every token is issued to one registered account, so it can only be
  // redeemed by that account.
  if (!accessToken.assignedUserId) {
    throw createError("This access token is not assigned to a registered user.", 400);
  }

  if (accessToken.assignedUserId !== userId) {
    throw createError("This access token was issued to another registered user.", 403);
  }

  // Reject expired tokens before any success response
  if (accessToken.expiresAt && accessToken.expiresAt <= new Date()) {
    throw createError("This access token has expired.", 400);
  }

  const updatedToken = await prisma.accessToken.update({
    where: { id: accessToken.id },
    data: { usedAt: new Date() },
    include: { product: { select: PRODUCT_SUMMARY_SELECT } },
  });

  return {
    accessToken: {
      id: updatedToken.id,
      product: updatedToken.product,
      status: updatedToken.status,
      expiresAt: updatedToken.expiresAt,
      usedAt: updatedToken.usedAt,
    },
  };
};

// Check whether a raw token grants active access to a product
const getAccessByToken = async (token, productSlug) => {
  if (!token) return false;

  const accessToken = await prisma.accessToken.findUnique({
    where: { tokenHash: hashAccessToken(token) },
    select: {
      productId: true,
      status: true,
      expiresAt: true,
      product: { select: { slug: true } },
    },
  });

  return Boolean(
    accessToken &&
      accessToken.status === "ACTIVE" &&
      accessToken.product.slug === productSlug &&
      (!accessToken.expiresAt || accessToken.expiresAt > new Date())
  );
};

// Report whether an access token is valid and available to redeem
const verifyAccessToken = async (token) => {
  if (!token || typeof token !== "string") throw createError("Access token is required.", 400);

  const tokenHash = hashAccessToken(token);

  const accessToken = await prisma.accessToken.findUnique({
    where: { tokenHash },
    include: { product: { select: PRODUCT_SUMMARY_SELECT } },
  });

  if (!accessToken) throw createError("Invalid access token.", 404);

  const expired = accessToken.expiresAt && accessToken.expiresAt <= new Date();

  return {
    valid: accessToken.status === "ACTIVE" && !accessToken.assignedUserId && !expired,
    product: accessToken.product,
    status: accessToken.status,
    assigned: Boolean(accessToken.assignedUserId),
    expiresAt: accessToken.expiresAt,
  };
};

// List active products that are public or unlocked by the user's valid tokens
const getMyAccess = async (userId) => {
  const now = new Date();

  const products = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { isPublic: true },
        {
          accessTokens: {
            some: {
              assignedUserId: userId,
              status: "ACTIVE",
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      description: true,
      isPublic: true,
    },
  });

  return products;
};

// Cancel a user's active subscription by revoking its token
const cancelSubscription = async (userId, accessTokenId) => {
  assertAccessTokenId(accessTokenId);
  const accessToken = await prisma.accessToken.findFirst({
    where: { id: accessTokenId, assignedUserId: userId },
  });

  if (!accessToken) throw createError("Access not found.", 404);

  if (accessToken.status !== "ACTIVE") throw createError("This access is no longer active.", 400);

  await prisma.accessToken.update({
    where: { id: accessToken.id },
    data: { status: "REVOKED" },
  });

  return { message: "Access cancelled successfully." };
};

// Extend a user's active subscription by a number of days. Days are clamped to
// 1–365, and a revoked, used or already-expired token is never revived: the
// account must be issued a new token instead.
const renewSubscription = async (userId, accessTokenId, renewalData = {}) => {
  assertAccessTokenId(accessTokenId);
  const accessToken = await prisma.accessToken.findFirst({
    where: { id: accessTokenId, assignedUserId: userId },
    include: { product: { select: PRODUCT_SUMMARY_SELECT } },
  });

  if (!accessToken) throw createError("Access not found.", 404);

  if (accessToken.status !== "ACTIVE") throw createError("This access cannot be renewed.", 400);

  const days = Number.parseInt(renewalData.days, 10);

  if (!Number.isInteger(days) || days < MIN_RENEWAL_DAYS || days > MAX_RENEWAL_DAYS) {
    throw createError(`Renewal days must be between ${MIN_RENEWAL_DAYS} and ${MAX_RENEWAL_DAYS}.`, 400);
  }

  // Extend from the current expiry if still valid, otherwise from now
  const now = new Date();
  if (accessToken.expiresAt && accessToken.expiresAt <= now) {
    throw createError("This access has expired and cannot be renewed. Issue a new token.", 409);
  }
  const currentExpiry = accessToken.expiresAt && accessToken.expiresAt > now ? accessToken.expiresAt : now;
  const newExpiry = new Date(currentExpiry);
  newExpiry.setDate(newExpiry.getDate() + days);

  const updatedToken = await prisma.accessToken.update({
    where: { id: accessToken.id },
    data: { expiresAt: newExpiry },
    include: { product: { select: PRODUCT_SUMMARY_SELECT } },
  });

  return {
    message: "Access renewed successfully.",
    access: {
      id: updatedToken.id,
      product: updatedToken.product,
      status: updatedToken.status,
      expiresAt: updatedToken.expiresAt,
    },
  };
};

// Get one of the user's subscriptions
const getSubscriptionById = async (userId, accessTokenId) => {
  assertAccessTokenId(accessTokenId);
  const accessToken = await prisma.accessToken.findFirst({
    where: { id: accessTokenId, assignedUserId: userId },
    include: { product: { select: PRODUCT_SUMMARY_SELECT } },
  });

  if (!accessToken) throw createError("Access not found.", 404);

  return formatSubscription(accessToken);
};

module.exports = {
  getMySubscriptions,
  getActiveSubscription,
  getSubscriptionHistory,
  redeemAccessToken,
  verifyAccessToken,
  getAccessByToken,
  getMyAccess,
  cancelSubscription,
  renewSubscription,
  getSubscriptionById,
};