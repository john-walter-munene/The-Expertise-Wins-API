const { Router } = require("express");

const adminController = require("../controllers/admin.controller");
const { authenticate, requireRole } = require("../middleware/authorize");
const {
  validateBody,
  validateQuery,
  validateParams,
  validateIdempotencyKey,
} = require("../middleware/validation");
const {
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
  idempotencyKeyHeader,
} = require("../schemas/admin.schema");

const adminRouter = Router();

// Require an authenticated, active admin for every admin route. `authenticate`
// guarantees req.user exists, and `requireRole("admin")` enforces the role.
adminRouter.use(authenticate, requireRole("admin"));

// Shared middleware
const validateId = validateParams(idParamsSchema);
const validateSettlementKey = validateIdempotencyKey(idempotencyKeyHeader);

// Manage users
adminRouter.get("/users", validateQuery(adminUserListQuerySchema), adminController.getUsers);
adminRouter.get("/users/:id", validateId, adminController.getUserById);
adminRouter.patch("/users/:id", validateId, validateBody(updateUserSchema), adminController.updateUser);
adminRouter.patch(
  "/users/:id/status",
  validateId,
  validateBody(updateUserStatusSchema),
  adminController.updateUserStatus
);
adminRouter.delete("/users/:id", validateId, adminController.deleteUser);

// Admin curation endpoints. These require the active-admin middleware above;
// normal daily publication and settlement should still use the CLI dump workflow.
adminRouter.post("/tips", validateBody(createTipSchema), adminController.createTip);
adminRouter.get("/tips", validateQuery(adminTipListQuerySchema), adminController.getTips);
adminRouter.patch(
  "/tips/bulk",
  validateBody(updateTipsBulkSchema),
  adminController.updateTipsBulk
);
adminRouter.post("/tips/bulk/publish", validateBody(tipIdsBodySchema), adminController.publishTipsBulk);
adminRouter.post("/tips/bulk/unpublish", validateBody(tipIdsBodySchema), adminController.unpublishTipsBulk);
adminRouter.post(
  "/tips/bulk/settle",
  validateSettlementKey,
  validateBody(settleTipsBulkSchema),
  adminController.settleTipsBulk
);
adminRouter.post("/tips/bulk/cancel", validateBody(tipIdsBodySchema), adminController.cancelTipsBulk);
adminRouter.get("/tips/:id", validateId, adminController.getTipById);
adminRouter.patch("/tips/:id", validateId, validateBody(updateTipSchema), adminController.updateTip);
adminRouter.delete("/tips/:id", validateId, adminController.deleteTip);
adminRouter.post("/tips/:id/publish", validateId, adminController.publishTip);
adminRouter.post("/tips/:id/unpublish", validateId, adminController.unpublishTip);
adminRouter.post(
  "/tips/:id/settle",
  validateId,
  validateSettlementKey,
  validateBody(settleTipSchema),
  adminController.settleTip
);
adminRouter.post("/tips/:id/cancel", validateId, adminController.cancelTip);
adminRouter.post(
  "/tips/:id/publications",
  validateId,
  validateBody(publishTipToProductSchema),
  adminController.publishTipToProduct
);
adminRouter.delete(
  "/tips/:id/publications/:productId",
  validateParams(tipPublicationParamsSchema),
  adminController.removeTipPublication
);

// Manage access tokens
adminRouter.post(
  "/subscription-tokens",
  validateBody(createAccessTokenSchema),
  adminController.createAccessToken
);
adminRouter.post(
  "/subscription-tokens/bulk",
  validateBody(createAccessTokensBulkSchema),
  adminController.createAccessTokensBulk
);
adminRouter.get(
  "/subscription-tokens",
  validateQuery(adminAccessTokenListQuerySchema),
  adminController.getAccessTokens
);
adminRouter.get("/subscription-tokens/:id", validateId, adminController.getAccessTokenById);
adminRouter.patch(
  "/subscription-tokens/:id",
  validateId,
  validateBody(updateAccessTokenSchema),
  adminController.updateAccessToken
);
adminRouter.post(
  "/subscription-tokens/:id/revoke",
  validateId,
  adminController.revokeAccessToken
);
adminRouter.delete("/subscription-tokens/:id", validateId, adminController.deleteAccessToken);
adminRouter.post(
  "/subscription-tokens/:id/extend",
  validateId,
  validateBody(extendAccessTokenSchema),
  adminController.extendAccessToken
);

// Manage products
adminRouter.post("/products", validateBody(createProductSchema), adminController.createProduct);
adminRouter.get("/products", validateQuery(adminProductListQuerySchema), adminController.getProducts);
adminRouter.get("/products/:id", validateId, adminController.getProductById);
adminRouter.patch("/products/:id", validateId, validateBody(updateProductSchema), adminController.updateProduct);
adminRouter.patch(
  "/products/:id/status",
  validateId,
  validateBody(updateProductStatusSchema),
  adminController.updateProductStatus
);

module.exports = adminRouter;
