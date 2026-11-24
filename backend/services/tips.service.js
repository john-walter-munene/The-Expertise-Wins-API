const prisma = require("../lib/prisma");

// List keys removed from tips before they reach the client
const sourceMetadataKeys = new Set([
  "source",
  "externalid",
  "detailsurl",
  "url",
  "beturl",
  "bookmaker",
  "sourcename",
  "sourceurl",
  "provider",
  "providername",
  "affiliateurl",
]);

// List outcomes that mark a tip as settled
const settledOutcomes = ["WON", "LOST", "VOID", "PUSH", "HALF_WON", "HALF_LOST", "CANCELLED"];

// List outcomes accepted by the archive filter
const archiveOutcomes = ["PENDING", "WON", "LOST", "VOID", "PUSH", "HALF_WON", "HALF_LOST"];

// List archive tiers that can be requested
const archiveTiers = ["free", "vip", "maxbet"];

// Identifier format used by Prisma cuid() primary keys
const OBJECT_ID_PATTERN = /^c[0-9a-z]{6,40}$/;

// Largest bulk operation accepted in one request
const MAX_BULK_IDS = 100;

// The business timezone for day bucketing is Africa/Nairobi, a fixed UTC+3 with
// no daylight saving. All published "days" are Kenyan calendar days, so a day key
// such as 2026-10-05 covers the UTC window 2026-10-04T21:00:00Z through
// 2026-10-05T20:59:59.999Z.
const BUSINESS_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

// Create an error with an HTTP status the error handler can read
const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.status = statusCode;
  error.statusCode = statusCode;
  return error;
};

// Get the current business day in YYYY-MM-DD format using the business timezone
const getTodayKey = () =>
  new Date(Date.now() + BUSINESS_UTC_OFFSET_MS).toISOString().slice(0, 10);

// Shift a YYYY-MM-DD day key by a number of calendar days
const shiftDayKey = (dayKey, offsetDays) => {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

// Get yesterday's day key in the business timezone
const getPreviousDayKey = () => shiftDayKey(getTodayKey(), -1);

// Parse page and limit from the query string
const getPagination = (query = {}) => {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);

  return { page, limit, skip: (page - 1) * limit };
};

// Build the pagination object returned with list results
const buildPagination = (page, limit, total) => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit),
});

// Remove source metadata keys and URLs from a value recursively
const stripSourceMetadata = (value) => {
  if (Array.isArray(value)) return value.map(stripSourceMetadata);
  if (typeof value === "string") return value.replace(/https?:\/\/\S+/gi, "").trim();
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date || value.constructor?.name === "Decimal") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !sourceMetadataKeys.has(key.toLowerCase()))
      .map(([key, nestedValue]) => [key, stripSourceMetadata(nestedValue)])
  );
};

// Shape a tip for the client and convert Decimal fields to numbers
const formatTip = (tip) => {
  if (!tip) return null;

  return {
    ...stripSourceMetadata(tip),
    odds: tip.odds ? Number(tip.odds) : null,
    stakeUnits: tip.stakeUnits ? Number(tip.stakeUnits) : null,
    confidenceIndex: tip.confidenceIndex ? Number(tip.confidenceIndex) : null,
  };
};

// Validate a YYYY-MM-DD day key
const assertDayKey = (value, label = "Date") => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw createError(`${label}s must use YYYY-MM-DD format.`, 400);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw createError("Invalid date.", 400);
  }

  return value;
};

// Build the UTC start and end instants for a business day key
const getBusinessDayRange = (dayKey) => {
  const start = Date.parse(`${dayKey}T00:00:00.000Z`);
  const end = Date.parse(`${dayKey}T23:59:59.999Z`);

  return {
    gte: new Date(start - BUSINESS_UTC_OFFSET_MS),
    lte: new Date(end - BUSINESS_UTC_OFFSET_MS),
  };
};

