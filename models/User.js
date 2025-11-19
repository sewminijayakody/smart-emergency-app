// models/User.js
import mongoose from 'mongoose'; // Use import for mongoose

// Emergency contact sub-schema (no separate _id for each)
const EmergencyContactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    relationship: { type: String },
  },
  { _id: false }
);

// Define the User schema
const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  // Password (hashed)
  password: {
    type: String,
    required: true,
  },
  // OPTIONAL phone number
  phone: {
    type: String,
  },
  // Emergency contacts list
  emergencyContacts: [EmergencyContactSchema],

  // 🔥 FCM / device push token
  pushToken: {
    type: String,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Export the model based on the schema using ES modules
export default mongoose.model('User', UserSchema);
