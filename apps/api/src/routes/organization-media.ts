import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

// ✅ ensure uploads folder exists
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ✅ disk storage so req.file.filename is NOT undefined
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
    const base = path
      .basename(file.originalname || "logo", ext)
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .slice(0, 40);

    const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    cb(null, `org-logo-${base}-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

router.post("/logo", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });


  const storedName = req.file.filename; // e.g. org-logo-dwf-123.png
  const url = `/uploads/${storedName}`;

  const media = await prisma.media.create({
    data: {
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: storedName, 
      url,              
    },
  });

  res.json({ mediaId: media.id, url: media.url });
});

export default router;