// Tips belong to the day they were scraped. Older manually-created records
// without a scrape timestamp fall back to publication time, then creation.
const buildTipDayFilter = (range) => ({
  OR: [
    { scrapedAt: range },
    { scrapedAt: null, publishedAt: range },
    { scrapedAt: null, publishedAt: null, createdAt: range },
  ],
});

// Reject any day key that is today or in the future. Used by the archive so
// today's active tips can never appear in the historical view.
const assertHistoricalDay = (dayKey) => {
  assertDayKey(dayKey, "Archive date");

  if (dayKey >= getTodayKey()) {
    throw createError("Today's and future tips are not available in the archive.", 400);
  }

  return dayKey;
};

// Use the same scrape-day bucketing for historical and live selections.
const buildPublishedDayFilter = buildTipDayFilter;

// Add optional sport and outcome filters from the query
const addTipFilters = (where, query) => {
  if (query.sport) where.sport = query.sport;
  if (query.outcome) where.outcome = query.outcome.toUpperCase();
};

// Live tip lists are pinned to today's business date. Historical selections
// are available through the archive endpoint only.
const addLiveDayFilter = (where, query) => {
  const day = query.day ? assertDayKey(query.day, "Day") : getTodayKey();

  const today = getTodayKey();
  if (day !== today) {
    throw createError("Live tips are only available for the current day. Use the archive for previous days.", 400);
  }

  where.AND = [buildTipDayFilter(getBusinessDayRange(day))];

  return day;
};

const getKickoffSortValue = (value) => {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match) return Number(match[1]) * 60 + Number(match[2]);

  const duration = raw.match(/^(?:(\d+)\s*h(?:ours?)?\s*)?(?:(\d+)\s*m(?:in(?:utes?))?)?$/i);
  if (!duration || (!duration[1] && !duration[2])) return Number.MAX_SAFE_INTEGER;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const nowMinutes = Number(parts.find((part) => part.type === "hour")?.value || 0) * 60 +
    Number(parts.find((part) => part.type === "minute")?.value || 0);
  return (nowMinutes + Number(duration[1] || 0) * 60 + Number(duration[2] || 0)) % 1440;
};

const getPremiumSportRank = (sport) => {
  const value = String(sport ?? "").trim().toUpperCase();
  if (value === "TENNIS") return 0;
  if (value === "BASKETBALL") return 1;
  return 2;
};

const sortPremiumTips = (tips, productSlug) => {
  if (productSlug === "free") return tips;
  return tips.sort((a, b) =>
    getPremiumSportRank(a.sport) - getPremiumSportRank(b.sport) ||
    getKickoffSortValue(a.kickoff) - getKickoffSortValue(b.kickoff) ||
    String(a.homeTeam ?? "").localeCompare(String(b.homeTeam ?? ""))
  );
};

// Fetch a page of tips and the total count for a filter. `day` reports the day
// actually served so a client can label the result when it defaulted.
const findTipPage = async (where, query, day = null, productSlug = null) => {
  const { page, limit, skip } = getPagination(query);
  const orderBy = [{ publishedAt: "desc" }, { kickoff: "asc" }];

  const [tips, total] = await Promise.all([
    prisma.tip.findMany({ where, skip, take: limit, orderBy }),
    prisma.tip.count({ where }),
  ]);

  return {
    data: sortPremiumTips(tips, productSlug).map(formatTip),
    pagination: buildPagination(page, limit, total),
    day,
  };
};

// List today's selections published to any active public product
const getTips = async (query = {}) => {
  const where = {
    status: { not: "CANCELLED" },
    publications: {
      some: {
        status: "PUBLISHED",
        product: { status: "ACTIVE", isPublic: true },
      },
    },
  };

  addTipFilters(where, query);
  const day = addLiveDayFilter(where, query);

  return findTipPage(where, query, day);
};

