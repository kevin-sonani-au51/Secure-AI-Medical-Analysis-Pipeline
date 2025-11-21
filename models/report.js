import mongoose from "mongoose";

const reportSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  filename: { type: String, required: true },
  filepath: { type: String, required: true },
  status: {
    type: String,
    enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "DELETED"],
    default: "PENDING",
  },
  result: { type: Object },
  error: { type: String },
  deleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Report", reportSchema);
