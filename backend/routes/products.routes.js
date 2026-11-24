const { Router } = require("express");

const productsController = require("../controllers/products.controller");
const { authenticate } = require("../middleware/authorize");
const { validateParams } = require("../middleware/validation");
const { idParamsSchema } = require("../schemas/admin.schema");

const productsRouter = Router();

// List all active products
productsRouter.get("/", productsController.getProducts);

// Get the free product
productsRouter.get("/free", productsController.getFreeProduct);

// Get the VIP product
productsRouter.get("/vip", productsController.getVipProduct);

// Get the MaxBet product
productsRouter.get("/maxbet", productsController.getMaxbetProduct);

// List products the current user can access
productsRouter.get("/my-access", authenticate, productsController.getMyProducts);

// Get a single product by id, registered last so named routes match first
productsRouter.get("/:id", validateParams(idParamsSchema), productsController.getProductById);

module.exports = productsRouter;
