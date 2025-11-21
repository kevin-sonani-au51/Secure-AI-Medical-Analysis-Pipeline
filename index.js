import express from "express";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import authRouter from "./routers/auth.js";
import userRouter from "./routers/user.js";
import cookieParser from "cookie-parser";
import reportRouter from "./routers/report.js";
import { startAgenda } from "./workers/reportWorker.js"; // path based on your structure
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
const execFileAsync = promisify(execFile);

dotenv.config(); // Load environment variables
// Check for Poppler `pdftoppm` availability and log guidance early
async function checkPoppler() {
  try {
    await execFileAsync("pdftoppm", ["-v"]);
    console.log("Poppler found: pdftoppm available");
  } catch (err) {
    console.warn(
      "Warning: `pdftoppm` (Poppler) not found. Scanned PDFs will not be processed.\n" +
        "Install instructions: Windows: `choco install poppler -y` ; macOS: `brew install poppler` ; Ubuntu/Debian: `sudo apt install -y poppler-utils`"
    );
  }
}
checkPoppler().catch(() => {});
const app = express(); // Create Express app
app.use(express.json()); // Middleware to parse JSON bodies
// If running behind a proxy (load balancer), trust the first proxy to get correct client IP
app.set("trust proxy", 1);
// Serve frontend static files from `public` directory
app.use(express.static(path.join(process.cwd(), "public")));
const PORT = process.env.PORT || 3000; // Use PORT from .env or default to 3000
connectDB().then(async () => {
  await startAgenda(); // Ensure Agenda starts only when DB is ready
}); // Connect to MongoDB
app.use(cookieParser()); // Middleware to parse cookies

// Basic route to test server
app.get("/", (req, res) => {
  res.send("Hello, World!");
});

// Routes
app.use("/api/v1/auth", authRouter); // Auth routes
app.use("/api/v1/users", userRouter); // User routes
app.use("/api/v1/reports", reportRouter); // Report routes

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
