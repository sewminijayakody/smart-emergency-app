// models/DangerZone.js
import mongoose from "mongoose";

const DangerZoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    center: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    radiusMeters: { type: Number, required: true }, // geofence radius
    riskLevel: {
      type: String,
      enum: ["SAFE", "CAUTION", "DANGER"],
      default: "CAUTION",
    },
    description: { type: String },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("DangerZone", DangerZoneSchema);