// List today's Free product selections
const getFreeTips = async (query = {}) => {
  const freeProduct = await prisma.product.findUnique({ where: { slug: "free" } });

  if (!freeProduct) throw createError("Free product not found.", 404);

  const where = {
    status: { not: "CANCELLED" },
    publications: {
      some: { productId: freeProduct.id, status: "PUBLISHED" },
    },
  };

  addTipFilters(where, query);
  const day = addLiveDayFilter(where, query);

  return findTipPage(where, query, day, "free");
};

// Check that a user can view a product, allowing public products and admins
const hasProductAccess = async (userId, productSlug, isAdmin = false) => {
  const product = await prisma.product.findUnique({
    where: { slug: productSlug },
    select: { id: true, isPublic: true },
  });

  if (!product) throw createError("Product not found.", 404);

  if (product.isPublic || isAdmin) return product;

  const accessToken = await prisma.accessToken.findFirst({
    where: {
      productId: product.id,
      assignedUserId: userId,
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });

  if (!accessToken) throw createError("You do not have access to this product.", 403);

  return product;
};

// List today's paid-product selections after checking access
const getProtectedTips = async (userId, productSlug, query = {}, isAdmin = false) => {
  const product = await hasProductAccess(userId, productSlug, isAdmin);
  const visibleProductIds = [product.id];

  const where = {
    status: { not: "CANCELLED" },
    publications: {
      some: { productId: { in: visibleProductIds }, status: "PUBLISHED" },
    },
  };

  addTipFilters(where, query);
  const day = addLiveDayFilter(where, query);

  return findTipPage(where, query, day, productSlug);
};

// List VIP tips after checking access
const getVipTips = async (userId, query, isAdmin = false) => {
  return getProtectedTips(userId, "vip", query, isAdmin);
};

// List MaxBet tips after checking access
const getMaxbetTips = async (userId, query, isAdmin = false) => {
  return getProtectedTips(userId, "maxbet", query, isAdmin);
};

// Get the most recent day that has published tips for administrative reporting.
// Public live lists must never use this as a fallback: they are pinned to today.
const getLatestPublishedDay = async () => {
  const latest = await prisma.tip.findFirst({
    where: { status: { not: "CANCELLED" } },
    orderBy: { scrapedAt: "desc" },
    select: { scrapedAt: true },
  });

  if (!latest?.scrapedAt) return null;
  return new Date(latest.scrapedAt).toISOString().slice(0, 10);
};

// List products a visitor can see on individual tip details, matching live access.
const getVisibleProducts = async (userId, isAdmin = false) => {
  const where = { status: "ACTIVE" };

  if (isAdmin) {
    return prisma.product.findMany({ where, select: { id: true, slug: true, name: true } });
  }

  const visibleProductConditions = [{ isPublic: true }];
  if (userId) {
    visibleProductConditions.push({
      accessTokens: {
        some: {
          assignedUserId: userId,
          status: "ACTIVE",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      },
    });
  }

  return prisma.product.findMany({
    where: { ...where, OR: visibleProductConditions },
    select: { id: true, slug: true, name: true },
  });
};

// Archived results are part of the public performance record, regardless of
// whether the visitor has purchased access to the live product.
const getArchiveProducts = async () => prisma.product.findMany({
  where: { status: "ACTIVE" },
  select: { id: true, slug: true, name: true },
});

// List archived tips with tier, sport, outcome, search and date filters
const getArchive = async (query, userId, isAdmin = false) => {
  const archiveProducts = await getArchiveProducts();
  const visibleTiers = archiveProducts.map(({ slug, name }) => ({ slug, name }));

  // Validate the requested tier
  const requestedTier = String(query.tier || "").toLowerCase();
  if (requestedTier && !archiveTiers.includes(requestedTier)) {
    throw createError("Unsupported archive tier.", 400);
  }
  if (requestedTier && !archiveProducts.some((product) => product.slug === requestedTier)) {
    throw createError("Archive tier not found.", 404);
  }

  const selectedProducts = requestedTier
    ? archiveProducts.filter((product) => product.slug === requestedTier)
    : archiveProducts;
  const visibleProductIds = selectedProducts.map((product) => product.id);

  if (visibleProductIds.length === 0) {
    return {
      data: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 0 },
      sports: [],
      tierSports: {},
      tiers: visibleTiers,
      day: query.day || null,
      latestDay: getPreviousDayKey(),
      today: getTodayKey(),
    };
  }

  const { page, limit, skip } = getPagination(query);

  const where = {
    status: { not: "CANCELLED" },
    publications: {
      some: { productId: { in: visibleProductIds }, status: "PUBLISHED" },
    },
  };

  if (query.sport) where.sport = query.sport;

  // Validate and apply the outcome filter
  if (query.outcome) {
    if (!archiveOutcomes.includes(query.outcome.toUpperCase())) {
      throw createError("Unsupported archive outcome.", 400);
    }
    where.outcome = query.outcome.toUpperCase();
  }

  // Search team, competition, league and selection fields
  if (query.search?.trim()) {
    const term = query.search.trim();
    where.OR = ["homeTeam", "awayTeam", "competition", "league", "selection"].map((field) => ({
      [field]: { contains: term, mode: "insensitive" },
    }));
  }

  // The archive is strictly historical. Every path is capped at the end of the
  // previous day so today and future records can never be returned, and a
  // single day is used when given or defaulted, otherwise the from/to range.
  const today = getTodayKey();
  const previousDay = getPreviousDayKey();
  const lastHistoricalRange = getBusinessDayRange(previousDay);

  const day = query.day ? assertHistoricalDay(query.day) : null;
  const hasRange = !day && (query.from || query.to);

  let range = null;
  if (day) {
    range = getBusinessDayRange(day);
  } else if (hasRange) {
    const fromDay = query.from ? assertHistoricalDay(query.from) : null;
    const toDay = query.to ? assertHistoricalDay(query.to) : null;

    range = {
      gte: fromDay ? getBusinessDayRange(fromDay).gte : new Date(0),
      // An open ended range still stops at the last historical day.
      lte: toDay ? getBusinessDayRange(toDay).lte : lastHistoricalRange.lte,
    };
  } else if (!query.day && !query.from && !query.to) {
    range = lastHistoricalRange;
  }

  const resolvedDay = day || (!hasRange ? previousDay : null);

  if (range) {
    where.AND = [buildPublishedDayFilter(range)];
  }

  const sportsScope = {
    status: { not: "CANCELLED" },
    publications: {
      some: { productId: { in: visibleProductIds }, status: "PUBLISHED" },
    },
    ...(range ? { AND: [buildPublishedDayFilter(range)] } : {}),
  };

  const [tips, total, sports] = await Promise.all([
    prisma.tip.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ scrapedAt: "desc" }, { createdAt: "desc" }],
      include: {
        publications: {
          where: { productId: { in: visibleProductIds }, status: "PUBLISHED" },
          select: { product: { select: { name: true, slug: true } } },
        },
      },
    }),
    prisma.tip.count({ where }),
    prisma.tip.groupBy({
      by: ["sport"],
      where: sportsScope,
      orderBy: { sport: "asc" },
    }),
  ]);

  // Collect the distinct sports available in each visible tier
  const tierSports = {};
  for (const product of archiveProducts) {
    const tierTips = await prisma.tip.findMany({
      where: {
        ...where,
        publications: { some: { productId: product.id, status: "PUBLISHED" } },
      },
      distinct: ["sport"],
      select: { sport: true },
      orderBy: { sport: "asc" },
    });
    tierSports[product.slug] = tierTips.map((tip) => tip.sport);
  }

  return {
    data: tips.map((tip) => {
      const tiers = [...new Set(tip.publications.map((publication) => publication.product.slug))];
      return formatTip({ ...tip, tier: tiers[0] || "free", tiers });
    }),
    pagination: buildPagination(page, limit, total),
    sports: sports.map((item) => item.sport),
    tierSports,
    tiers: visibleTiers,
    // Report the day actually served so a client can show and reuse it. The
    // archive always resolves to a historical day, defaulting to the previous
    // day, so today is never served.
    day: resolvedDay,
    // Report the newest day the archive will ever serve, so a client can bound
    // its date picker without recomputing the business timezone.
    latestDay: previousDay,
    today,
  };
};

