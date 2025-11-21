import User from "../models/user.js";

// Controller to handle user-related operations
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find(); // Exclude passwords
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Get user by ID
export const getUserById = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findById(id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Update user by ID
export const updateUserById = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    const user = await User.findByIdAndUpdate(id, updates, {
      new: true,
    }).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ message: "User updated successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Delete user by ID
export const deleteUserById = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Get total user count
export const getUserCount = async (req, res) => {
  try {
    const count = await User.countDocuments();
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Get users by role
export const getUsersByRole = async (req, res) => {
  const { role } = req.params;
  try {
    const users = await User.find({ role }).select("-password");
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Change user role
export const changeUserRole = async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  try {
    const user = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true }
    ).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ message: "User role updated successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Search users by name or email
export const searchUsers = async (req, res) => {
  // Accept query via route param or query string for flexibility
  const q = req.params.query || req.query.query || req.query.q || "";
  if (!q) return res.status(400).json({ message: "Query missing" });
  try {
    const users = await User.find({
      $or: [
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
      ],
    }).select("-password");
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Get recent users
export const getRecentUsers = async (req, res) => {
  const { limit = 5 } = req.query;
  try {
    const users = await User.find()
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .select("-password");
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Deactivate user
export const deactivateUser = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    ).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ message: "User deactivated successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Activate user
export const activateUser = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findByIdAndUpdate(
      id,
      { isActive: true },
      { new: true }
    ).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ message: "User activated successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
