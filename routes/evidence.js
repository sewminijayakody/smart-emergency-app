// routes/evidence.js
import { Router } from "express";
import multer from "multer";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import auth from "../middleware/auth.js";
import { s3 } from "../utils/s3Client.js";
import User from "../models/User.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/evidence/upload
 * Private route. Accepts multipart/form-data with field name "audio"
 */
router.post("/upload", auth, upload.single("audio"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ msg: "No evidence file received" });
    }

    const bucket = process.env.AWS_S3_BUCKET;
    const region = process.env.AWS_REGION;

    if (!bucket || !region) {
      return res.status(500).json({
        msg: "S3 bucket/region not configured in env",
      });
    }

    // find user for folder name
    const user = await User.findById(req.user.id).select("email");
    const safeUser = (user?.email || req.user.id).replace(/[^a-zA-Z0-9_-]/g, "_");

    const ext = file.originalname?.split(".").pop() || "m4a";
    const key = `evidence/${safeUser}/${Date.now()}-${uuidv4()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype || "audio/m4a",
      // ❌ REMOVE ACL: bucket does not allow ACLs
    });

    await s3.send(command);

    const evidenceUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

    console.log("[Evidence] Uploaded to S3:", evidenceUrl);

    res.status(200).json({
      msg: "Evidence uploaded successfully",
      evidenceUrl,
      key,
    });
  } catch (err) {
    console.error("[Evidence] Upload failed:", err.message);
    res.status(500).json({
      msg: "Evidence upload failed",
      error: err.message,
    });
  }
});

export default router;
