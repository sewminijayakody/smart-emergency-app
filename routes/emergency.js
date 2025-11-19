// routes/emergency.js
import { Router } from "express";
import auth from "../middleware/auth.js";            // Auth middleware
import Emergency from "../models/Emergency.js";      // Emergency model
import User from "../models/User.js";                // 🔥 User model
import admin from "../firebaseAdmin.js";             // 🔥 Firebase Admin (FCM)

const router = Router();

/**
 * -------------------------------------------------------------------
 * OLD ENDPOINT (kept for compatibility)
 * @route   POST /api/emergency
 * @desc    Trigger an emergency alert (legacy)
 * @access  Private
 * -------------------------------------------------------------------
 */
router.post("/", auth, async (req, res) => {
  const { lat, lng, evidenceUrl } = req.body;

  try {
    const newEmergency = new Emergency({
      user: req.user.id, // set by auth middleware
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
 * -------------------------------------------------------------------
 * NEW ENDPOINT FOR MOBILE APP
 * @route   POST /api/emergency/sos
 * @desc    SOS from mobile app (HomeScreen)
 * @access  Private (requires Bearer token)
 *
 * HomeScreen is sending:
 *  {
 *    latitude: <number>,
 *    longitude: <number>,
 *    timestamp: <ISO string>,
 *    userId: <phone or id>,
 *    evidenceUrl?: <string>
 *  }
 * -------------------------------------------------------------------
 */
router.post("/sos", auth, async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      timestamp,
      userId,
      evidenceUrl, // optional, for future media evidence
    } = req.body || {};

    // Basic validation
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return res.status(400).json({
        msg: "latitude and longitude (number) are required",
      });
    }

    // Load user with contacts + push token
    const user = await User.findById(req.user.id).select(
      "name email phone emergencyContacts pushToken"
    );

    console.log("🚨 Incoming SOS from mobile:");
    console.log(" - Auth user ID:", req.user?.id || "unknown");
    console.log(" - User email:", user?.email || "unknown");
    console.log(" - Payload userId:", userId || "not provided");
    console.log(" - Lat:", latitude, "Lng:", longitude);
    console.log(" - Time:", timestamp || new Date().toISOString());

    if (user?.emergencyContacts?.length) {
      console.log("📇 Intended emergency contacts for this SOS:");
      user.emergencyContacts.forEach((c, idx) => {
        console.log(
          `  [${idx + 1}] ${c.name} (${c.phone})` +
            (c.relationship ? ` - ${c.relationship}` : "")
        );
      });
    } else {
      console.log("⚠️ No emergency contacts configured for this user.");
    }

    // Map to your existing Emergency schema
    const newEmergency = new Emergency({
      user: req.user?.id || userId || null, // prefer authed user, fall back to payload
      location: {
        lat: latitude,
        lng: longitude,
      },
      evidenceUrl: evidenceUrl || null,
      // Extra fields (ignored if not in schema strict mode)
      triggeredAt: timestamp || new Date().toISOString(),
      source: "MOBILE_SOS",
    });

    await newEmergency.save();

    // 🔥 Send FCM push notification to the user's device (if token available)
    if (user?.pushToken && admin?.apps?.length) {
      try {
        const title = "🚨 SOS Triggered";
        const body = `${
          user.name || "A user"
        } triggered an SOS at (${latitude.toFixed(4)}, ${longitude.toFixed(
          4
        )}).`;

        await admin.messaging().send({
          token: user.pushToken,
          notification: {
            title,
            body,
          },
          data: {
            emergencyId: newEmergency._id.toString(),
            latitude: String(latitude),
            longitude: String(longitude),
            timestamp: timestamp || new Date().toISOString(),
          },
        });

        console.log("✅ Push notification sent to user's device via FCM.");
      } catch (pushErr) {
        console.error(
          "❌ Failed to send push notification:",
          pushErr.message
        );
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
