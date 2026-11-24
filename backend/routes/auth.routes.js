const { Router } = require("express");

const authController = require("../controllers/auth.controller");
const { authenticate } = require("../middleware/authorize");
const {
  validateRegistration,
  validateLogin,
  validateUpdateProfile,
  validateUpdatePassword,
} = require("../middleware/validation");
const upload = require("../middleware/imageHandler");

const authRouter = Router();

// Register, log in and log out
authRouter.post("/register", validateRegistration, authController.registerUser);
authRouter.post("/login", validateLogin, authController.loginUser);
authRouter.post("/logout", authController.logoutUser);

// Get the current user's profile
authRouter.get("/me", authenticate, authController.getCurrentUser);
authRouter.patch("/me", authenticate, validateUpdateProfile, authController.updateCurrentUserProfile);

// Upload a new avatar for the current user
authRouter.patch("/me/avatar", authenticate, upload.single("avatar"), authController.updateAvatar);

// Change the current user's password
authRouter.patch("/password", authenticate, validateUpdatePassword, authController.updatePassword);

module.exports = authRouter;
