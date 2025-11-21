import Tesseract from "tesseract.js";
import path from "path";
import fs from "fs";
import { promisify } from "util";
import { execFile } from "child_process";
import pdfParse from "pdf-parse";
const execFileAsync = promisify(execFile);

export async function extractTextFromImage(filePath) {
  const ext = path.extname(filePath || "").toLowerCase();
  // use a mutable variable for the PDF path so we can switch to a repaired copy
  let pdfToProcess = filePath;
  // If mock AI mode is enabled, skip heavy OCR/PDF tooling and return placeholder text
  try {
    const useMock = String(process.env.USE_MOCK_AI || "").toLowerCase();
    if (useMock === "true") {
      return "MOCK OCR TEXT";
    }
  } catch (e) {
    // ignore and continue
  }
  let tmpRepairDir = null;
  // If PDF, convert pages to PNG images using `pdftoppm` (part of Poppler)
  if (ext === ".pdf") {
    // First try to extract embedded text from the PDF (works for digital PDFs)
    try {
      const buffer = fs.readFileSync(pdfToProcess);
      const data = await pdfParse(buffer);
      const text = (data && data.text) || "";
      if (text && text.trim().length > 0) {
        return text;
      }
      // If extracted text is empty, fall through to image conversion (scanned PDF)
    } catch (parseErr) {
      // Non-fatal: try to repair the PDF when pdf-parse fails (bad XRef etc.)
      console.warn(
        "pdf-parse failed or returned no text, trying repair/convert fallbacks:",
        parseErr.message || parseErr
      );

      // Attempt to repair the PDF using available system tools (qpdf -> gs)
      tmpRepairDir = path.join(
        path.dirname(pdfToProcess),
        `pdf_repair_${Date.now()}`
      );
      fs.mkdirSync(tmpRepairDir, { recursive: true });
      const repairedPath = path.join(tmpRepairDir, "repaired.pdf");

      let repaired = false;
      try {
        // Try qpdf first (simple rewrite)
        try {
          await execFileAsync("qpdf", [pdfToProcess, repairedPath]);
          repaired = true;
        } catch (qerr) {
          if (qerr.code === "ENOENT") {
            // qpdf not found; fall through to gs
            console.warn("qpdf not found, will try Ghostscript (gs) next");
          } else {
            console.warn("qpdf failed to rewrite PDF:", qerr.message || qerr);
          }
        }

        // If qpdf didn't produce a repaired file, try Ghostscript
        if (!repaired) {
          try {
            await execFileAsync("gs", [
              "-o",
              repairedPath,
              "-sDEVICE=pdfwrite",
              "-dPDFSETTINGS=/prepress",
              pdfToProcess,
            ]);
            repaired = true;
          } catch (gerr) {
            if (gerr.code === "ENOENT") {
              console.warn("Ghostscript (gs) not found");
            } else {
              console.warn(
                "Ghostscript failed to rewrite PDF:",
                gerr.message || gerr
              );
            }
          }
        }

        if (repaired) {
          // Try pdf-parse again on repaired file
          try {
            const buffer2 = fs.readFileSync(repairedPath);
            const data2 = await pdfParse(buffer2);
            const text2 = (data2 && data2.text) || "";
            if (text2 && text2.trim().length > 0) {
              return text2;
            }
            // else fall through to pdftoppm conversion using repairedPath
            pdfToProcess = repairedPath;
          } catch (secondParseErr) {
            console.warn(
              "pdf-parse on repaired file failed, will attempt image conversion:",
              secondParseErr.message || secondParseErr
            );
            pdfToProcess = repairedPath;
          }
        }
      } finally {
        // keep tmpRepairDir around until conversion completes; it will be cleaned up later
      }
    }

    const tmpDir = path.join(
      path.dirname(pdfToProcess),
      `pdf_pages_${Date.now()}`
    );
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
      const outputPrefix = path.join(tmpDir, "page");
      try {
        // pdftoppm will create page-1.png, page-2.png, ... in tmpDir
        await execFileAsync("pdftoppm", ["-png", pdfToProcess, outputPrefix]);
      } catch (err) {
        if (err.code === "ENOENT") {
          // Provide platform-specific installation hints
          const platform = process.platform;
          let hint = "";
          if (platform === "win32") {
            hint =
              "On Windows install Poppler (e.g. via Chocolatey: `choco install poppler -y`) and ensure `pdftoppm` is on PATH.";
          } else if (platform === "darwin") {
            hint =
              "On macOS install Poppler via Homebrew: `brew install poppler`.";
          } else {
            hint =
              "On Debian/Ubuntu install `poppler-utils`: `sudo apt update && sudo apt install -y poppler-utils`.";
          }
          throw new Error(
            `Required binary \`pdftoppm\` not found. ${hint} (Original error: ${err.message})`
          );
        }
        throw new Error(`PDF conversion failed: ${err.message}`);
      }

      const files = fs
        .readdirSync(tmpDir)
        .filter((f) => f.toLowerCase().endsWith(".png"));
      files.sort();
      if (files.length === 0)
        throw new Error("PDF conversion produced no images");

      // OCR each page and concatenate
      let combined = "";
      for (const file of files) {
        const imgPath = path.join(tmpDir, file);
        try {
          const {
            data: { text },
          } = await Tesseract.recognize(imgPath, "eng", { logger: () => {} });
          combined += text + "\n";
        } catch (ocrErr) {
          throw new Error(
            `OCR failed for page ${file}: ${ocrErr.message || ocrErr}`
          );
        }
      }
      return combined;
    } finally {
      // cleanup tmp dir
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (ignore) {}
      // cleanup tmpRepairDir if created
      try {
        if (tmpRepairDir)
          fs.rmSync(tmpRepairDir, { recursive: true, force: true });
      } catch (ignore) {}
    }
  }

  try {
    const {
      data: { text },
    } = await Tesseract.recognize(filePath, "eng", {
      logger: (m) => {
        // optional logger: console.log(m)
      },
    });
    return text;
  } catch (err) {
    // Provide clearer error message to the caller and avoid crashing the whole process
    const message = err?.message || String(err);
    throw new Error(`OCR failed: ${message}`);
  }
}
