const { Router } = require("express");

const subscriptionsController = require("../controllers/subscription.controller");
const { authenticate } = require("../middleware/authorize");
const { validateBody, validateParams } = require("../middleware/validation");
const {
  redeemTokenSchema,
  verifyTokenSchema,
  renewSubscriptionSchema,
} = require("../schemas/subscription.schema");
const { idParamsSchema } = require("../schemas/admin.schema");

const subscriptionsRouter = Router();

// Routes below require a signed-in, active account. `authenticate` guarantees
// req.user, so no handler can reach `req.user.id` on an anonymous request.
subscriptionsRouter.use(authenticate);

// List all subscriptions for the current user
subscriptionsRouter.get("/", subscriptionsController.getMySubscriptions);

// Get the current active subscription and the subscription history
subscriptionsRouter.get("/active", subscriptionsController.getActiveSubscription);
subscriptionsRouter.get("/history", subscriptionsController.getSubscriptionHistory);

// Redeem an access token. Tokens are issued to a registered account, so
// redemption requires signing in as that account.
subscriptionsRouter.post("/redeem", validateBody(redeemTokenSchema), subscriptionsController.redeemAccessToken);

// Check whether an access token is valid
subscriptionsRouter.post("/verify", validateBody(verifyTokenSchema), subscriptionsController.verifyAccessToken);

// List products the current user can access
subscriptionsRouter.get("/my-access", subscriptionsController.getMyAccess);

// Cancel a subscription
subscriptionsRouter.post("/:id/cancel", validateParams(idParamsSchema), subscriptionsController.cancelSubscription);

// Renew a subscription. Days are clamped to 1–365 by the schema and the service.
subscriptionsRouter.post(
  "/:id/renew",
  validateParams(idParamsSchema),
  validateBody(renewSubscriptionSchema),
  subscriptionsController.renewSubscription
);

// Get a single subscription, registered last so named routes match first
subscriptionsRouter.get("/:id", validateParams(idParamsSchema), subscriptionsController.getSubscriptionById);

module.exports = subscriptionsRouter;
