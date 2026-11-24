const { Router } = require("express");

const statsController = require("../controllers/stats.controller");
const { authenticate, requireRole } = require("../middleware/authorize");
const { optionalAuthenticateJWT } = require("../middleware/authentication");

const statsRouter = Router();

// Get the overall performance overview
statsRouter.get("/", statsController.getOverview);

// Get public win rate, ROI and average odds for ?period= and ?product= in one payload.
statsRouter.get(
  "/summary",
  optionalAuthenticateJWT,
  statsController.getSummaryStats
);

// Get application usage for admins: authentication plus an explicit role gate
statsRouter.get("/usage", authenticate, requireRole("admin"), statsController.getUsageStats);

// Get performance for fixed time periods
statsRouter.get("/today", statsController.getTodayStats);
statsRouter.get("/week", statsController.getWeeklyStats);
statsRouter.get("/14-days", statsController.getFourteenDayStats);
statsRouter.get("/month", statsController.getMonthlyStats);
statsRouter.get("/year", statsController.getYearlyStats);
statsRouter.get("/all-time", statsController.getAllTimeStats);

// Public product performance lets visitors review every published tier.
statsRouter.get("/free", statsController.getFreeStats);
statsRouter.get("/vip", optionalAuthenticateJWT, statsController.getVipStats);
statsRouter.get("/maxbet", optionalAuthenticateJWT, statsController.getMaxbetStats);

// Get product performance for weekly and monthly periods
statsRouter.get("/free/week", statsController.getFreeWeeklyStats);
statsRouter.get("/free/month", statsController.getFreeMonthlyStats);
statsRouter.get("/vip/week", optionalAuthenticateJWT, statsController.getVipWeeklyStats);
statsRouter.get("/vip/month", optionalAuthenticateJWT, statsController.getVipMonthlyStats);
statsRouter.get("/maxbet/week", optionalAuthenticateJWT, statsController.getMaxbetWeeklyStats);
statsRouter.get("/maxbet/month", optionalAuthenticateJWT, statsController.getMaxbetMonthlyStats);

// Get results filtered by outcome
statsRouter.get("/results", statsController.getResults);
statsRouter.get("/wins", statsController.getWins);
statsRouter.get("/losses", statsController.getLosses);
statsRouter.get("/pending", statsController.getPending);

// Get performance metrics
statsRouter.get("/win-rate", statsController.getWinRate);
statsRouter.get("/roi", statsController.getRoi);
statsRouter.get("/odds", statsController.getOddsStats);
statsRouter.get("/stakes", statsController.getStakeStats);

// Get performance grouped by category
statsRouter.get("/sports", statsController.getSportStats);
statsRouter.get("/markets", statsController.getMarketStats);
statsRouter.get("/competitions", statsController.getCompetitionStats);
statsRouter.get("/sources", authenticate, requireRole("admin"), statsController.getSourceStats);

// Get tip volume and activity
statsRouter.get("/volume", statsController.getVolumeStats);
statsRouter.get("/scraped", statsController.getScrapedStats);
statsRouter.get("/published", statsController.getPublishedStats);

// Get performance reports
statsRouter.get("/report", statsController.getPerformanceReport);
statsRouter.get("/report/weekly", statsController.getWeeklyReport);
statsRouter.get("/report/monthly", statsController.getMonthlyReport);
statsRouter.get("/report/yearly", statsController.getYearlyReport);

// Get performance for products the current user can access
statsRouter.get("/my-access", authenticate, statsController.getMyAccessStats);

module.exports = statsRouter;
