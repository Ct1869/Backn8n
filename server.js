// server.js
// Phone Manager Backend — secure + tags + notes + state auto-detect

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();

// ---------- Config ----------
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://jmc_db_user:6RWm59mCrLGU20hP@phone-manager.rqeyqhc.mongodb.net/?retryWrites=true&w=majority&appName=phone-manager";
// IMPORTANT: set ADMIN_PASSWORD & JWT_SECRET in your environment
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me";
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-change-me";

// ---------- Middleware ----------
app.use(express.json());
app.use(cors());

// ---------- DB ----------
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ---------- Schema ----------
const phoneSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true },
    mode: { type: String, enum: ["CALL", "OTP"], default: "CALL" },
    tags: { type: [String], default: [] },
    notes: { type: String, default: "" },
    state: { type: String, default: "Unknown" }, // Full state name (e.g., "Texas")
  },
  { timestamps: true }
);

const PhoneMode = mongoose.model("PhoneMode", phoneSchema);

// ---------- Area Code → State ----------
const areaCodeToState = require("./areaCodes.json");

// Extract state from E.164 or raw US number
function detectState(number) {
  const digits = (number || "").replace(/\D/g, "");
  if (digits.length >= 10) {
    const area = digits.slice(-10, -7);
    return areaCodeToState[area] || { state: "Unknown", abbr: "UNK" };
  }
  return { state: "Unknown", abbr: "UNK" };
}

// ---------- Auth ----------
function auth(req, res, next) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

app.post("/login", (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: "Password required" });
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Invalid credentials" });
  const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { role: "admin" } });
});

// ---------- Seed ----------
const seedNumbers = [
  { number: "+17753055823", mode: "CALL" },
  { number: "+16693454835", mode: "CALL" },
  { number: "+19188183039", mode: "CALL" },
  { number: "+15088127382", mode: "CALL" },
  { number: "+18722965039", mode: "CALL" },
  { number: "+14172218933", mode: "CALL" },
  { number: "+19191919191", mode: "OTP" }
];
(async function seedDB() {
  try {
    for (const num of seedNumbers) {
      const stateObj = detectState(num.number);
      await PhoneMode.updateOne(
        { number: num.number },
        { $set: { mode: num.mode, state: stateObj.state }, $setOnInsert: { tags: [], notes: "" } },
        { upsert: true }
      );
    }
    console.log("✅ Seeded base numbers");
  } catch (err) {
    console.error("❌ Error seeding DB:", err);
  }
})();

// ---------- Helpers ----------
function normalize(num) {
  return (num || "").toString().trim();
}