// Get a tip if it is published to a product the user can see
const getTipById = async (tipId, userId, isAdmin = false) => {
  const tip = await prisma.tip.findUnique({
    where: { id: tipId },
    include: {
      publications: {
        where: { status: "PUBLISHED" },
        select: {
          product: { select: { id: true, name: true, slug: true, type: true } },
          publishedAt: true,
        },
      },
    },
  });

  if (!tip) throw createError("Tip not found.", 404);

  // Keep only publications for visible products
  const visibleProducts = await getVisibleProducts(userId, isAdmin);
  const visibleProductIds = new Set(visibleProducts.map((product) => product.id));
  const tipTimestamp = tip.scrapedAt || tip.publishedAt || tip.createdAt;
  const tipDay = tipTimestamp
    ? new Date(new Date(tipTimestamp).getTime() + BUSINESS_UTC_OFFSET_MS).toISOString().slice(0, 10)
    : getTodayKey();
  const isHistorical = tipDay < getTodayKey();
  const visiblePublications = tip.publications.filter((publication) =>
    isHistorical || visibleProductIds.has(publication.product.id)
  );

  if (visiblePublications.length === 0) throw createError("Tip not found.", 404);

  tip.publications = visiblePublications;
  return formatTip(tip);
};

// Create a tip owned by the user
const createTip = async (userId, tipData = {}) => {
  if (!userId) throw createError("An authenticated admin is required to create tips.", 401);
  const {
    source,
    externalId,
    sport,
    competition,
    league,
    country,
    homeTeam,
    awayTeam,
    kickoff,
    market,
    selection,
    odds,
    stakeUnits,
    previewTitle,
    preview,
    verdict,
    tips,
    analytics,
    confidenceIndex,
    predictedScore,
    detailsUrl,
    extraTips,
    status,
    outcome,
  } = tipData;

  if (status !== undefined && !["PENDING", "PUBLISHED", "LOCKED", "SETTLED", "CANCELLED", "VOID"].includes(status)) {
    throw createError("Invalid tip status.", 400);
  }
  if (outcome !== undefined && !["PENDING", "WON", "LOST", "VOID", "PUSH", "HALF_WON", "HALF_LOST", "CANCELLED"].includes(outcome)) {
    throw createError("Invalid tip outcome.", 400);
  }

  const tip = await prisma.tip.create({
    data: {
      source,
      externalId,
      sport,
      competition,
      league,
      country,
      homeTeam,
      awayTeam,
      kickoff,
      market,
      selection,
      odds,
      stakeUnits,
      previewTitle,
      preview,
      verdict,
      tips,
      analytics,
      confidenceIndex,
      predictedScore,
      detailsUrl,
      extraTips,
      status: status || "PENDING",
      outcome: outcome || "PENDING",
      createdById: userId,
    },
  });

  return formatTip(tip);
};

