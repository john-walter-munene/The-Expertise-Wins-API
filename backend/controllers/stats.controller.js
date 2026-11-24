const statsService = require("../services/stats.service");

// Get the overall performance overview
const getOverview = async (req, res, next) => {
  try {
    const stats = await statsService.getOverview();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get win rate, ROI, and average odds for the requested period and product
const getSummaryStats = async (req, res, next) => {
  try {
    const stats = await statsService.getSummaryStats({
      periodId: req.query.period,
      productId: req.query.product,
    });
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get application usage for the last 30 days
const getUsageStats = async (req, res, next) => {
  try {
    const stats = await statsService.getUsageStats();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get performance for tips created today
const getTodayStats = async (req, res, next) => {
  try {
    const stats = await statsService.getTodayStats();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get performance for the last 7 days
const getWeeklyStats = async (req, res, next) => {
  try {
    const stats = await statsService.getWeeklyStats();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get performance for the last 14 days
const getFourteenDayStats = async (req, res, next) => {
  try {
    const stats = await statsService.getFourteenDayStats();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get performance for the last 30 days
const getMonthlyStats = async (req, res, next) => {
  try {
    const stats = await statsService.getMonthlyStats();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get performance since the start of the year
const getYearlyStats = async (req, res, next) => {
  try {
    const stats = await statsService.getYearlyStats();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get performance for all tips
const getAllTimeStats = async (req, res, next) => {
  try {
    const stats = await statsService.getAllTimeStats();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get performance for the free product
const getFreeStats = async (req, res, next) => {
  try {
    const stats = await statsService.getFreeStats();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get public performance for the VIP product
const getVipStats = async (req, res, next) => {
  try {
    const stats = await statsService.getVipStats(req.user?.id, req.user?.role === "ADMIN");
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get public performance for the MaxBet product
const getMaxbetStats = async (req, res, next) => {
  try {
    const stats = await statsService.getMaxbetStats(req.user?.id, req.user?.role === "ADMIN");
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get free product performance for the last 7 days
const getFreeWeeklyStats = async (req, res, next) => {
  try {
    const stats = await statsService.getFreeWeeklyStats();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get free product performance for the last 30 days
const getFreeMonthlyStats = async (req, res, next) => {
  try {
    const stats = await statsService.getFreeMonthlyStats();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get VIP product performance for the last 7 days
const getVipWeeklyStats = async (req, res, next) => {
  try {
    const stats = await statsService.getVipWeeklyStats(req.user?.id, req.user?.role === "ADMIN");
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get VIP product performance for the last 30 days
const getVipMonthlyStats = async (req, res, next) => {
  try {
    const stats = await statsService.getVipMonthlyStats(req.user?.id, req.user?.role === "ADMIN");
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get MaxBet product performance for the last 7 days
const getMaxbetWeeklyStats = async (req, res, next) => {
  try {
    const stats = await statsService.getMaxbetWeeklyStats(req.user?.id, req.user?.role === "ADMIN");
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get MaxBet product performance for the last 30 days
const getMaxbetMonthlyStats = async (req, res, next) => {
  try {
    const stats = await statsService.getMaxbetMonthlyStats(req.user?.id, req.user?.role === "ADMIN");
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get performance for settled tips
const getResults = async (req, res, next) => {
  try {
    const stats = await statsService.getResults();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get performance for won tips
const getWins = async (req, res, next) => {
  try {
    const stats = await statsService.getWins();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get performance for lost tips
const getLosses = async (req, res, next) => {
  try {
    const stats = await statsService.getLosses();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get performance for pending tips
const getPending = async (req, res, next) => {
  try {
    const stats = await statsService.getPending();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get the overall win rate
const getWinRate = async (req, res, next) => {
  try {
    const stats = await statsService.getWinRate();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get the overall return on investment
const getRoi = async (req, res, next) => {
  try {
    const stats = await statsService.getRoi();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get odds statistics
const getOddsStats = async (req, res, next) => {
  try {
    const stats = await statsService.getOddsStats();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get stake statistics
const getStakeStats = async (req, res, next) => {
  try {
    const stats = await statsService.getStakeStats();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get performance grouped by sport for the requested period and product
const getSportStats = async (req, res, next) => {
  try {
    const stats = await statsService.getSportStats({
      periodId: req.query.period,
      productId: req.query.product,
    });
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get performance grouped by market for the requested period and product
const getMarketStats = async (req, res, next) => {
  try {
    const stats = await statsService.getMarketStats({
      periodId: req.query.period,
      productId: req.query.product,
    });
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get performance grouped by competition for the requested period and product
const getCompetitionStats = async (req, res, next) => {
  try {
    const stats = await statsService.getCompetitionStats({
      periodId: req.query.period,
      productId: req.query.product,
    });
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get performance grouped by source for the requested period and product
const getSourceStats = async (req, res, next) => {
  try {
    const stats = await statsService.getSourceStats({
      periodId: req.query.period,
      productId: req.query.product,
    });
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get tip volume counts
const getVolumeStats = async (req, res, next) => {
  try {
    const stats = await statsService.getVolumeStats({
      periodId: req.query.period,
      productId: req.query.product,
    });
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get scraped versus manual tip counts
const getScrapedStats = async (req, res, next) => {
  try {
    const stats = await statsService.getScrapedStats({
      periodId: req.query.period,
      productId: req.query.product,
    });
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get published tip counts per product
const getPublishedStats = async (req, res, next) => {
  try {
    const stats = await statsService.getPublishedStats();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get the full performance report
const getPerformanceReport = async (req, res, next) => {
  try {
    const stats = await statsService.getPerformanceReport();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get the report for the last 7 days
const getWeeklyReport = async (req, res, next) => {
  try {
    const stats = await statsService.getWeeklyReport();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get the report for the last 30 days
const getMonthlyReport = async (req, res, next) => {
  try {
    const stats = await statsService.getMonthlyReport();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get the report since the start of the year
const getYearlyReport = async (req, res, next) => {
  try {
    const stats = await statsService.getYearlyReport();
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

// Get performance for products the current user can access
const getMyAccessStats = async (req, res, next) => {
  try {
    const stats = await statsService.getMyAccessStats(req.user.id);
    res.status(200).json({ stats });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOverview,
  getSummaryStats,
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
