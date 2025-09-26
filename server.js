const express = require("express");
const mongoose = require("mongoose");
const cors = require('cors');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB connection
mongoose.connect(
  "mongodb+srv://jmc_db_user:6RWm59mCrLGU20hP@phone-manager.rqeyqhc.mongodb.net/?retryWrites=true&w=majority&appName=phone-manager"
);

// ==================== Schema & Model ====================
const phoneSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },
  mode: { type: String, enum: ["CALL", "OTP"], default: "CALL" },
  tags: { type: [String], default: [] },
  notes: { type: String, default: "" }
}, {
  timestamps: true // adds createdAt and updatedAt
});

const PhoneMode = mongoose.model("PhoneMode", phoneSchema);

// ==================== Seed Initial Numbers ====================
const numbers = [
  { number: "+17753055823", mode: "CALL" },
  { number: "+16693454835", mode: "CALL" },
  { number: "+19188183039", mode: "CALL" },
  { number: "+15088127382", mode: "CALL" },
  { number: "+18722965039", mode: "CALL" },
  { number: "+14172218933", mode: "CALL" },
  { number: "+19191919191", mode: "OTP" },
];

async function seedDB() {
  try {
    for (const num of numbers) {
      await PhoneMode.updateOne(
        { number: num.number },
        { $set: { mode: num.mode } },
        { upsert: true }
      );
    }
    console.log("✅ Numbers initialized in database");
  } catch (err) {
    console.error("❌ Error seeding DB:", err);
  }
}
seedDB();

// ==================== Helpers ====================
function normalize(num) {
  return (num || "").toString().trim();
}

// ==================== API ENDPOINTS ====================

// Lookup endpoint
app.post("/lookup", async (req, res) => {
  try {
    const rawCalled = req.body.Called || req.query.Called;
    const rawTo = req.body.To || req.query.To;
    const calledNumber = normalize(rawCalled || rawTo);

    const found = await PhoneMode.findOne({ number: calledNumber });

    res.json({
      calledNumber,
      mode: found ? found.mode : "UNKNOWN",
      from: req.body.From || req.query.From,
      callSid: req.body.CallSid || req.query.CallSid,
    });
  } catch (err) {
    console.error("❌ Error in lookup:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all numbers
app.get("/numbers", async (req, res) => {
  try {
    const allNumbers = await PhoneMode.find().sort({ createdAt: -1 });
    res.json(allNumbers);
  } catch (err) {
    console.error("❌ Error fetching numbers:", err);
    res.status(500).json({ error: "Failed to fetch numbers" });
  }
});

// Add new number
app.post("/add-number", async (req, res) => {
  try {
    const { number, mode, tags = [], notes = "" } = req.body;

    if (!number || !mode) {
      return res.status(400).json({ error: "Number and mode are required" });
    }

    const normalizedNumber = normalize(number);

    if (!normalizedNumber) {
      return res.status(400).json({ error: "Invalid number format" });
    }

    if (!["CALL", "OTP"].includes(mode)) {
      return res.status(400).json({ error: "Mode must be CALL or OTP" });
    }

    const existing = await PhoneMode.findOne({ number: normalizedNumber });
    if (existing) {
      return res.status(400).json({ error: "Number already exists" });
    }

    const newNumber = new PhoneMode({
      number: normalizedNumber,
      mode,
      tags,
      notes
    });

    const saved = await newNumber.save();

    console.log("✅ Number added:", saved.number, "Mode:", saved.mode);
    res.json({ success: true, message: "Number added successfully", data: saved });

  } catch (err) {
    console.error("❌ Error adding number:", err);
    if (err.code === 11000) {
      return res.status(400).json({ error: "Number already exists" });
    }
    res.status(500).json({ error: "Failed to add number" });
  }
});

// Update number (mode, tags, notes)
app.put("/update-number", async (req, res) => {
  try {
    const { id, mode, tags, notes } = req.body;

    if (!id) {
      return res.status(400).json({ error: "ID is required" });
    }

    const updateData = {};
    if (mode && ["CALL", "OTP"].includes(mode)) updateData.mode = mode;
    if (Array.isArray(tags)) updateData.tags = tags;
    if (typeof notes === "string") updateData.notes = notes;

    const updated = await PhoneMode.findByIdAndUpdate(id, updateData, { new: true });

    if (!updated) {
      return res.status(404).json({ error: "Number not found" });
    }

    console.log("✅ Number updated:", updated.number);
    res.json({ success: true, message: "Number updated successfully", data: updated });

  } catch (err) {
    console.error("❌ Error updating number:", err);
    res.status(500).json({ error: "Failed to update number" });
  }
});

// Delete number
app.delete("/delete-number/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "ID is required" });

    const deleted = await PhoneMode.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: "Number not found" });

    console.log("✅ Number deleted:", deleted.number);
    res.json({ success: true, message: "Number deleted successfully", data: deleted });

  } catch (err) {
    console.error("❌ Error deleting number:", err);
    res.status(500).json({ error: "Failed to delete number" });
  }
});