// Update a tip and keep publish and settle timestamps in step
const updateTip = async (tipId, userId, tipData = {}) => {
  if (!userId) throw createError("An authenticated admin is required to update tips.", 401);
  const existingTip = await prisma.tip.findUnique({ where: { id: tipId } });

  if (!existingTip) throw createError("Tip not found.", 404);

  const {
    source,
    externalId,
    sport,
    competition,
    league,
    country,
    homeTeam,
    awayTeam,
    kickoff,
    market,
    selection,
    odds,
    stakeUnits,
    previewTitle,
    preview,
    verdict,
    tips,
    analytics,
    confidenceIndex,
    predictedScore,
    detailsUrl,
    extraTips,
    status,
    outcome,
  } = tipData;

  if (status !== undefined && !["PENDING", "PUBLISHED", "LOCKED", "SETTLED", "CANCELLED", "VOID"].includes(status)) {
    throw createError("Invalid tip status.", 400);
  }
  if (outcome !== undefined && !["PENDING", "WON", "LOST", "VOID", "PUSH", "HALF_WON", "HALF_LOST", "CANCELLED"].includes(outcome)) {
    throw createError("Invalid tip outcome.", 400);
  }

  const tip = await prisma.tip.update({
    where: { id: tipId },
    data: {
      source,
      externalId,
      sport,
      competition,
      league,
      country,
      homeTeam,
      awayTeam,
      kickoff,
      market,
      selection,
      odds,
      stakeUnits,
      previewTitle,
      preview,
      verdict,
      tips,
      analytics,
      confidenceIndex,
      predictedScore,
      detailsUrl,
      extraTips,
      status,
      outcome,
      publishedAt: status === "PUBLISHED" ? existingTip.publishedAt || new Date() : existingTip.publishedAt,
      publishedById: status === "PUBLISHED" ? userId : existingTip.publishedById,
      settledAt: outcome && settledOutcomes.includes(outcome) ? new Date() : existingTip.settledAt,
    },
  });

  return formatTip(tip);
};

