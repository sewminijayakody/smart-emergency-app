import { Router } from "express";
import auth from "../middleware/auth.js"; // Import auth middleware
import Emergency from "../models/Emergency.js"; // Import Emergency model

const router = Router();

// @route   POST api/emergency
// @desc    Trigger an emergency alert
// @access  Private
router.post("/", auth, async (req, res) => {
  const { lat, lng, evidenceUrl } = req.body;
  try {
    const newEmergency = new Emergency({
      user: req.user.id, // Assuming that user is attached to the request by your auth middleware
      location: { lat, lng },
      evidenceUrl,
    });

    await newEmergency.save();
    res.json({ msg: "Emergency alert sent successfully!" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

export default router; // Export router for use in server.js
