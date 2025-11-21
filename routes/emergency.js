// routes/emergency.js
import { Router } from "express";
import auth from "../middleware/auth.js";
import Emergency from "../models/Emergency.js";
import User from "../models/User.js";
import admin from "../firebaseAdmin.js";

// AWS S3 (SDK v3)
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import multer from "multer";
import path from "path";
import crypto from "crypto";

const router = Router();

// ==============================
// S3 CLIENT SETUP
// ==============================
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

// Multer memory storage (no temp files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

// ==============================
// EVIDENCE UPLOAD ROUTE
// POST /api/emergency/upload-evidence
// Private (Bearer token)
// Field name: "evidence"
// ==============================
router.post(
  "/upload-evidence",
  auth,
  upload.single("evidence"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ msg: "No evidence file uploaded" });
      }

      const bucket = process.env.AWS_S3_BUCKET;
      const region = process.env.AWS_REGION;

      if (!bucket || !region) {
        return res.status(500).json({ msg: "AWS bucket/region not set" });
      }

      const ext =
        path.extname(req.file.originalname) ||
        (req.file.mimetype.includes("audio") ? ".m4a" : ".bin");

      const randomId = crypto.randomBytes(8).toString("hex");
      const key = `evidence/${req.user.id}/${Date.now()}_${randomId}${ext}`;

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        // ❌ DO NOT set ACL here (bucket disallows ACLs)
      });

      await s3.send(command);

      const evidenceUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

      console.log("✅ Evidence uploaded to S3:", evidenceUrl);

      return res.json({ evidenceUrl, key });
    } catch (err) {
      console.error("❌ upload-evidence error:", err.message);
      return res.status(500).json({
        msg: "Evidence upload failed",
        error: err.message,
      });
    }
  }
);

/**
 * OLD ENDPOINT (kept for compatibility)
 * POST /api/emergency
 */
router.post("/", auth, async (req, res) => {
  const { lat, lng, evidenceUrl } = req.body;

  try {
    const newEmergency = new Emergency({
      user: req.user.id,
      location: { lat, lng },
      evidenceUrl,
    });

    await newEmergency.save();
    return res.json({ msg: "Emergency alert sent successfully!" });
  } catch (err) {
    console.error("❌ /api/emergency error:", err.message);
    return res.status(500).send("Server Error");
  }
});

/**
 * NEW SOS ENDPOINT
 * POST /api/emergency/sos
 */
router.post("/sos", auth, async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      timestamp,
      userId,
      evidenceUrl,
      mode,
      source,
    } = req.body || {};

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return res.status(400).json({
        msg: "latitude and longitude (number) are required",
      });
    }

    const user = await User.findById(req.user.id).select(
      "name email phone emergencyContacts pushToken"
    );

    console.log("🚨 Incoming SOS from mobile:");
    console.log(" - Auth user ID:", req.user?.id || "unknown");
    console.log(" - User email:", user?.email || "unknown");
    console.log(" - Payload userId:", userId || "not provided");
    console.log(" - Lat:", latitude, "Lng:", longitude);
    console.log(" - Time:", timestamp || new Date().toISOString());
    console.log(" - Evidence URL:", evidenceUrl || "none");
    console.log(" - Mode:", mode || "NORMAL");
    console.log(" - Source:", source || "MOBILE_SOS");

    const newEmergency = new Emergency({
      user: req.user?.id || userId || null,
      location: { lat: latitude, lng: longitude },
      evidenceUrl: evidenceUrl || null,
      triggeredAt: timestamp || new Date().toISOString(),
      source: source || "MOBILE_SOS",
      mode: mode || "NORMAL", // will be ignored if not in schema (Mongoose strict)
    });

    await newEmergency.save();

    // FCM PUSH (already working)
    if (user?.pushToken && admin?.apps?.length) {
      try {
        const isDiscreet = mode === "DISCREET";
        const title = isDiscreet
          ? "🚨 Discreet SOS Triggered"
          : "🚨 SOS Triggered";

        const body = `${
          user.name || "A user"
        } triggered an SOS ${
          isDiscreet ? "(discreet mode) " : ""
        }at (${latitude.toFixed(4)}, ${longitude.toFixed(4)}).`;

        await admin.messaging().send({
          token: user.pushToken,
          notification: { title, body },
          data: {
            emergencyId: newEmergency._id.toString(),
            latitude: String(latitude),
            longitude: String(longitude),
            timestamp: timestamp || new Date().toISOString(),
            evidenceUrl: evidenceUrl || "",
            mode: mode || "NORMAL",
            source: source || "MOBILE_SOS",
          },
        });

        console.log("✅ Push notification sent to user's device via FCM.");
      } catch (pushErr) {
        console.error("❌ Failed to send push notification:", pushErr.message);
      }
    } else {
      console.log(
        "⚠️ No pushToken configured or Firebase Admin not initialized; skipping FCM push."
      );
    }

    return res.status(200).json({
      msg: "SOS received successfully",
      data: {
        id: newEmergency._id,
        latitude,
        longitude,
        timestamp: timestamp || new Date().toISOString(),
        userId: req.user?.id || userId || null,
        evidenceUrl: evidenceUrl || null,
        mode: mode || "NORMAL",
        source: source || "MOBILE_SOS",
      },
    });
  } catch (err) {
    console.error("❌ /api/emergency/sos error:", err.message);
    return res.status(500).json({
      msg: "Failed to process SOS",
      error: err.message,
    });
  }
});

export default router;
