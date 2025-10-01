import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

// Initialize dotenv to load environment variables
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Import and use routes
import authRoutes from './routes/auth.js';
app.use('/api/auth', authRoutes);

// Import emergency routes
import emergencyRoutes from './routes/emergency.js';
app.use('/api/emergency', emergencyRoutes);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.log(err));

// Basic route
app.get('/', (req, res) => {
    res.json({
        message: 'Smart Emergency Response System API is running!',
        services: {
            auth: '/api/auth',
            emergency: '/api/emergency'
        },
        status: 'healthy'
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'node-server',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// CHANGED PORT TO 5000 (Node.js server)
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Node.js Server started on port ${PORT}`);
    console.log(`Available at: http://0.0.0.0:${PORT}`);
});