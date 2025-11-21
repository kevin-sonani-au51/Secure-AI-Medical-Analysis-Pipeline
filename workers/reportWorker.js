import Agenda from "agenda";
import Report from "../models/report.js";
import { extractTextFromImage } from "../utils/ocr.js";
import { callOpenAIExtract } from "../utils/ai.js";

let agenda = null;

function defineJobs(ag) {
  ag.define("process-report", { concurrency: 1 }, async (job) => {
    const { reportId } = job.attrs.data;
    const report = await Report.findById(reportId);
    if (!report) return;

    report.status = "PROCESSING";
    await report.save();

    try {
      // If mock AI is enabled, skip OCR and external binaries and return a deterministic result
      try {
        const useMock = String(process.env.USE_MOCK_AI || "").toLowerCase();
        if (useMock === "true") {
          const resultJson = {
            patient_name: "[REDACTED]",
            blood_sugar: { value: 95, unit: "mg/dL", status: "Normal" },
            cholesterol: { value: 210, unit: "mg/dL", status: "High" },
          };
          report.status = "COMPLETED";
          report.result = resultJson;
          await report.save();
          return;
        }
      } catch (e) {
        // ignore and continue to regular processing
      }

      // Step 1: OCR
      const rawText = await extractTextFromImage(report.filepath);

      // Step 2: PII Redaction
      let redacted = rawText;

      // Redact phone numbers (common patterns)
      redacted = redacted.replace(
        /\b\+?\d{1,4}[\s\-\.]?\(?\d{2,4}\)?[\s\-\.]?\d{2,4}[\s\-\.]?\d{2,4}\b/g,
        "[REDACTED]"
      );
      // Attempt to redact lines like "Name: John Doe"
      redacted = redacted.replace(
        /Name\s*[:\-]\s*[A-Za-z ,.'-]+/gi,
        "Name: [REDACTED]"
      );

      // Step 3: AI Analysis (OpenAI)
      const resultJson = await callOpenAIExtract(redacted);

      // Step 4: Save result
      report.status = "COMPLETED";
      report.result = resultJson;
      await report.save();
    } catch (err) {
      console.error("Worker error:", err);
      report.status = "FAILED";
      report.error = err.message;
      await report.save();
    }
  });
}

export async function startAgenda(
  mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI
) {
  try {
    if (!mongoUri) {
      console.error(
        "startAgenda: no Mongo URI provided (process.env.MONGO_URI or process.env.MONGODB_URI is missing)"
      );
      return;
    }

    // Create Agenda instance after we have a proper Mongo URI
    agenda = new Agenda({
      db: { address: mongoUri, collection: "agendaJobs" },
      processEvery: "5 seconds",
    });

    defineJobs(agenda);

    await agenda.start();
    console.log("Agenda connected & started");
  } catch (error) {
    console.error("Agenda startup error:", error);
  }
}

export async function scheduleReportJob(reportId) {
  if (!agenda) throw new Error("Agenda not initialized");
  return agenda.now("process-report", { reportId });
}

export function getAgenda() {
  return agenda;
}
