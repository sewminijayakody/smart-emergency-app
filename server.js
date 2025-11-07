import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

// Load env vars
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({
  origin: true, // Allows all origins (critical for Expo apps)
  credentials: true
}));

// Import routes
import authRoutes from './routes/auth.js';
import emergencyRoutes from './routes/emergency.js';

app.use('/api/auth', authRoutes);
app.use('/api/emergency', emergencyRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Smart Emergency Response System API is LIVE!',
    services: {
      auth: '/api/auth',
      emergency: '/api/emergency',
      health: '/api/health'
    },
    status: 'healthy',
    url: 'https://smart-emergency-app.onrender.com'
  });
});

// Health check (Render loves this)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// CRITICAL: Connect to MongoDB with retry logic
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

// CRITICAL: Use Render's PORT + bind to 0.0.0.0
const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`LIVE URL: https://smart-emergency-app.onrender.com`);
});