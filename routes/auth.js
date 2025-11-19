// routes/auth.js
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js"; // Use import for User model
import auth from "../middleware/auth.js"; // 🔥 import auth middleware

const router = express.Router();

// --------------------------------------
// Register new user
// --------------------------------------
router.post("/register", async (req, res) => {
  const { name, email, password, phone } = req.body;
  try {
    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: "User already exists" });
    }
    user = new User({ name, email, password, phone });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    await user.save();

    // Create JWT
    const payload = { user: { id: user.id } };
    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
      (err, token) => {
        if (err) throw err;
        res.json({ token });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// --------------------------------------
// Login user
// --------------------------------------
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    // Check if user exists
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: "Invalid Credentials" });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: "Invalid Credentials" });
    }

    // Create JWT
    const payload = { user: { id: user.id } };
    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
      (err, token) => {
        if (err) throw err;
        res.json({ token });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// --------------------------------------
// 🔥 Get current user profile
// @route  GET /api/auth/me
// @access Private
// --------------------------------------
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }
    res.json(user);
  } catch (err) {
    console.error("GET /me error:", err.message);
    res.status(500).send("Server error");
  }
});

// --------------------------------------
// 🔥 Update current user profile (name, phone)
// @route  PUT /api/auth/me
// @access Private
// --------------------------------------
router.put("/me", auth, async (req, res) => {
  try {
    const { name, phone } = req.body || {};

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    if (typeof name === "string" && name.trim() !== "") {
      user.name = name.trim();
    }

    if (typeof phone === "string") {
      user.phone = phone.trim();
    }

    await user.save();

    // Return updated profile without password
    const sanitized = await User.findById(user._id).select("-password");
    res.json(sanitized);
  } catch (err) {
    console.error("PUT /me error:", err.message);
    res.status(500).send("Server error");
  }
});

// --------------------------------------
// 🔥 Get emergency contacts
// @route  GET /api/auth/emergency-contacts
// @access Private
// --------------------------------------
router.get("/emergency-contacts", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("emergencyContacts");
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }
    res.json(user.emergencyContacts || []);
  } catch (err) {
    console.error("GET /emergency-contacts error:", err.message);
    res.status(500).send("Server error");
  }
});

// --------------------------------------
// 🔥 Add new emergency contact
// @route  POST /api/auth/emergency-contacts
// @access Private
// --------------------------------------
router.post("/emergency-contacts", auth, async (req, res) => {
  try {
    const { name, phone, relationship } = req.body;

    if (!name || !phone) {
      return res
        .status(400)
        .json({ msg: "Name and phone are required for a contact" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    user.emergencyContacts.push({ name, phone, relationship });
    await user.save();

    res.status(201).json(user.emergencyContacts);
  } catch (err) {
    console.error("POST /emergency-contacts error:", err.message);
    res.status(500).send("Server error");
  }
});

// --------------------------------------
// 🔥 Update emergency contact
// @route  PUT /api/auth/emergency-contacts/:id
// @access Private
// --------------------------------------
router.put("/emergency-contacts/:id", auth, async (req, res) => {
  try {
    const contactId = req.params.id;
    const { name, phone, relationship } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    const contact = user.emergencyContacts.id(contactId);
    if (!contact) {
      return res.status(404).json({ msg: "Contact not found" });
    }

    if (name !== undefined) contact.name = name;
    if (phone !== undefined) contact.phone = phone;
    if (relationship !== undefined) contact.relationship = relationship;

    await user.save();

    res.json(user.emergencyContacts);
  } catch (err) {
    console.error("PUT /emergency-contacts error:", err.message);
    res.status(500).send("Server error");
  }
});

// --------------------------------------
// 🔥 Delete emergency contact
// @route  DELETE /api/auth/emergency-contacts/:id
// @access Private
// --------------------------------------
router.delete("/emergency-contacts/:id", auth, async (req, res) => {
  try {
    const contactId = req.params.id;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    const contact = user.emergencyContacts.id(contactId);
    if (!contact) {
      return res.status(404).json({ msg: "Contact not found" });
    }

    contact.remove();
    await user.save();

    res.json(user.emergencyContacts);
  } catch (err) {
    console.error("DELETE /emergency-contacts error:", err.message);
    res.status(500).send("Server error");
  }
});

// --------------------------------------
// 🔥 Register push notification token (FCM)
// @route  POST /api/auth/register-push-token
// @access Private
// --------------------------------------
router.post("/register-push-token", auth, async (req, res) => {
  try {
    const { pushToken } = req.body || {};

    if (!pushToken) {
      return res.status(400).json({ msg: "pushToken is required" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    user.pushToken = pushToken;
    await user.save();

    console.log("[FCM] Registered push token for user:", user.email);

    res.json({ msg: "Push token registered successfully" });
  } catch (err) {
    console.error("POST /register-push-token error:", err.message);
    res.status(500).send("Server error");
  }
});

export default router; // Use export default for the router
