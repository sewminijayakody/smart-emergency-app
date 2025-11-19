import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import multer from 'multer';
import fs from 'fs';
import FormData from 'form-data';

// Load env vars
dotenv.config();

const app = express();

// JSON for normal APIs
app.use(express.json());

// CORS (needed for Expo / mobile)
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// --- Multer for audio uploads (stored in temp folder) ---
const upload = multer({
  dest: 'uploads/', // temp folder; we delete after proxying
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

// Import routes
import authRoutes from './routes/auth.js';
import emergencyRoutes from './routes/emergency.js';

app.use('/api/auth', authRoutes);
app.use('/api/emergency', emergencyRoutes);

// ===== FLASK AI PROXY ENDPOINT =====
app.post('/api/analyze_audio', upload.single('audio'), async (req, res) => {
  console.log('==============================');
  console.log('[DEBUG] /api/analyze_audio proxy called');

  let flaskUrl;
  if (process.env.NODE_ENV === 'production') {
    flaskUrl =
      process.env.FLASK_URL ||
      'https://your-flask-server.onrender.com/api/analyze_audio';
  } else {
    // local dev -> your Flask is on 5001
    flaskUrl = process.env.FLASK_URL || 'http://localhost:5001/api/analyze_audio';
  }

  console.log('[DEBUG] Using Flask URL:', flaskUrl);

  try {
    if (!req.file) {
      console.error('[DEBUG] No file received in Node (field "audio")');
      return res.status(400).json({ msg: 'No audio file uploaded to Node' });
    }

    console.log('[DEBUG] Node received file:');
    console.log('  fieldname:', req.file.fieldname);
    console.log('  originalname:', req.file.originalname);
    console.log('  mimetype:', req.file.mimetype);
    console.log('  size:', req.file.size, 'bytes');
    console.log('  path:', req.file.path);

    // Build FormData to send to Flask
    const form = new FormData();
    form.append('audio', fs.createReadStream(req.file.path), {
      filename: req.file.originalname || 'audio.m4a',
      contentType: req.file.mimetype || 'audio/m4a',
    });

    // Forward to Flask
    const flaskResponse = await axios.post(flaskUrl, form, {
      headers: {
        ...form.getHeaders(),
      },
      timeout: 30000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    console.log('[DEBUG] Flask responded with status:', flaskResponse.status);
    console.log('[DEBUG] Flask response data:', flaskResponse.data);

    return res.status(flaskResponse.status).json(flaskResponse.data);
  } catch (err) {
    console.error('[DEBUG] Proxy error to Flask:', err.message);
    if (err.response) {
      console.error('[DEBUG] Flask error status:', err.response.status);
      console.error('[DEBUG] Flask error data:', err.response.data);
      return res.status(err.response.status).json({
        error: 'AI analysis failed',
        details: err.response.data,
      });
    } else {
      return res.status(500).json({
        error: 'AI analysis failed',
        details: err.message,
      });
    }
  } finally {
    // Cleanup temp file
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (unlinkErr) => {
        if (unlinkErr) {
          console.warn('[DEBUG] Failed to delete temp file:', unlinkErr.message);
        } else {
          console.log('[DEBUG] Temp file deleted:', req.file.path);
        }
      });
    }
    console.log('==============================');
  }
});

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Smart Emergency Response System API is LIVE!',
    services: {
      auth: '/api/auth',
      emergency: '/api/emergency',
      ai: '/api/analyze_audio',
      health: '/api/health',
    },
    status: 'healthy',
    url: 'https://smart-emergency-app.onrender.com',
    environment: process.env.NODE_ENV || 'development',
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    flaskUrl:
      process.env.NODE_ENV === 'production'
        ? process.env.FLASK_URL ||
          'https://your-flask-server.onrender.com/api/analyze_audio'
        : process.env.FLASK_URL || 'http://localhost:5001/api/analyze_audio',
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[ERROR] Unhandled error:', err.message);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Connect to MongoDB with retry logic
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('MongoDB Atlas connected successfully');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    setTimeout(connectDB, 5000); // Retry every 5 seconds
  }
};

connectDB();

// Listen on PORT 5000 for local dev
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`LIVE URL: https://smart-emergency-app.onrender.com`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(
    `Flask URL: ${
      process.env.NODE_ENV === 'production'
        ? process.env.FLASK_URL ||
          'https://your-flask-server.onrender.com/api/analyze_audio'
        : process.env.FLASK_URL || 'http://localhost:5001/api/analyze_audio'
    }`
  );
});
