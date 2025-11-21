import express from "express";
import authenticateJWT from "../middleware/jwtauth.js";
import {
  getAllUsers,
  getUserById,
  updateUserById,
  deleteUserById,
  getUserCount,
  getUsersByRole,
  changeUserRole,
  searchUsers,
  getRecentUsers,
  deactivateUser,
  activateUser,
} from "../controllers/userController.js";

const router = express.Router();

// Static/specific routes first (to avoid conflict with '/:id')
router.get("/", authenticateJWT, getAllUsers); // Get all users
router.get("/count/all", authenticateJWT, getUserCount); // Get total user count
router.get("/role/:role", authenticateJWT, getUsersByRole); // Get users by role
router.put("/role/:id", authenticateJWT, changeUserRole); // Change user role
router.get("/search/:query", authenticateJWT, searchUsers); // Search users by query
router.get("/recent/new", authenticateJWT, getRecentUsers); // Get recent users
router.put("/deactivate/:id", authenticateJWT, deactivateUser); // Deactivate user
router.put("/activate/:id", authenticateJWT, activateUser); // Activate user

// Parameterized routes after specific ones
router.get("/:id", authenticateJWT, getUserById); // Get user by ID
router.put("/:id", authenticateJWT, updateUserById); // Update user by ID
router.delete("/:id", authenticateJWT, deleteUserById); // Delete user by ID

export default router;
