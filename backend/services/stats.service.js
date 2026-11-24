const prisma = require("../lib/prisma");

// List outcomes that count as settled
const settledOutcomes = ["WON", "LOST", "VOID", "PUSH", "HALF_WON", "HALF_LOST"];
const NAIROBI_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

// Create an error with an HTTP status the error handler can read
const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.status = statusCode;
  error.statusCode = statusCode;
  return error;
};

// Allowed statistics query filters. Services read only these keys, so a raw
// query object can never steer a where clause into an unexpected field.
const STATS_QUERY_KEYS = Object.freeze(["period", "product", "periodId", "productId"]);

const pickStatsQuery = (query = {}) => {
  const picked = { periodId: "all-time", productId: "ALL" };
  if (!query || typeof query !== "object") return picked;
  if (query.periodId !== undefined) picked.periodId = query.periodId;
  if (query.period !== undefined && query.periodId === undefined) picked.periodId = query.period;
  if (query.productId !== undefined) picked.productId = query.productId;
  if (query.product !== undefined && query.productId === undefined) picked.productId = query.product;
  return picked;
};

// Get midnight in Nairobi for today (offset 0) or another calendar day.
const getNairobiDayStart = (dayOffset = 0) => {
  const nairobiNow = new Date(Date.now() + NAIROBI_UTC_OFFSET_MS);
  const day = new Date(`${nairobiNow.toISOString().slice(0, 10)}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + dayOffset);
  return new Date(day.getTime() - NAIROBI_UTC_OFFSET_MS);
};

const getNairobiYearStart = () => {
  const nairobiNow = new Date(Date.now() + NAIROBI_UTC_OFFSET_MS);
  const start = new Date(Date.UTC(nairobiNow.getUTCFullYear(), 0, 1));
  return new Date(start.getTime() - NAIROBI_UTC_OFFSET_MS);
};

// Tips belong to the day they were scraped. Records without a scrape timestamp
// fall back to publication time, then creation. This mirrors the archive and
// admin services so every surface buckets a tip into the same day.
const buildTipDayFilter = (range) => ({
  OR: [
    { scrapedAt: range },
    { scrapedAt: null, publishedAt: range },
    { scrapedAt: null, publishedAt: null, createdAt: range },
  ],
});

// Normalise an outcome to the canonical set every stats surface counts on.
// Grouped panels, metric cards and reports all share this helper so a win is a
// win everywhere and a stale bulk-settlement parent outcome cannot slip through.
const normalizeOutcome = (outcome) => {
  const normalized = String(outcome || "PENDING").trim().toUpperCase();
  if (["WIN", "WON"].includes(normalized)) return "WON";
  if (["LOSE", "LOSS", "LOST"].includes(normalized)) return "LOST";
  if (["HALF WIN", "HALF-WIN", "HALF_WON"].includes(normalized)) return "HALF_WON";
  if (["HALF LOSS", "HALF-LOSS", "HALF_LOST"].includes(normalized)) return "HALF_LOST";
  if (["VOID", "PUSH", "CANCELLED", "CANCELED"].includes(normalized)) {
    return normalized === "CANCELED" ? "CANCELLED" : normalized;
  }
  return "PENDING";
};

// Calculate outcome counts, win rate, profit and ROI for matching tips
const getTipStats = async (where = {}) => {
  const tips = await prisma.tip.findMany({
    where,
    select: {
      id: true,
      odds: true,
      stakeUnits: true,
      outcome: true,
      status: true,
      tips: true,
    },
  });

  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let voids = 0;
  let halfWins = 0;
  let halfLosses = 0;
  let cancelled = 0;
  let pending = 0;

  let totalStake = 0;
  let profit = 0;

  // Collect every usable odds value so the average can be reported
  let oddsTotal = 0;
  let oddsCount = 0;

  for (const tip of tips) {
    // Scraped product groups can contain several actual selections. The nested
    // array is the canonical per-selection result and avoids stale parent
    // outcomes left over from older settlement imports. `extraTips` duplicates
    // some entries in this array, so do not add it separately.
    const picks = Array.isArray(tip.tips) && tip.tips.length > 0
      ? tip.tips
      : [{ odds: tip.odds, units: tip.stakeUnits, outcome: tip.outcome }];

    for (const pick of picks) {
      const outcome = normalizeOutcome(pick?.outcome);
      const rawOdds = pick?.odds ?? tip.odds;
      const rawStake = pick?.units ?? pick?.stakeUnits ?? tip.stakeUnits;
      const odds = rawOdds == null ? 0 : Number(rawOdds);
      const stake = rawStake == null ? 1 : Number(rawStake);

      switch (outcome) {
      case "WON":
        wins += 1;
        profit += stake * (odds - 1);
        break;

      case "LOST":
        losses += 1;
        profit -= stake;
        break;

      case "PUSH":
        pushes += 1;
        break;

      case "VOID":
        voids += 1;
        break;

      case "HALF_WON":
        halfWins += 1;
        profit += (stake * (odds - 1)) / 2;
        break;

      case "HALF_LOST":
        halfLosses += 1;
        profit -= stake / 2;
        break;

      // Count cancelled tips separately so they are not reported as pending
      case "CANCELLED":
        cancelled += 1;
        break;

      default:
        pending += 1;
        break;
      }

      // Count stake only for settled picks so open picks do not dilute ROI.
      if (settledOutcomes.includes(outcome)) totalStake += stake;

      if (Number.isFinite(odds) && odds > 0) {
        oddsTotal += odds;
        oddsCount += 1;
      }
    }
  }

  const settled = wins + losses + pushes + voids + halfWins + halfLosses;

  const winRate = settled > 0 ? ((wins + halfWins * 0.5) / settled) * 100 : null;

  // No settled stake means there is no ROI sample to report. Returning 0 here
  // falsely labels an empty product/day as a break-even performance.
  const roi = totalStake > 0 ? (profit / totalStake) * 100 : null;

  return {
    totalTips: tips.length,
    settled,
    wins,
    losses,
    pushes,
    voids,
    halfWins,
    halfLosses,
    cancelled,
    pending,
    winRate: winRate === null ? null : Number(winRate.toFixed(2)),
    totalStake: Number(totalStake.toFixed(2)),
    profit: Number(profit.toFixed(2)),
    roi: roi === null ? null : Number(roi.toFixed(2)),
    avgOdds: oddsCount > 0 ? Number((oddsTotal / oddsCount).toFixed(2)) : 0,
  };
};

// Get a product by slug or throw when it does not exist
const getProduct = async (slug) => {
  const product = await prisma.product.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
    },
  });

  if (!product) throw createError("Product not found.", 404);

  return product;
};

// Calculate stats for tips published to a product
const getProductStats = async (slug, where = {}) => {
  const product = await getProduct(slug);

  return getTipStats({
    ...where,
    publications: {
      some: {
        productId: product.id,
        status: "PUBLISHED",
      },
    },
  });
};

// Calculate stats for tips belonging to a period. The period id is resolved
// through the same business-day logic as the summary, so every period endpoint
// reports one consistent window.
const getTimeStats = async (periodId) => {
  return getTipStats(resolvePeriodWhere(periodId));
};

// Summarise usage events from the last 30 days
const getUsageStats = async () => {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [totalEvents, uniqueUsers, topPaths, recentEvents] = await Promise.all([
    prisma.usageEvent.count({ where: { createdAt: { gte: since } } }),
    prisma.usageEvent.findMany({
      where: { createdAt: { gte: since }, userId: { not: null } },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.usageEvent.groupBy({
      by: ["path"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 10,
    }),
    prisma.usageEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    }),
  ]);

  // Bucket by Nairobi calendar day; a groupBy on `event` was previously
  // returned under the misleading `daily` field and counted event names.
  const dailyCounts = new Map();
  for (const item of recentEvents) {
    const date = new Date(item.createdAt.getTime() + 3 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    dailyCounts.set(date, (dailyCounts.get(date) || 0) + 1);
  }
  const daily = [...dailyCounts]
    .map(([date, count]) => ({ date, count }))
    .sort((left, right) => left.date.localeCompare(right.date));

  return { periodDays: 30, totalEvents, uniqueUsers: uniqueUsers.length, topPaths, daily };
};

// Get headline counts and overall performance. Row-level counts (total,
// published) come from the parent row, but win/loss counts and every derived
// metric come from getTipStats so they always describe the same selections.
// Counting parent outcomes separately would let a tip whose parent says WON but
// whose nested selections still say LOST be reported as a win in the count and
// a loss in the win rate and ROI.
const getOverview = async () => {
  const [totalTips, publishedTips, settledTips, pendingTips, performance] = await Promise.all([
    prisma.tip.count(),
    prisma.tip.count({ where: { status: "PUBLISHED" } }),
    prisma.tip.count({ where: { outcome: { in: settledOutcomes } } }),
    prisma.tip.count({ where: { outcome: "PENDING" } }),
    getTipStats(),
  ]);

  return {
    totalTips,
    publishedTips,
    settledTips,
    pendingTips,
    wins: performance.wins,
    losses: performance.losses,
    winRate: performance.winRate,
    roi: performance.roi,
    profit: performance.profit,
    totalStake: performance.totalStake,
    avgOdds: performance.avgOdds,
  };
};

// Get stats for the completed prior day. The legacy "today" endpoint resolves
// to the same business-day window used by the Period filter.
const getTodayStats = async () => {
  return getTimeStats("yesterday");
};

// Get stats for the last 7 days
const getWeeklyStats = async () => {
  return getTimeStats("week");
};

// Get stats for the last 14 days
const getFourteenDayStats = async () => {
  return getTimeStats("14-days");
};

// Get stats for the last 30 days
const getMonthlyStats = async () => {
  return getTimeStats("month");
};

// Get stats since the start of the year
const getYearlyStats = async () => {
  return getTimeStats("year");
};

// Get stats for all tips
const getAllTimeStats = async () => {
  return getTipStats();
};

// Build the [start, end] instants for one reporting period, using Nairobi
// (UTC+3) calendar days. Every range ends at Nairobi midnight today so today's
// in-play tips are excluded from settled performance figures.
const getPeriodRange = (periodId) => {
  const normalizedPeriod = String(periodId || "all-time");
  const dayOffsets = {
    yesterday: -1,
    week: -7,
    "14-days": -14,
    month: -30,
  };

  if (Object.hasOwn(dayOffsets, normalizedPeriod)) {
    return {
      gte: getNairobiDayStart(dayOffsets[normalizedPeriod]),
      lt: getNairobiDayStart(0),
    };
  }

  if (normalizedPeriod === "year") {
    return { gte: getNairobiYearStart(), lt: getNairobiDayStart(0) };
  }

  if (normalizedPeriod === "all-time") return null;
  throw createError("Unsupported reporting period.", 400);
};

// Stats are grouped by the business day a tip belongs to (scrapedAt, then
// publishedAt, then createdAt), not by the DB insert time. The seed leaves
// createdAt at the sync moment, so filtering on createdAt alone collapses every
// historical day into one bucket and hides freshly synced tips from the
// Yesterday/7/14/30-day windows.
const resolvePeriodWhere = (periodId) => {
  const range = getPeriodRange(periodId);
  if (!range) return {};
  return buildTipDayFilter({ gte: range.gte, lte: new Date(range.lt.getTime() - 1) });
};

// Return every id a product filter may be sent as, mapped to a real slug
const resolveProductSlug = (productId) => {
  switch (String(productId || "ALL").toUpperCase()) {
    case "ALL":
      return null;
    case "FREE":
      return "free";
    case "VIP":
      return "vip";
    case "MAXBET":
    case "MAX_BET":
      return "maxbet";
    default:
      throw createError("Unsupported product filter.", 400);
  }
};

// Build one summary for a period and an optional product. This is the single
// payload the metric cards read from, so win rate, ROI and average odds always
// describe the same set of tips.
const getSummaryStats = async (rawQuery = {}) => {
  const { periodId = "all-time", productId = "ALL" } = pickStatsQuery(rawQuery);
  const productSlug = resolveProductSlug(productId);
  const timeWhere = resolvePeriodWhere(periodId);

  const performance = productSlug
    ? await getProductStats(productSlug, timeWhere)
    : await getTipStats(timeWhere);

  // Every average odds figure on the page comes from this one helper, so the
  // metric card and the performance report always share a denominator.
  const odds = await getOddsStatsFor(
    productSlug
      ? {
          ...timeWhere,
          publications: {
            some: { productId: (await getProduct(productSlug)).id, status: "PUBLISHED" },
          },
        }
      : timeWhere
  );

  return {
    period: String(periodId || "all-time"),
    product: productSlug ?? "ALL",
    ...performance,
    avgOdds: odds.average,
    average: odds.average,
    odds,
  };
};

// Get stats for the free product
const getFreeStats = async () => {
  return getProductStats("free");
};

// Published VIP performance is public so visitors can assess the record.
const getVipStats = async () => {
  return getProductStats("vip");
};

// Published MaxBet performance is public so visitors can assess the record.
const getMaxbetStats = async () => {
  return getProductStats("maxbet");
};

// Get free product stats for the last 7 days
const getFreeWeeklyStats = async () => {
  return getProductStats("free", resolvePeriodWhere("week"));
};

// Get free product stats for the last 30 days
const getFreeMonthlyStats = async () => {
  return getProductStats("free", resolvePeriodWhere("month"));
};

// Get public VIP product stats for the last 7 days
const getVipWeeklyStats = async () => {
  return getProductStats("vip", resolvePeriodWhere("week"));
};

// Get public VIP product stats for the last 30 days
const getVipMonthlyStats = async () => {
  return getProductStats("vip", resolvePeriodWhere("month"));
};

// Get public MaxBet product stats for the last 7 days
const getMaxbetWeeklyStats = async () => {
  return getProductStats("maxbet", resolvePeriodWhere("week"));
};

// Get public MaxBet product stats for the last 30 days
const getMaxbetMonthlyStats = async () => {
  return getProductStats("maxbet", resolvePeriodWhere("month"));
};

// Get stats for settled tips
const getResults = async () => {
  return getTipStats({ outcome: { in: settledOutcomes } });
};

// Get stats for won tips
const getWins = async () => {
  return getTipStats({ outcome: "WON" });
};

// Get stats for lost tips
const getLosses = async () => {
  return getTipStats({ outcome: "LOST" });
};

// Get stats for pending tips
const getPending = async () => {
  return getTipStats({ outcome: "PENDING" });
};

// Get the overall win rate with its counts
const getWinRate = async () => {
  const stats = await getTipStats();

  return {
    winRate: stats.winRate,
    settled: stats.settled,
    wins: stats.wins,
    losses: stats.losses,
  };
};

// Get the overall ROI with profit and stake
const getRoi = async () => {
  const stats = await getTipStats();

  return {
    roi: stats.roi,
    profit: stats.profit,
    totalStake: stats.totalStake,
  };
};

// Calculate count, total, average, minimum and maximum odds for matching tips.
// This is the single source for every average odds figure, so the metric cards,
// the performance report and the breakdown panels can never disagree.
const getOddsStatsFor = async (where = {}) => {
  const tips = await prisma.tip.findMany({
    where,
    select: { odds: true, tips: true },
  });

  const odds = tips
    .flatMap((tip) => {
      const picks = Array.isArray(tip.tips) && tip.tips.length > 0
        ? tip.tips
        : [{ odds: tip.odds }];
      return picks.map((pick) => Number(pick?.odds ?? tip.odds));
    })
    .filter((value) => Number.isFinite(value) && value > 0);

  if (odds.length === 0) {
    return { count: 0, total: 0, average: 0, minimum: 0, maximum: 0 };
  }

  const total = odds.reduce((sum, value) => sum + value, 0);

  return {
    count: odds.length,
    total: Number(total.toFixed(2)),
    average: Number((total / odds.length).toFixed(2)),
    minimum: Math.min(...odds),
    maximum: Math.max(...odds),
  };
};

// Calculate count, average, minimum and maximum odds
const getOddsStats = async () => {
  return getOddsStatsFor();
};

// Calculate count, total, average, minimum and maximum stakes
const getStakeStats = async () => {
  const tips = await prisma.tip.findMany({
    where: { stakeUnits: { not: null } },
    select: { stakeUnits: true },
  });

  const stakes = tips.map((tip) => Number(tip.stakeUnits));

  if (stakes.length === 0) {
    return { count: 0, total: 0, average: 0, minimum: 0, maximum: 0 };
  }

  const total = stakes.reduce((sum, value) => sum + value, 0);

  return {
    count: stakes.length,
    total: Number(total.toFixed(2)),
    average: Number((total / stakes.length).toFixed(2)),
    minimum: Math.min(...stakes),
    maximum: Math.max(...stakes),
  };
};

// Group tips by a field and calculate win rate per group for the selected
// period and product. The nested `tips[]` array is the canonical per-selection
// result, exactly as getTipStats reads it, so a grouped win rate can never
// disagree with the headline win rate for the same filter combination. Counting
// the parent row's outcome would let a stale bulk settlement report a card as a
// win in the breakdown while the metric cards score its selections as losses.
const getGroupedStats = async (field, filters = {}) => {
  const { productSlug, where: periodWhere } = getProductPeriodWhere(filters);
  const scope = await withProductPublication(periodWhere, productSlug);
  const where = field === "competition" ? { ...scope, [field]: { not: null } } : scope;
  const tips = await prisma.tip.findMany({
    where,
    select: {
      [field]: true,
      outcome: true,
      odds: true,
      stakeUnits: true,
      tips: true,
    },
  });

  const groups = {};

  for (const tip of tips) {
    const key = tip[field] || "Unknown";
    if (!groups[key]) groups[key] = [];
    groups[key].push(tip);
  }

  const results = {};

  for (const [key, group] of Object.entries(groups)) {
    let wins = 0;
    let losses = 0;
    let settled = 0;
    let oddsTotal = 0;
    let oddsCount = 0;

    for (const tip of group) {
      const picks = Array.isArray(tip.tips) && tip.tips.length > 0
        ? tip.tips
        : [{ odds: tip.odds, units: tip.stakeUnits, outcome: tip.outcome }];

      for (const pick of picks) {
        const outcome = normalizeOutcome(pick?.outcome);

        if (outcome === "WON") wins += 1;
        else if (outcome === "HALF_WON") wins += 0.5;
        else if (outcome === "LOST") losses += 1;
        else if (outcome === "HALF_LOST") losses += 0.5;

        if (settledOutcomes.includes(outcome)) settled += 1;

        const odds = Number(pick?.odds ?? tip.odds);
        if (Number.isFinite(odds) && odds > 0) {
          oddsTotal += odds;
          oddsCount += 1;
        }
      }
    }

    results[key] = {
      totalTips: group.length,
      wins: Number(wins.toFixed(2)),
      losses: Number(losses.toFixed(2)),
      settled,
      winRate: settled > 0 ? Number(((wins / settled) * 100).toFixed(2)) : 0,
      avgOdds: oddsCount > 0 ? Number((oddsTotal / oddsCount).toFixed(2)) : 0,
    };
  }

  return results;
};

// Get stats grouped by sport for the selected period and product
const getSportStats = async (filters = {}) => {
  return getGroupedStats("sport", filters);
};

// Get stats grouped by market for the selected period and product
const getMarketStats = async (filters = {}) => {
  return getGroupedStats("market", filters);
};

// Get stats grouped by competition for the selected period and product
const getCompetitionStats = async (filters = {}) => {
  return getGroupedStats("competition", filters);
};

// Get stats grouped by source for the selected period and product
const getSourceStats = async (filters = {}) => {
  return getGroupedStats("source", filters);
};

// Build the same period and product scope used by the stats page. Product
// counts are based on published publications, because one tip can appear in
// more than one product and raw tip counts would incorrectly show every tip in
// every product.
const getProductPeriodWhere = (rawFilters = {}) => {
  const { periodId = "all-time", productId = "ALL" } = pickStatsQuery(rawFilters);
  const productSlug = resolveProductSlug(productId);
  const where = resolvePeriodWhere(periodId);

  return { productSlug, where, periodId };
};

const withProductPublication = async (where, productSlug) => {
  if (!productSlug) return where;

  const product = await getProduct(productSlug);
  return {
    ...where,
    publications: {
      some: { productId: product.id, status: "PUBLISHED" },
    },
  };
};

// Count tips by volume category for the selected period and product.
// `total` is the number of cards (Tip rows). `selections` is the number of
// individual picks across those cards' `tips[]` arrays, which is the figure a
// reader expects when they count "the tips we published". Both are returned so
// the UI can label the card with explicit units instead of mixing them.
const getVolumeStats = async (filters = {}) => {
  const { productSlug, where: periodWhere, periodId } = getProductPeriodWhere(filters);
  const where = await withProductPublication(periodWhere, productSlug);
  const [total, pending, settled, cancelled, published, cards] = await Promise.all([
    prisma.tip.count({ where }),
    prisma.tip.count({ where: { ...where, outcome: "PENDING" } }),
    prisma.tip.count({ where: { ...where, outcome: { in: settledOutcomes } } }),
    prisma.tip.count({ where: { ...where, status: "CANCELLED" } }),
    prisma.tip.count({ where: { ...where, status: "PUBLISHED" } }),
    prisma.tip.findMany({ where, select: { tips: true } }),
  ]);

  const selections = cards.reduce((sum, tip) => {
    const picks = Array.isArray(tip.tips) && tip.tips.length > 0 ? tip.tips.length : 1;
    return sum + picks;
  }, 0);

  return {
    period: String(periodId || "all-time"),
    product: productSlug || "ALL",
    total,
    selections,
    pending,
    settled,
    published,
    cancelled,
  };
};

// Count scraped and manual tips for the selected period and product.
const getScrapedStats = async (filters = {}) => {
  const { productSlug, where: periodWhere, periodId } = getProductPeriodWhere(filters);
  const where = await withProductPublication(periodWhere, productSlug);
  const [total, withScrapedAt] = await Promise.all([
    prisma.tip.count({ where }),
    prisma.tip.count({ where: { ...where, scrapedAt: { not: null } } }),
  ]);

  return {
    period: String(periodId || "all-time"),
    product: productSlug || "ALL",
    totalTips: total,
    scrapedTips: withScrapedAt,
    manualTips: total - withScrapedAt,
  };
};

// Count published tips overall and per active product
const getPublishedStats = async () => {
  const [publishedTips, publications, products] = await Promise.all([
    prisma.tip.count({ where: { publishedAt: { not: null } } }),
    prisma.tipPublication.count({ where: { status: "PUBLISHED" } }),
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, slug: true },
    }),
  ]);

  const productStats = await Promise.all(
    products.map(async (product) => {
      const count = await prisma.tipPublication.count({
        where: { productId: product.id, status: "PUBLISHED" },
      });

      return {
        product: product.name,
        slug: product.slug,
        publishedTips: count,
      };
    })
  );

  return { publishedTips, publications, products: productStats };
};

// Build the full report with overview, products, sports and markets
const getPerformanceReport = async () => {
  const [overview, products, sports, markets] = await Promise.all([
    getAllTimeStats(),
    getProductReports(),
    getSportStats(),
    getMarketStats(),
  ]);

  return { overview, products, sports, markets };
};

// Build the report for the last seven complete days.
const getWeeklyReport = async () => {
  return getReportForPeriod("week");
};

// Build the report for the last 30 complete days.
const getMonthlyReport = async () => {
  return getReportForPeriod("month");
};

// Build the report from the Nairobi calendar year through yesterday.
const getYearlyReport = async () => {
  return getReportForPeriod("year");
};

// Build performance stats for tip groups belonging to a complete period. The
// start/end labels come from the same range the where-clause was built from, so
// the report and its tip set can never describe different windows.
const getReportForPeriod = async (periodId) => {
  const where = resolvePeriodWhere(periodId);
  const range = getPeriodRange(periodId);
  const performance = await getTipStats(where);
  const oddsStats = await getOddsStatsFor(where);

  return {
    periodStart: range?.gte ?? null,
    periodEnd: range?.lt ?? getNairobiDayStart(0),
    performance,
    avgOdds: oddsStats.average,
  };
};

// Build performance stats for every active product
const getProductReports = async () => {
  const products = await prisma.product.findMany({
    where: { status: "ACTIVE" },
    select: { name: true, slug: true },
  });

  return Promise.all(
    products.map(async (product) => ({
      product: product.name,
      slug: product.slug,
      performance: await getProductStats(product.slug),
    }))
  );
};

// Build performance stats for products the user can access
const getMyAccessStats = async (userId) => {
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
    select: { id: true, name: true, slug: true },
  });

  const stats = await Promise.all(
    products.map(async (product) => ({
      product: product.name,
      slug: product.slug,
      performance: await getProductStats(product.slug),
    }))
  );

  return stats;
};

module.exports = {
  getOverview,
  getUsageStats,
  getTodayStats,
  getWeeklyStats,
  getFourteenDayStats,
  getMonthlyStats,
  getYearlyStats,
  getAllTimeStats,
  getFreeStats,
  getVipStats,
  getMaxbetStats,
  getFreeWeeklyStats,
  getFreeMonthlyStats,
  getVipWeeklyStats,
  getVipMonthlyStats,
  getMaxbetWeeklyStats,
  getMaxbetMonthlyStats,
  getResults,
  getWins,
  getLosses,
  getPending,
  getWinRate,
  getRoi,
  getOddsStats,
  getOddsStatsFor,
  getSummaryStats,
  getStakeStats,
  getSportStats,
  getMarketStats,
  getCompetitionStats,
  getSourceStats,
  getVolumeStats,
  getScrapedStats,
  getPublishedStats,
  getPerformanceReport,
  getWeeklyReport,
  getMonthlyReport,
  getYearlyReport,
  getMyAccessStats,
};
