import mongoose from 'mongoose'; // Use import for mongoose
import { Router } from 'express'; // Use import for express Router

// Define the Emergency schema
const EmergencySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  location: {
    type: {
      lat: Number,
      lng: Number
    },
    required: true
  },
  evidenceUrl: {
    type: String // URL of uploaded video/audio/image in S3 or Firebase
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Export the model based on the schema using ES modules
export default mongoose.model('Emergency', EmergencySchema);
