import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
  {
    name: { type: String, required: true, default: "" },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, default: "" },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    isActive: { type: Boolean, default: true },
    refreshToken: { type: String, default: "" },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema); // Create the User model
export default User;
