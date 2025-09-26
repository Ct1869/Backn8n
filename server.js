const express = require("express");
const mongoose = require("mongoose");
const cors = require('cors');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();

// CORS configuration - allow all origins for now
app.use(cors({
  origin: '*', // Allow all origins temporarily for debugging
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://jmc_db_user:6RWm59mCrLGU20hP@phone-manager.rqeyqhc.mongodb.net/?retryWrites=true&w=majority&appName=phone-manager";
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Enhanced MongoDB connection with error handling
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Connected to MongoDB successfully');
})
.catch((err) => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Monitor connection status
mongoose.connection.on('connected', () => {
  console.log('📡 Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('💥 Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('🔌 Mongoose disconnected');
});

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

// Seed data
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
    // Wait for connection to be established
    if (mongoose.connection.readyState !== 1) {
      console.log('⏳ Waiting for database connection...');
      await new Promise(resolve => {
        mongoose.connection.once('connected', resolve);
      });
    }

    const existingAdmin = await User.findOne({ username: "admin" });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await new User({ username: "admin", password: hashedPassword, role: "admin" }).save();
      console.log("👤 Admin user created");
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
      console.log("📞 Numbers initialized");
    }
    console.log("🌱 Database seeding completed");
  } catch (err) {
    console.error("❌ Error seeding database:", err);
  }
}

// Seed the database
seedDB();

// Auth middleware with better error handling
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "No valid token provided" });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ error: "Invalid token" });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ error: "Invalid token" });
  }
};

function normalize(num) {
  return (num || "").toString().trim();
}

// Add a basic root endpoint
app.get("/", (req, res) => {
  res.json({ 
    message: "Phone Manager API is running", 
    status: "active",
    timestamp: new Date().toISOString(),
    endpoints: [
      "POST /login",
      "GET /verify",
      "POST /lookup",
      "GET /health",
      "GET /numbers",
      "POST /add-number",
      "PUT /update-number",
      "DELETE /delete-number/:id",
      "GET /stats",
      "GET /tags"
    ]
  });
});

// Public endpoints
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log(`🔐 Login attempt for user: ${username}`);
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      console.log(`❌ User not found: ${username}`);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      console.log(`❌ Invalid password for user: ${username}`);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    
    console.log(`✅ User ${username} logged in successfully`);
    res.json({ 
      success: true, 
      token, 
      user: { id: user._id, username: user.username, role: user.role }
    });
  } catch (error) {
    console.error('Login error:', error);
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
    
    console.log(`🔍 Lookup request for number: ${calledNumber}`);
    
    const found = await PhoneMode.findOne({ number: calledNumber });
    if (found) {
      found.lastUsed = new Date();
      found.usageCount = (found.usageCount || 0) + 1;
      await found.save();
      console.log(`✅ Number found: ${calledNumber} (${found.mode})`);
    } else {
      console.log(`❓ Number not found: ${calledNumber}`);
    }
    
    res.json({
      calledNumber,
      mode: found ? found.mode : "UNKNOWN",
      tags: found ? found.tags : [],
      from: req.body.From || req.query.From,
      callSid: req.body.CallSid || req.query.CallSid,
    });
  } catch (err) {
    console.error('Lookup error:', err);
    res.status(500).json({ error: "Lookup failed" });
  }
});

// Protected endpoints
app.get("/health", authenticate, async (req, res) => {
  try {
    await mongoose.connection.db.admin().ping();
    const stats = {
      status: "healthy", 
      database: "connected", 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version
    };
    console.log("💚 Health check passed");
    res.json(stats);
  } catch (error) {
    console.error('Health check failed:', error);
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
    console.log(`📋 Retrieved ${numbers.length} phone numbers`);
    res.json(numbers);
  } catch (err) {
    console.error('Error fetching numbers:', err);
    res.status(500).json({ error: "Failed to fetch numbers" });
  }
});

app.post("/add-number", authenticate, async (req, res) => {
  try {
    const { number, mode, tags, notes } = req.body;
    console.log(`➕ Adding number: ${number} (${mode})`);
    
    if (!number || !mode) {
      return res.status(400).json({ error: "Number and mode required" });
    }
    
    const normalizedNumber = normalize(number);
    if (!["CALL", "OTP"].includes(mode)) {
      return res.status(400).json({ error: "Invalid mode" });
    }
    
    const existing = await PhoneMode.findOne({ number: normalizedNumber });
    if (existing) {
      return res.status(400).json({ error: "Number already exists" });
    }
    
    const processedTags = Array.isArray(tags) ? tags.filter(t => t && t.trim()).map(t => t.trim().toLowerCase()) : [];
    const saved = await new PhoneMode({ 
      number: normalizedNumber, 
      mode, 
      tags: processedTags, 
      notes: notes || "", 
      usageCount: 0 
    }).save();
    
    console.log(`✅ Number added successfully: ${normalizedNumber}`);
    res.json({ success: true, data: saved });
  } catch (err) {
    console.error('Error adding number:', err);
    res.status(500).json({ error: "Failed to add number" });
  }
});

app.put("/update-number", authenticate, async (req, res) => {
  try {
    const { id, mode, tags, notes } = req.body;
    console.log(`📝 Updating number: ${id}`);
    
    if (!id) {
      return res.status(400).json({ error: "ID required" });
    }
    
    const updateData = {};
    if (mode && ["CALL", "OTP"].includes(mode)) updateData.mode = mode;
    if (Array.isArray(tags)) updateData.tags = tags.filter(t => t && t.trim()).map(t => t.trim().toLowerCase());
    if (notes !== undefined) updateData.notes = notes;
    
    const updated = await PhoneMode.findByIdAndUpdate(id, updateData, { new: true });
    if (!updated) {
      return res.status(404).json({ error: "Number not found" });
    }
    
    console.log(`✅ Number updated successfully: ${id}`);
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Error updating number:', err);
    res.status(500).json({ error: "Update failed" });
  }
});

app.delete("/delete-number/:id", authenticate, async (req, res) => {
  try {
    const id = req.params.id;
    console.log(`🗑️ Deleting number: ${id}`);
    
    const deleted = await PhoneMode.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: "Number not found" });
    }
    
    console.log(`✅ Number deleted successfully: ${id}`);
    res.json({ success: true, data: deleted });
  } catch (err) {
    console.error('Error deleting number:', err);
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
    
    console.log(`📊 Stats requested - Total: ${total}, CALL: ${callCount}, OTP: ${otpCount}`);
    res.json({ total, call: callCount, otp: otpCount, tagStats, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Error getting stats:', err);
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
    console.error('Error getting tags:', err);
    res.status(500).json({ error: "Tags failed" });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Handle 404s
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`🌐 Server URL: http://localhost:${PORT}`);
  console.log(`📡 Database: ${MONGODB_URI ? 'Configured' : 'Not configured'}`);
});