// Update a tip's result and settle it when the outcome is final
const updateTipResult = async (tipId, userId, resultData = {}) => {
  if (!userId) throw createError("An authenticated admin is required to settle tips.", 401);
  const { result, outcome } = resultData;
  if (!settledOutcomes.includes(outcome)) throw createError("Invalid tip outcome.", 400);

  const existingTip = await prisma.tip.findUnique({ where: { id: tipId } });

  if (!existingTip) throw createError("Tip not found.", 404);

  const isSettled = settledOutcomes.includes(outcome);

  // Keep the existing settle time when no outcome is sent
  const settledAt = outcome === undefined ? existingTip.settledAt : isSettled ? new Date() : null;

  const tip = await prisma.tip.update({
    where: { id: tipId },
    data: {
      result,
      outcome,
      status: isSettled ? "SETTLED" : existingTip.status,
      settledAt,
    },
  });

  return formatTip(tip);
};

// Soft delete a tip by marking it cancelled
const deleteTip = async (tipId, userId) => {
  if (!userId) throw createError("An authenticated admin is required to delete tips.", 401);
  const existingTip = await prisma.tip.findUnique({ where: { id: tipId } });

  if (!existingTip) throw createError("Tip not found.", 404);

  await prisma.tip.update({
    where: { id: tipId },
    data: { status: "CANCELLED", outcome: "CANCELLED", settledAt: new Date() },
  });

  return { message: "Tip cancelled successfully." };
};

const validateTipIds = (ids) => {
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== "string" || !id.trim())) {
    throw createError("At least one valid tip ID is required.", 400);
  }
  if (ids.length > MAX_BULK_IDS) {
    throw createError(`No more than ${MAX_BULK_IDS} tip IDs may be sent per request.`, 400);
  }
  const unique = [...new Set(ids)];
  for (const id of unique) {
    if (!OBJECT_ID_PATTERN.test(id)) throw createError("Invalid tip ID format.", 400);
  }
  return unique;
};

const resolvePublishedProductSlug = (tip) => {
  const labels = `${tip?.competition || ""} ${tip?.previewTitle || ""}`.toLowerCase();
  if (tip?.isFeatured || /bet of the day/.test(labels)) return "maxbet";
  if (["football", "soccer"].includes(String(tip?.sport || "").trim().toLowerCase())) return "free";
  return "vip";
};

module.exports = {
  getTips,
  getFreeTips,
  getVipTips,
  getMaxbetTips,
  getArchive,
  getTipById,
  createTip,
  updateTip,
  updateTipResult,
  deleteTip,
  validateTipIds,
  resolvePublishedProductSlug,
  getLatestPublishedDay,
};
