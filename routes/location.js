// routes/location.js
import { Router } from "express";
import auth from "../middleware/auth.js";
import DangerZone from "../models/DangerZone.js";

const router = Router();

// Haversine distance in meters
function distanceInMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius (m)
  const toRad = (v) => (v * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * POST /api/location/assess
 * Body: { latitude: number, longitude: number }
 * Auth: Bearer token
 */
router.post("/assess", auth, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return res.status(400).json({
        msg: "latitude and longitude (numbers) are required",
      });
    }

    // Load active danger zones
    let zones = await DangerZone.find({ active: true }).lean();

    // Fallback: if DB empty, use a small in-memory example so it still works
    if (!zones.length) {
      zones = [
        {
          _id: "demo-zone-1",
          name: "Demo High-Risk Area",
          center: { lat: latitude + 0.005, lng: longitude + 0.005 },
          radiusMeters: 400,
          riskLevel: "DANGER",
          description:
            "Example zone. Replace this with real data in MongoDB.",
        },
      ];
    }

    const activeZones = [];
    let nearestZone = null;
    let nearestDistance = Infinity;

    for (const z of zones) {
      const d = distanceInMeters(
        latitude,
        longitude,
        z.center.lat,
        z.center.lng
      );

      if (d <= z.radiusMeters) {
        activeZones.push({
          id: z._id?.toString() || z.id || z.name,
          name: z.name,
          riskLevel: z.riskLevel,
          description: z.description || "",
          center: z.center,
          radiusMeters: z.radiusMeters,
          distanceMeters: d,
        });
      }

      if (d < nearestDistance) {
        nearestDistance = d;
        nearestZone = z;
      }
    }

    // Aggregate risk level
    let riskLevel = "SAFE";
    if (activeZones.some((z) => z.riskLevel === "DANGER")) {
      riskLevel = "DANGER";
    } else if (activeZones.some((z) => z.riskLevel === "CAUTION")) {
      riskLevel = "CAUTION";
    }

    return res.json({
      riskLevel,
      activeZones,
      nearestZone: nearestZone
        ? {
            id: nearestZone._id?.toString() || nearestZone.id || nearestZone.name,
            name: nearestZone.name,
            center: nearestZone.center,
            radiusMeters: nearestZone.radiusMeters,
            riskLevel: nearestZone.riskLevel,
            distanceMeters: nearestDistance,
          }
        : null,
      userLocation: { latitude, longitude },
    });
  } catch (err) {
    console.error("❌ /api/location/assess error:", err.message);
    return res.status(500).json({
      msg: "Failed to assess location safety",
      error: err.message,
    });
  }
});

export default router;
