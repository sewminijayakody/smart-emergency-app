// server.js
import "dotenv/config"; // ✅ MUST be first in ESM so env is ready before routes load

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import axios from "axios";
import multer from "multer";
import fs from "fs";
import FormData from "form-data";

// Import routes AFTER env is loaded
import authRoutes from "./routes/auth.js";
import emergencyRoutes from "./routes/emergency.js";
import locationRoutes from "./routes/location.js";

console.log("AWS KEY:", process.env.AWS_ACCESS_KEY_ID?.slice(0, 6));
console.log("AWS SECRET length:", process.env.AWS_SECRET_ACCESS_KEY?.length);
console.log("AWS BUCKET:", process.env.AWS_S3_BUCKET);
console.log("AWS REGION:", process.env.AWS_REGION);

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Multer only for Flask proxy
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 50 * 1024 * 1024 },
});

app.use("/api/auth", authRoutes);
app.use("/api/emergency", emergencyRoutes);
app.use("/api/location", locationRoutes);


// ===== FLASK AI PROXY ENDPOINT =====
app.post("/api/analyze_audio", upload.single("audio"), async (req, res) => {
  console.log("==============================");
  console.log("[DEBUG] /api/analyze_audio proxy called");

  const flaskUrl =
    process.env.NODE_ENV === "production"
      ? process.env.FLASK_URL ||
        "https://your-flask-server.onrender.com/api/analyze_audio"
      : process.env.FLASK_URL || "http://192.168.8.114:5001/api/analyze_audio";

  console.log("[DEBUG] Using Flask URL:", flaskUrl);

  try {
    if (!req.file) {
      console.error('[DEBUG] No file received in Node (field "audio")');
      return res.status(400).json({ msg: "No audio file uploaded to Node" });
    }

    // Build FormData to send to Flask
    const form = new FormData();
    form.append("audio", fs.createReadStream(req.file.path), {
      filename: req.file.originalname || "audio.m4a",
      contentType: req.file.mimetype || "audio/m4a",
    });

    const flaskResponse = await axios.post(flaskUrl, form, {
      headers: { ...form.getHeaders() },
      timeout: 30000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    console.log("[DEBUG] Flask responded:", flaskResponse.data);
    return res.status(flaskResponse.status).json(flaskResponse.data);
  } catch (err) {
    console.error("[DEBUG] Proxy error to Flask:", err.message);
    if (err.response) {
      return res.status(err.response.status).json({
        error: "AI analysis failed",
        details: err.response.data,
      });
    }
    return res.status(500).json({
      error: "AI analysis failed",
      details: err.message,
    });
  } finally {
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }
    console.log("==============================");
  }
});

// Root route
app.get("/", (req, res) => {
  res.json({
    message: "Smart Emergency Response System API is LIVE!",
    services: {
      auth: "/api/auth",
      emergency: "/api/emergency",
      ai: "/api/analyze_audio",
      health: "/api/health",
    },
    status: "healthy",
    url: "https://smart-emergency-app.onrender.com",
    environment: process.env.NODE_ENV || "development",
  });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
    flaskUrl:
      process.env.NODE_ENV === "production"
        ? process.env.FLASK_URL ||
          "https://your-flask-server.onrender.com/api/analyze_audio"
        : process.env.FLASK_URL || "http://192.168.8.114:5001/api/analyze_audio",
  });
});

// Connect DB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log("MongoDB Atlas connected successfully");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    setTimeout(connectDB, 5000);
  }
};
connectDB();

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`LIVE URL: https://smart-emergency-app.onrender.com`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`Flask URL: ${process.env.FLASK_URL}`);
});
