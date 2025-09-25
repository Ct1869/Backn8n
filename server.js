const express = require("express");
const mongoose = require("mongoose");
const cors = require('cors');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();

app.use(express.json());
app.use(cors());

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://jmc_db_user:6RWm59mCrLGU20hP@phone-manager.rqeyqhc.mongodb.net/?retryWrites=true&w=majority&appName=phone-manager";
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

mongoose.connect(MONGODB_URI);

// Schemas
const phoneSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },
  mode: { type: String, enum: ["CALL", "OTP"], default: "CALL" },
  tags: [{ type: String, trim: true, lowercase: true }],
  notes: { type: String, default: "" },
  lastUsed: { type: Date },
  usageCount: { type: Number, default: 0 }
}, { timestamps: true });

phoneSchema.index({ tags: 1 });
phoneSchema.index({ number: 1 });

const PhoneMode = mongoose.model("PhoneMode", phoneSchema);

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin"], default: "admin" },
  lastLogin: { type: Date }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

// Seed
const seedNumbers = [
  { number: "+17753055823", mode: "CALL", tags: [] },
  { number: "+16693454835", mode: "CALL", tags: [] },
  { number: "+19188183039", mode: "CALL", tags: [] },
  { number: "+15088127382", mode: "CALL", tags: [] },
  { number: "+18722965039", mode: "CALL", tags: [] },
  { number: "+14172218933", mode: "CALL", tags: [] },
  { number: "+19191919191", mode: "OTP", tags: [] }
];

async function seedDB() {
  try {
    const existingAdmin = await User.findOne({ username: "admin" });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await new User({ username: "admin", password: hashedPassword, role: "admin" }).save();
      console.log("Admin user created");
    }

    const existingCount = await PhoneMode.countDocuments();
    if (existingCount === 0) {
      for (const num of seedNumbers) {
        await PhoneMode.updateOne(
          { number: num.number },
          { $set: { mode: num.mode, tags: num.tags || [], notes: "", usageCount: 0 }},
          { upsert: true }
        );
      }
      console.log("Numbers initialized");
    }
  } catch (err) {
    console.error("Error seeding:", err);
  }
}
seedDB();

// Auth middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: "No token provided" });
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: "Invalid token" });
    
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};

function normalize(num) {
  return (num || "").toString().trim();
}

// Public endpoints
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });

    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ error: "Invalid credentials" });

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token, user: { id: user._id, username: user.username, role: user.role }});
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/verify", authenticate, (req, res) => {
  res.json({ success: true, user: { id: req.user._id, username: req.user.username, role: req.user.role }});
});

app.post("/lookup", async (req, res) => {
  try {
    const rawCalled = req.body.Called || req.query.Called;
    const rawTo = req.body.To || req.query.To;
    const calledNumber = normalize(rawCalled || rawTo);
    
    const found = await PhoneMode.findOne({ number: calledNumber });
    if (found) {
      found.lastUsed = new Date();
      found.usageCount = (found.usageCount || 0) + 1;
      await found.save();
    }
    
    res.json({
      calledNumber,
      mode: found ? found.mode : "UNKNOWN",
      tags: found ? found.tags : [],
      from: req.body.From || req.query.From,
      callSid: req.body.CallSid || req.query.CallSid,
    });
  } catch (err) {
    res.status(500).json({ error: "Lookup failed" });
  }
});

// Protected endpoints
app.get("/health", authenticate, async (req, res) => {
  try {
    await mongoose.connection.db.admin().ping();
    res.json({ status: "healthy", database: "connected", timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: "unhealthy", error: error.message });
  }
});

app.get("/numbers", authenticate, async (req, res) => {
  try {
    const { tag, mode, search } = req.query;
    let query = {};
    
    if (tag) query.tags = { $in: [tag.toLowerCase()] };
    if (mode && ["CALL", "OTP"].includes(mode)) query.mode = mode;
    if (search) query.number = { $regex: search, $options: 'i' };
    
    const numbers = await PhoneMode.find(query).sort({ createdAt: -1 });
    res.json(numbers);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch" });
  }
});

app.post("/add-number", authenticate, async (req, res) => {
  try {
    const { number, mode, tags, notes } = req.body;
    if (!number || !mode) return res.status(400).json({ error: "Number and mode required" });
    
    const normalizedNumber = normalize(number);
    if (!["CALL", "OTP"].includes(mode)) return res.status(400).json({ error: "Invalid mode" });
    
    if (await PhoneMode.findOne({ number: normalizedNumber })) {
      return res.status(400).json({ error: "Number exists" });
    }
    
    const processedTags = Array.isArray(tags) ? tags.filter(t => t && t.trim()).map(t => t.trim().toLowerCase()) : [];
    const saved = await new PhoneMode({ number: normalizedNumber, mode, tags: processedTags, notes: notes || "", usageCount: 0 }).save();
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ error: "Failed to add" });
  }
});

app.put("/update-number", authenticate, async (req, res) => {
  try {
    const { id, mode, tags, notes } = req.body;
    if (!id) return res.status(400).json({ error: "ID required" });
    
    const updateData = {};
    if (mode && ["CALL", "OTP"].includes(mode)) updateData.mode = mode;
    if (Array.isArray(tags)) updateData.tags = tags.filter(t => t && t.trim()).map(t => t.trim().toLowerCase());
    if (notes !== undefined) updateData.notes = notes;
    
    const updated = await PhoneMode.findByIdAndUpdate(id, updateData, { new: true });
    if (!updated) return res.status(404).json({ error: "Not found" });
    
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

app.delete("/delete-number/:id", authenticate, async (req, res) => {
  try {
    const deleted = await PhoneMode.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ success: true, data: deleted });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
});

app.get("/stats", authenticate, async (req, res) => {
  try {
    const total = await PhoneMode.countDocuments();
    const callCount = await PhoneMode.countDocuments({ mode: "CALL" });
    const otpCount = await PhoneMode.countDocuments({ mode: "OTP" });
    const tagStats = await PhoneMode.aggregate([
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 }}},
      { $sort: { count: -1 }},
      { $limit: 10 }
    ]);
    
    res.json({ total, call: callCount, otp: otpCount, tagStats, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: "Stats failed" });
  }
});

app.get("/tags", authenticate, async (req, res) => {
  try {
    const tags = await PhoneMode.aggregate([
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 }}},
      { $sort: { count: -1 }}
    ]);
    res.json(tags.map(t => ({ name: t._id, count: t.count })));
  } catch (err) {
    res.status(500).json({ error: "Tags failed" });
  }