// ---------- Public endpoints ----------
app.post("/lookup", async (req, res) => {
  try {
    const called = normalize(req.body.Called || req.query.Called || req.body.To || req.query.To);
    const found = await PhoneMode.findOne({ number: called });
    res.json({
      calledNumber: called,
      mode: found ? found.mode : "UNKNOWN",
      from: req.body.From || req.query.From,
      callSid: req.body.CallSid || req.query.CallSid
    });
  } catch (err) {
    console.error("❌ /lookup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/health", async (req, res) => {
  try {
    await mongoose.connection.db.admin().ping();
    res.json({ status: "healthy", database: "connected", timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: "unhealthy", database: "disconnected", error: err.message });
  }
});

// ---------- Authenticated API ----------
app.get("/numbers", auth, async (req, res) => {
  try {
    const all = await PhoneMode.find().sort({ createdAt: -1 });
    res.json(all);
  } catch (err) {
    console.error("❌ /numbers error:", err);
    res.status(500).json({ error: "Failed to fetch numbers" });
  }
});

app.post("/add-number", auth, async (req, res) => {
  try {
    const { number, mode, tags = [], notes = "", state } = req.body;
    if (!number || !mode) return res.status(400).json({ error: "Number and mode are required" });
    if (!["CALL", "OTP"].includes(mode)) return res.status(400).json({ error: "Mode must be CALL or OTP" });

    const normalized = normalize(number);
    if (!normalized) return res.status(400).json({ error: "Invalid number format" });

    const exists = await PhoneMode.findOne({ number: normalized });
    if (exists) return res.status(400).json({ error: "Number already exists" });

    const stateObj = detectState(normalized);
    const finalState = state || stateObj.state;

    const saved = await new PhoneMode({
      number: normalized,
      mode,
      tags: Array.isArray(tags) ? tags : [],
      notes: typeof notes === "string" ? notes : "",
      state: finalState
    }).save();

    console.log("✅ Added:", saved.number, saved.mode, saved.state);
    res.json({ success: true, message: "Number added successfully", data: saved });
  } catch (err) {
    console.error("❌ /add-number error:", err);
    if (err.code === 11000) return res.status(400).json({ error: "Number already exists" });
    res.status(500).json({ error: "Failed to add number" });
  }
});

// Backward-compatible: update mode only
app.put("/update-mode", auth, async (req, res) => {
  try {
    const { id, mode } = req.body;
    if (!id || !mode) return res.status(400).json({ error: "ID and mode are required" });
    if (!["CALL", "OTP"].includes(mode)) return res.status(400).json({ error: "Mode must be CALL or OTP" });

    const updated = await PhoneMode.findByIdAndUpdate(id, { mode }, { new: true });
    if (!updated) return res.status(404).json({ error: "Number not found" });

    res.json({ success: true, message: "Mode updated successfully", data: updated });
  } catch (err) {
    console.error("❌ /update-mode error:", err);
    res.status(500).json({ error: "Failed to update mode" });
  }
});

// New: update mode/tags/notes/state
app.put("/update-number", auth, async (req, res) => {
  try {
    const { id, mode, tags, notes, state } = req.body;
    if (!id) return res.status(400).json({ error: "ID is required" });

    const update = {};
    if (mode && ["CALL", "OTP"].includes(mode)) update.mode = mode;
    if (Array.isArray(tags)) update.tags = tags;
    if (typeof notes === "string") update.notes = notes;
    if (typeof state === "string" && state.trim().length) update.state = state.trim();

    const updated = await PhoneMode.findByIdAndUpdate(id, update, { new: true });
    if (!updated) return res.status(404).json({ error: "Number not found" });

    res.json({ success: true, message: "Number updated successfully", data: updated });
  } catch (err) {
    console.error("❌ /update-number error:", err);
    res.status(500).json({ error: "Failed to update number" });
  }
});

app.delete("/delete-number/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const del = await PhoneMode.findByIdAndDelete(id);
    if (!del) return res.status(404).json({ error: "Number not found" });
    res.json({ success: true, message: "Number deleted successfully", data: del });
  } catch (err) {
    console.error("❌ /delete-number error:", err);
    res.status(500).json({ error: "Failed to delete number" });
  }
});

app.get("/stats", auth, async (req, res) => {
  try {
    const total = await PhoneMode.countDocuments();
    const call = await PhoneMode.countDocuments({ mode: "CALL" });
    const otp = await PhoneMode.countDocuments({ mode: "OTP" });
    res.json({ total, call, otp, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("❌ /stats error:", err);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

app.post("/bulk-add", auth, async (req, res) => {
  try {
    const { numbers } = req.body;
    if (!Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ error: "Numbers array is required" });
    }

    const results = { added: [], errors: [], skipped: [] };
    for (const item of numbers) {
      try {
        const number = normalize(item.number);
        const mode = ["CALL", "OTP"].includes(item.mode) ? item.mode : "CALL";
        const tags = Array.isArray(item.tags) ? item.tags : [];
        const notes = typeof item.notes === "string" ? item.notes : "";
        const stateObj = detectState(number);
        const state = item.state || stateObj.state;

        if (!number) {
          results.errors.push({ number: item.number, error: "Invalid number" });
          continue;
        }

        const exists = await PhoneMode.findOne({ number });
        if (exists) {
          results.skipped.push({ number, reason: "Already exists" });
          continue;
        }

        const saved = await new PhoneMode({ number, mode, tags, notes, state }).save();
        results.added.push(saved);
      } catch (e) {
        results.errors.push({ number: item.number, error: e.message });
      }
    }

    res.json({
      success: true,
      message: `Bulk add: ${results.added.length} added, ${results.skipped.length} skipped, ${results.errors.length} errors`,
      results
    });
  } catch (err) {
    console.error("❌ /bulk-add error:", err);
    res.status(500).json({ error: "Failed to process bulk add" });
  }
});

app.get("/search", auth, async (req, res) => {
  try {
    const { q, mode, state } = req.query;
    const query = {};

    if (q) {
      query.$or = [
        { number: { $regex: q, $options: "i" } },
        { notes: { $regex: q, $options: "i" } },
        { tags: { $regex: q, $options: "i" } }
      ];
    }
    if (mode && ["CALL", "OTP"].includes(mode)) query.mode = mode;
    if (state && state.trim().length) query.state = state.trim();

    const list = await PhoneMode.find(query).sort({ createdAt: -1 });
    res.json({ query: { q, mode, state }, count: list.length, numbers: list });
  } catch (err) {
    console.error("❌ /search error:", err);
    res.status(500).json({ error: "Failed to search numbers" });
  }
});

// ---------- Global error handler ----------
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log("🔐 Auth: POST /login");
  console.log("📞 GET /numbers (auth)");
  console.log("➕ POST /add-number (auth)");
  console.log("✏️ PUT /update-number (auth)");
  console.log("♻️ PUT /update-mode (auth)");
  console.log("🗑️ DELETE /delete-number/:id (auth)");
  console.log("📊 GET /stats (auth)");
  console.log("📥 POST /bulk-add (auth)");
  console.log("🔎 GET /search (auth)");
  console.log("🩺 GET /health (public)");
  console.log("☎️ POST /lookup (public)");
});
