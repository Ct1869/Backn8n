const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");

// ================== CONFIG ==================
const app = express();
app.use(express.json());
app.use(cors());

// ENV vars (set in Render dashboard)
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "password";

// MongoDB connection
mongoose.connect(
  "mongodb+srv://jmc_db_user:6RWm59mCrLGU20hP@phone-manager.rqeyqhc.mongodb.net/?retryWrites=true&w=majority&appName=phone-manager"
);

// ================== STATE LOOKUP ==================
const AREA_CODES = {
  212: "New York",
  213: "California",
  305: "Florida",
  312: "Illinois",
  415: "California",
  512: "Texas",
  617: "Massachusetts",
  702: "Nevada",
  713: "Texas",
  786: "Florida",
  917: "New York",
  929: "New York",
  // Add more area codes here…
};

function detectState(phoneNumber) {
  if (!phoneNumber.startsWith("+1")) return null; // only US
  const digits = phoneNumber.replace(/\D/g, "");
  const areaCode = digits.slice(1, 4); // first 3 digits after +1
  return AREA_CODES[areaCode] || "Unknown";
}

// ================== MONGOOSE SCHEMA ==================
const phoneSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true },
    mode: { type: String, enum: ["CALL", "OTP"], default: "CALL" },
    tags: { type: [String], default: [] },
    notes: { type: String, default: "" },
    state: { type: String, default: "Unknown" },
  },
  { timestamps: true }
);

const PhoneMode = mongoose.model("PhoneMode", phoneSchema);

// ================== AUTH MIDDLEWARE ==================
function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "Missing token" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Invalid token" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Forbidden" });
    req.user = user;
    next();
  });
}

// ================== ROUTES ==================

// Login
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "1h" });
  res.json({ token });
});

// Get all numbers
app.get("/numbers", authMiddleware, async (req, res) => {
  try {
    const allNumbers = await PhoneMode.find().sort({ createdAt: -1 });
    res.json(allNumbers);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch numbers" });
  }
});

// Add new number
app.post("/add-number", authMiddleware, async (req, res) => {
  try {
    const { number, mode, tags = [], notes = "" } = req.body;

    if (!number || !mode) {
      return res.status(400).json({ error: "Number and mode are required" });
    }

    const state = detectState(number);

    const newNumber = new PhoneMode({
      number,
      mode,
      tags,
      notes,
      state,
    });

    const saved = await newNumber.save();
    res.json(saved);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "Number already exists" });
    }
    res.status(500).json({ error: "Failed to add number" });
  }
});

// Update number
app.put("/update-number/:id", authMiddleware, async (req, res) => {
  try {
    const { mode, tags, notes } = req.body;
    const updated = await PhoneMode.findByIdAndUpdate(
      req.params.id,
      { mode, tags, notes },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Number not found" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update number" });
  }
});

// Delete number
app.delete("/delete-number/:id", authMiddleware, async (req, res) => {
  try {
    const deleted = await PhoneMode.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Number not found" });
    res.json({ message: "Deleted successfully", deleted });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete number" });
  }
});

// Stats
app.get("/stats", authMiddleware, async (req, res) => {
  try {
    const total = await PhoneMode.countDocuments();
    const callCount = await PhoneMode.countDocuments({ mode: "CALL" });
    const otpCount = await PhoneMode.countDocuments({ mode: "OTP" });

    const all = await PhoneMode.find();
    const uniqueTags = new Set(all.flatMap((n) => n.tags)).size;
    const uniqueStates = new Set(all.map((n) => n.state)).size;

    res.json({
      total,
      call: callCount,
      otp: otpCount,
      tags: uniqueTags,
      states: uniqueStates,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ================== SERVER ==================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
