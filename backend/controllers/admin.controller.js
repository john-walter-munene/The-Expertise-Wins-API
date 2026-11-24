const adminService = require("../services/admin.service");

// List users with filters and pagination
const getUsers = async (req, res, next) => {
  try {
    const { query } = req;
    const result = await adminService.getUsers(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Get a single user by id
const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await adminService.getUserById(id);
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
};

// Update a user's details
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body ?? {};
    const user = await adminService.updateUser(id, body, req.user?.id);
    res.status(200).json({ message: "User updated successfully.", user });
  } catch (error) {
    next(error);
  }
};

// Update a user's status
const updateUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body ?? {};
    const user = await adminService.updateUserStatus(id, status, req.user?.id);
    res.status(200).json({ message: "User status updated successfully.", user });
  } catch (error) {
    next(error);
  }
};

// Permanently delete a user
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await adminService.deleteUser(id, req.user?.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Create a tip as the current admin
const createTip = async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const tip = await adminService.createTip(body, req.user?.id);
    res.status(201).json({ message: "Tip created successfully.", tip });
  } catch (error) {
    next(error);
  }
};

// List tips with filters and pagination
const getTips = async (req, res, next) => {
  try {
    const { query } = req;
    const result = await adminService.getTips(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Get a single tip by id
const getTipById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tip = await adminService.getTipById(id);
    res.status(200).json({ tip });
  } catch (error) {
    next(error);
  }
};

// Update a tip
const updateTip = async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body ?? {};
    const tip = await adminService.updateTip(id, body, req.user?.id);
    res.status(200).json({ message: "Tip updated successfully.", tip });
  } catch (error) {
    next(error);
  }
};

// Soft delete a tip by cancelling it
const deleteTip = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tip = await adminService.deleteTip(id, req.user?.id);
    res.status(200).json({ message: "Tip cancelled successfully.", tip });
  } catch (error) {
    next(error);
  }
};

// Update many tips at once
const updateTipsBulk = async (req, res, next) => {
  try {
    const { ids, data } = req.body ?? {};
    const result = await adminService.updateTipsBulk(ids, data, req.user?.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Publish many tips at once
const publishTipsBulk = async (req, res, next) => {
  try {
    const { ids } = req.body ?? {};
    const { id: userId } = req.user;
    const result = await adminService.publishTipsBulk(ids, userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Unpublish many tips at once
const unpublishTipsBulk = async (req, res, next) => {
  try {
    const { ids } = req.body ?? {};
    const result = await adminService.unpublishTipsBulk(ids, req.user?.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Settle many tips at once
const settleTipsBulk = async (req, res, next) => {
  try {
    const { ids, outcome, result: resInfo } = req.body ?? {};
    const result = await adminService.settleTipsBulk(ids, outcome, resInfo, req.user?.id, req.idempotencyKey);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Cancel many tips at once
const cancelTipsBulk = async (req, res, next) => {
  try {
    const { ids } = req.body ?? {};
    const result = await adminService.cancelTipsBulk(ids, req.user?.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Publish a single tip
const publishTip = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;
    const tip = await adminService.publishTip(id, userId);
    res.status(200).json({ message: "Tip published successfully.", tip });
  } catch (error) {
    next(error);
  }
};

// Unpublish a single tip
const unpublishTip = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tip = await adminService.unpublishTip(id, req.user?.id);
    res.status(200).json({ message: "Tip unpublished successfully.", tip });
  } catch (error) {
    next(error);
  }
};

// Settle a single tip
const settleTip = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { outcome, result: resInfo, selectionOutcomes } = req.body ?? {};
    const tip = await adminService.settleTip(id, outcome, resInfo, req.user?.id, selectionOutcomes, req.idempotencyKey);
    res.status(200).json({ message: "Tip settled successfully.", tip });
  } catch (error) {
    next(error);
  }
};

// Cancel a single tip
const cancelTip = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tip = await adminService.cancelTip(id, req.user?.id);
    res.status(200).json({ message: "Tip cancelled successfully.", tip });
  } catch (error) {
    next(error);
  }
};

// Publish a tip to a product
const publishTipToProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { productId } = req.body ?? {};
    const publication = await adminService.publishTipToProduct(id, productId, req.user?.id);
    res.status(201).json({ message: "Tip published to product successfully.", publication });
  } catch (error) {
    next(error);
  }
};

// Remove a tip publication from a product
const removeTipPublication = async (req, res, next) => {
  try {
    const { id, productId } = req.params;
    const publication = await adminService.removeTipPublication(id, productId, req.user?.id);
    res.status(200).json({ message: "Tip publication removed successfully.", publication });
  } catch (error) {
    next(error);
  }
};

// Create a single access token
const createAccessToken = async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const result = await adminService.createAccessToken(body, req.user?.id);
    res.status(201).json({ message: "Access token created successfully.", ...result });
  } catch (error) {
    next(error);
  }
};

// Create many access tokens at once
const createAccessTokensBulk = async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const result = await adminService.createAccessTokensBulk(body, req.user?.id);
    res.status(201).json({ message: "Access tokens created successfully.", ...result });
  } catch (error) {
    next(error);
  }
};

// List access tokens with filters and pagination
const getAccessTokens = async (req, res, next) => {
  try {
    const { query } = req;
    const result = await adminService.getAccessTokens(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Get a single access token by id
const getAccessTokenById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const accessToken = await adminService.getAccessTokenById(id);
    res.status(200).json({ accessToken });
  } catch (error) {
    next(error);
  }
};

// Update an access token
const updateAccessToken = async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body ?? {};
    const accessToken = await adminService.updateAccessToken(id, body, req.user?.id);
    res.status(200).json({ message: "Access token updated successfully.", accessToken });
  } catch (error) {
    next(error);
  }
};

// Revoke an access token
const revokeAccessToken = async (req, res, next) => {
  try {
    const { id } = req.params;
    const accessToken = await adminService.revokeAccessToken(id, req.user?.id);
    res.status(200).json({ message: "Access token revoked successfully.", accessToken });
  } catch (error) {
    next(error);
  }
};

// Permanently delete an access token. Distinct from revoke, which keeps the
// record for audit purposes.
const deleteAccessToken = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await adminService.deleteAccessToken(id, req.user?.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Extend an access token by a number of days
const extendAccessToken = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { days } = req.body ?? {};
    const accessToken = await adminService.extendAccessToken(id, days, req.user?.id);
    res.status(200).json({ message: "Access token extended successfully.", accessToken });
  } catch (error) {
    next(error);
  }
};

// Create a product
const createProduct = async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const product = await adminService.createProduct(body, req.user?.id);
    res.status(201).json({ message: "Product created successfully.", product });
  } catch (error) {
    next(error);
  }
};

// List products with filters
const getProducts = async (req, res, next) => {
  try {
    const { query } = req;
    const products = await adminService.getProducts(query);
    res.status(200).json({ products });
  } catch (error) {
    next(error);
  }
};

// Get a single product by id
const getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await adminService.getProductById(id);
    res.status(200).json({ product });
  } catch (error) {
    next(error);
  }
};

// Update a product
const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body ?? {};
    const product = await adminService.updateProduct(id, body, req.user?.id);
    res.status(200).json({ message: "Product updated successfully.", product });
  } catch (error) {
    next(error);
  }
};

// Update a product's status
const updateProductStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body ?? {};
    const product = await adminService.updateProductStatus(id, status, req.user?.id);
    res.status(200).json({ message: "Product status updated successfully.", product });
  } catch (error) {
    next(error);
  }
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
