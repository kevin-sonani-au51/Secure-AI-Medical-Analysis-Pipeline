import express from "express";
import { uploadSingle } from "../middleware/upload.js";
import {
  uploadReport,
  getReportStatus,
  getReportResult,
  serveReportFile,
  getMyReports,
  softDeleteReport,
} from "../controllers/reportController.js";
import authenticateJWT from "../middleware/jwtauth.js"; // your existing auth middleware

const router = express.Router();

router.post("/upload", authenticateJWT, uploadSingle, uploadReport);
router.get("/", authenticateJWT, getMyReports); // list reports for user
router.get("/status/:id", authenticateJWT, getReportStatus);
router.get("/result/:id", authenticateJWT, getReportResult);
// Allow the controller to authenticate via refresh cookie or access token when serving file
router.get("/file/:id", serveReportFile);
router.delete("/:id", authenticateJWT, softDeleteReport);

export default router;
