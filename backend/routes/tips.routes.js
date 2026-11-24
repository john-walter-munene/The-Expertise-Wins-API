const { Router } = require("express");

const tipsController = require("../controllers/tips.controller");
const { authenticate } = require("../middleware/authorize");
const { optionalAuthenticateJWT } = require("../middleware/authentication");
const { validateParams, validateQuery } = require("../middleware/validation");
const { idParamsSchema, publicTipListQuerySchema, archiveQuerySchema } = require("../schemas/admin.schema");

const tipsRouter = Router();

// List public tips and free tips
tipsRouter.get("/", validateQuery(publicTipListQuerySchema), tipsController.getTips);
tipsRouter.get("/free", validateQuery(publicTipListQuerySchema), tipsController.getFreeTips);

// List tips for paid products, requiring login
tipsRouter.get("/vip", authenticate, validateQuery(publicTipListQuerySchema), tipsController.getVipTips);
tipsRouter.get("/maxbet", authenticate, validateQuery(publicTipListQuerySchema), tipsController.getMaxbetTips);

// Public historical record across all active tiers; current VIP lists remain gated.
tipsRouter.get("/archive", optionalAuthenticateJWT, validateQuery(archiveQuerySchema), tipsController.getArchive);

// Get a single tip, registered after named routes so they match first
tipsRouter.get("/:id", optionalAuthenticateJWT, validateParams(idParamsSchema), tipsController.getTipById);

// Mutations are intentionally not exposed on the public tips router. Use the
// admin CLI/operator endpoints under /api/admin/tips.
module.exports = tipsRouter;
