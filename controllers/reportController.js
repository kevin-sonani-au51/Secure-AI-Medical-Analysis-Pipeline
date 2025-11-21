import Report from "../models/report.js";
import User from "../models/user.js";
import jwt from "jsonwebtoken";
import { scheduleReportJob } from "../workers/reportWorker.js";
import path from "path";
import mongoose from "mongoose";
import authenticateJWT from "../middleware/jwtauth.js";
import fs from "fs";
import { promisify } from "util";
import { execFile } from "child_process";
const execFileAsync = promisify(execFile);
import pdfParse from "pdf-parse";

// Upload endpoint (producer)
export const uploadReport = async (req, res) => {
  try {
    // req.user must be available via your existing authentication middleware
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    if (req.fileValidationError)
      return res.status(400).json({ message: req.fileValidationError });
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const newReport = await Report.create({
      user: req.user.id,
      filename: req.file.filename,
      filepath: req.file.path,
      status: "PENDING",
    });

    // If uploaded file is a PDF, try to extract text now to decide if we need Poppler.
    // Skip these checks when mock AI is enabled to avoid requiring system binaries during tests.
    const useMock =
      String(process.env.USE_MOCK_AI || "").toLowerCase() === "true";
    const ext = path.extname(req.file.path || "").toLowerCase();
    if (!useMock && ext === ".pdf") {
      let pdfHasText = false;
      try {
        const buffer = fs.readFileSync(req.file.path);
        const data = await pdfParse(buffer);
        const text = (data && data.text) || "";
        if (text && text.trim().length > 0) pdfHasText = true;
      } catch (parseErr) {
        // pdf-parse failed; we'll attempt conversion below or fail with a clear message
        console.warn(
          "pdf-parse failed or returned no text, will check pdftoppm:",
          parseErr.message || parseErr
        );
      }

      if (!pdfHasText) {
        // Check if pdftoppm is available for scanned PDFs
        try {
          await execFileAsync("pdftoppm", ["-v"]);
        } catch (err) {
          // Clean up the uploaded file and report record since we cannot process this scanned PDF
          try {
            fs.unlinkSync(req.file.path);
          } catch (unlinkErr) {}
          try {
            await Report.findByIdAndDelete(newReport._id);
          } catch (delErr) {}

          return res.status(400).json({
            message:
              "Uploaded PDF appears to be scanned (no extractable text) and server is missing `pdftoppm` (Poppler). Install Poppler or upload a digital PDF/image.",
          });
        }
      }
    }

    // Add job to Agenda queue (will throw if Agenda not initialized)
    try {
      await scheduleReportJob(newReport._id.toString());
    } catch (err) {
      // If scheduling fails because Agenda isn't ready, log and continue — report remains PENDING
      console.error("Failed to schedule agenda job:", err.message || err);
    }

    return res.json({ jobId: newReport._id, message: "Processing started" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const getReportStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await Report.findById(id).select("status createdAt");
    if (!report) return res.status(404).json({ message: "Not found" });
    return res.json({ status: report.status, createdAt: report.createdAt });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
};

export const getReportResult = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await Report.findById(id);
    if (!report || report.deleted)
      return res.status(404).json({ message: "Not found" });
    if (report.status !== "COMPLETED")
      return res.status(400).json({ message: "Report not ready" });
    return res.json({ result: report.result });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
};

// Serve the uploaded file to its owner
export const serveReportFile = async (req, res) => {
  try {
    const { id } = req.params;
    // Authenticate either with Authorization header (access token) or refresh cookie
    let userId = null;

    // Try access token first
    const auth = req.headers && req.headers.authorization;
    if (auth && auth.startsWith("Bearer ")) {
      try {
        const token = auth.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
      } catch (e) {
        // ignore and try refresh cookie
      }
    }

    // If no access token, try refresh cookie (browser will send this automatically)
    if (!userId && req.cookies && req.cookies.refreshToken) {
      try {
        const rt = req.cookies.refreshToken;
        const decoded = jwt.verify(rt, process.env.REFRESH_TOKEN_SECRET);
        // Ensure refresh token exists in DB for that user
        const user = await User.findOne({ _id: decoded.id, refreshToken: rt });
        if (user) userId = String(user._id);
      } catch (e) {
        // invalid refresh token
      }
    }

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const report = await Report.findById(id);
    if (!report || report.deleted)
      return res.status(404).json({ message: "Not found" });
    // ensure the requesting user owns this report
    if (String(report.user) !== String(userId)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (!report.filepath || !fs.existsSync(report.filepath)) {
      return res.status(404).json({ message: "File not found" });
    }
    // Serve the file (inline) using absolute path
    const abs = path.resolve(report.filepath);
    return res.sendFile(abs, (err) => {
      if (err) {
        console.error("Error sending file:", err);
        if (!res.headersSent) res.status(500).end();
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

// List reports for authenticated user
export const getMyReports = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const userId = req.user.id;
    const reports = await Report.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          deleted: { $ne: true },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    return res.json({ reports });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Server error" });
  }
};

// Soft-delete a report (mark deleted=true) — does not remove file from disk
export const softDeleteReport = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const { id } = req.params;
    const report = await Report.findById(id);
    if (!report) return res.status(404).json({ message: "Not found" });
    if (String(report.user) !== String(req.user.id)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (report.deleted)
      return res.status(400).json({ message: "Already deleted" });
    report.deleted = true;
    report.status = "DELETED";
    await report.save();
    return res.json({ message: "Report deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};