// Stats
app.get("/stats", async (req, res) => {
  try {
    const total = await PhoneMode.countDocuments();
    const callCount = await PhoneMode.countDocuments({ mode: "CALL" });
    const otpCount = await PhoneMode.countDocuments({ mode: "OTP" });

    res.json({ total, call: callCount, otp: otpCount, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("❌ Error fetching stats:", err);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

// Health
app.get("/health", async (req, res) => {
  try {
    await mongoose.connection.db.admin().ping();
    res.json({ status: "healthy", database: "connected", timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("❌ Health check failed:", err);
    res.status(500).json({ status: "unhealthy", database: "disconnected", error: err.message, timestamp: new Date().toISOString() });
  }
});

// Bulk add
app.post("/bulk-add", async (req, res) => {
  try {
    const { numbers } = req.body;
    if (!Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ error: "Numbers array is required" });
    }

    const results = { added: [], errors: [], skipped: [] };

    for (const item of numbers) {
      try {
        const { number, mode = "CALL", tags = [], notes = "" } = item;
        const normalizedNumber = normalize(number);

        if (!normalizedNumber) {
          results.errors.push({ number, error: "Invalid number format" });
          continue;
        }

        if (!["CALL", "OTP"].includes(mode)) {
          results.errors.push({ number, error: "Invalid mode" });
          continue;
        }

        const existing = await PhoneMode.findOne({ number: normalizedNumber });
        if (existing) {
          results.skipped.push({ number: normalizedNumber, reason: "Already exists" });
          continue;
        }

        const newNumber = new PhoneMode({ number: normalizedNumber, mode, tags, notes });
        const saved = await newNumber.save();
        results.added.push(saved);

      } catch (err) {
        results.errors.push({ number: item.number, error: err.message });
      }
    }

    console.log(`✅ Bulk add completed: ${results.added.length} added, ${results.skipped.length} skipped, ${results.errors.length} errors`);
    res.json({ success: true, message: `Bulk operation completed: ${results.added.length} added, ${results.skipped.length} skipped, ${results.errors.length} errors`, results });

  } catch (err) {
    console.error("❌ Error in bulk add:", err);
    res.status(500).json({ error: "Failed to process bulk add" });
  }
});

// Search (now also searches tags + notes)
app.get("/search", async (req, res) => {
  try {
    const { q, mode } = req.query;
    let query = {};

    if (q) {
      query.$or = [
        { number: { $regex: q, $options: 'i' } },
        { notes: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } }
      ];
    }

    if (mode && ["CALL", "OTP"].includes(mode)) {
      query.mode = mode;
    }

    const numbers = await PhoneMode.find(query).sort({ createdAt: -1 });

    res.json({ query: { search: q, mode }, count: numbers.length, numbers });

  } catch (err) {
    console.error("❌ Error in search:", err);
    res.status(500).json({ error: "Failed to search numbers" });
  }
});

// ==================== Error Handling ====================
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ==================== DB Events ====================
mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB connected successfully');
});
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});
mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⚠️ Received SIGINT, shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

// ==================== Start Server ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   POST /lookup - Lookup phone number mode`);
  console.log(`   GET /numbers - Get all numbers`);
  console.log(`   POST /add-number - Add new number`);
  console.log(`   PUT /update-number - Update number (mode, tags, notes)`);
  console.log(`   DELETE /delete-number/:id - Delete number`);
  console.log(`   GET /stats - Get statistics`);
  console.log(`   GET /health - Health check`);
  console.log(`   POST /bulk-add - Add multiple numbers`);
  console.log(`   GET /search - Search numbers (includes tags + notes)`);
});
