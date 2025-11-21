import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  registerUser,
  loginUser,
  refreshUserToken,
  userLogout,
} from "../controllers/authController.js";

const router = Router();

// Limit login attempts to 5 per minute per IP to mitigate brute-force attacks
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // limit each IP to 5 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res
      .status(429)
      .json({ message: "Too many login attempts. Try again in a minute." }),
});

router.post("/register", registerUser); // User registration
router.post("/login", loginLimiter, loginUser); // User login (rate limited)
router.post("/refresh-token", refreshUserToken); // Refresh JWT token
router.post("/logout", userLogout); // User logout

export default router;
