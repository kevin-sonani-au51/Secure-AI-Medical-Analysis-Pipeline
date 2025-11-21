import multer from "multer";
import path from "path";
import fs from "fs";

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, name);
  },
});

// Accept images and PDFs. PDFs will be converted to images for OCR later.
const fileFilter = (req, file, cb) => {
  const allowed = [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/tiff",
    "application/pdf",
  ];
  if (!allowed.includes(file.mimetype)) {
    req.fileValidationError =
      "Only image or PDF uploads are allowed (png, jpg, jpeg, tiff, pdf).";
    return cb(null, false);
  }
  cb(null, true);
};

export const uploadSingle = multer({ storage, fileFilter }).single("file");
