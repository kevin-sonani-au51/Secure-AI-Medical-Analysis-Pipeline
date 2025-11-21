import User from "../models/user.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

// Controller to handle user registration
export const registerUser = async (req, res) => {
  const { name, email, password, role } = req.body;
  // basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email address" });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ message: "Name is required" });
  }
  if (!password || password.length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters" });
  }
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }
    // hash the password before saving
    const hashed = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashed, role });
    await newUser.save();

    // Create JWT token
    const token = jwt.sign(
      { id: newUser._id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "15m" } // Shorter expiry for access token
    );

    // Create new refresh token (rotation)
    const newRefreshToken = jwt.sign(
      { id: newUser._id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "7d" }
    );

    // Send new refresh token in HttpOnly cookie
    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Save refresh token with user
    await User.updateOne(
      { _id: newUser._id },
      { refreshToken: newRefreshToken }
    );

    res.status(201).json({ message: "User registered successfully", token });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Controller to handle user login
export const loginUser = async (req, res) => {
  const { email, password } = req.body;
  // basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email address" });
  }
  try {
    // find by email and compare hashed password
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid credentials" });

    // Create JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "15m" } // Shorter expiry for access token
    );

    // Create new refresh token (rotation)
    const newRefreshToken = jwt.sign(
      { id: user._id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "7d" }
    );

    // Send new refresh token in HttpOnly cookie
    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Update refresh token in database
    await User.updateOne({ _id: user._id }, { refreshToken: newRefreshToken });

    // Do not return password hash to client
    const userObj = user.toObject();
    delete userObj.password;

    res.status(200).json({ message: "Login successful", token, user: userObj });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Controller to refresh JWT token
export const refreshUserToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token missing" });
    }

    // Check if refresh token exists in DB (token rotation)
    const user = await User.findOne({ refreshToken });

    if (!user) {
      return res.status(403).json({ message: "Invalid refresh token" });
    }

    // Verify the refresh token
    jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET,
      async (err, decoded) => {
        if (err) {
          return res
            .status(403)
            .json({ message: "Refresh token expired or invalid" });
        }

        // Create new access token
        const newAccessToken = jwt.sign(
          { id: user._id, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: "15m" }
        );

        // Create new refresh token (rotation)
        const newRefreshToken = jwt.sign(
          { id: user._id },
          process.env.REFRESH_TOKEN_SECRET,
          { expiresIn: "7d" }
        );

        // Save new refresh token & remove old one
        await User.updateOne(
          { _id: user._id },
          { refreshToken: newRefreshToken }
        );

        // Send new refresh token as HttpOnly cookie
        res.cookie("refreshToken", newRefreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        // Send new access token in JSON
        return res.json({
          message: "Token refreshed successfully",
          accessToken: newAccessToken,
        });
      }
    );
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Controller to handle user logout
export const userLogout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(400).json({ message: "No refresh token provided" });
    }
    // Find user with this refresh token
    const user = await User.findOne({ refreshToken });
    if (user) {
      // Remove refresh token from database
      await User.updateOne({ _id: user._id }, { $unset: { refreshToken: "" } });
    }
    // Clear the refresh token cookie
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
