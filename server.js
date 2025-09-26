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

// ---------- Area Code → State (Partial List; extend as needed) ----------
const areaCodeToState = {
  // California
  "209":"California","213":"California","279":"California","310":"California","323":"California","341":"California","369":"California","408":"California","415":"California","424":"California","442":"California","510":"California","530":"California","559":"California","562":"California","619":"California","626":"California","650":"California","657":"California","661":"California","669":"California","707":"California","714":"California","747":"California","752":"California","760":"California","805":"California","818":"California","820":"California","831":"California","840":"California","858":"California","909":"California","916":"California","925":"California","949":"California","951":"California",
  // Texas
  "210":"Texas","214":"Texas","254":"Texas","281":"Texas","325":"Texas","346":"Texas","361":"Texas","409":"Texas","430":"Texas","432":"Texas","469":"Texas","512":"Texas","682":"Texas","713":"Texas","726":"Texas","737":"Texas","806":"Texas","817":"Texas","830":"Texas","832":"Texas","903":"Texas","915":"Texas","936":"Texas","940":"Texas","945":"Texas","956":"Texas","972":"Texas","979":"Texas",
  // Florida
  "305":"Florida","321":"Florida","352":"Florida","386":"Florida","407":"Florida","448":"Florida","561":"Florida","627":"Florida","656":"Florida","689":"Florida","727":"Florida","730":"Florida","748":"Florida","754":"Florida","772":"Florida","786":"Florida","813":"Florida","850":"Florida","863":"Florida","904":"Florida","927":"Florida","941":"Florida","954":"Florida",
  // New York
  "212":"New York","315":"New York","332":"New York","347":"New York","363":"New York","516":"New York","518":"New York","585":"New York","607":"New York","631":"New York","646":"New York","680":"New York","716":"New York","718":"New York","838":"New York","845":"New York","914":"New York","917":"New York","929":"New York",
  // A few more common ones
  "202":"District of Columbia","303":"Colorado","312":"Illinois","313":"Michigan","314":"Missouri","317":"Indiana","319":"Iowa","404":"Georgia","410":"Maryland","412":"Pennsylvania","415":"California","425":"Washington","434":"Virginia","440":"Ohio","469":"Texas","470":"Georgia","480":"Arizona","484":"Pennsylvania","501":"Arkansas","502":"Kentucky","503":"Oregon","504":"Louisiana","505":"New Mexico","507":"Minnesota","508":"Massachusetts","509":"Washington","512":"Texas","513":"Ohio","515":"Iowa","516":"New York","517":"Michigan","518":"New York","520":"Arizona","530":"California","540":"Virginia","541":"Oregon","551":"New Jersey","559":"California","561":"Florida","562":"California","563":"Iowa","567":"Ohio","570":"Pennsylvania","571":"Virginia","573":"Missouri","574":"Indiana","575":"New Mexico","580":"Oklahoma","585":"New York","586":"Michigan","601":"Mississippi","602":"Arizona","603":"New Hampshire","605":"South Dakota","606":"Kentucky","607":"New York","608":"Wisconsin","609":"New Jersey","610":"Pennsylvania","612":"Minnesota","614":"Ohio","615":"Tennessee","616":"Michigan","617":"Massachusetts","618":"Illinois","619":"California","620":"Kansas","623":"Arizona","626":"California","628":"California","629":"Tennessee","630":"Illinois","631":"New York","636":"Missouri","641":"Iowa","646":"New York","650":"California","651":"Minnesota","657":"California","660":"Missouri","661":"California","662":"Mississippi","678":"Georgia","682":"Texas","701":"North Dakota","702":"Nevada","703":"Virginia","704":"North Carolina","706":"Georgia","708":"Illinois","712":"Iowa","713":"Texas","714":"California","715":"Wisconsin","716":"New York","717":"Pennsylvania","718":"New York","719":"Colorado","720":"Colorado","724":"Pennsylvania","727":"Florida","731":"Tennessee","732":"New Jersey","734":"Michigan","737":"Texas","740":"Ohio","747":"California","754":"Florida","757":"Virginia","760":"California","762":"Georgia","763":"Minnesota","765":"Indiana","769":"Mississippi","770":"Georgia","772":"Florida","773":"Illinois","774":"Massachusetts","775":"Nevada","779":"Illinois","781":"Massachusetts","785":"Kansas","786":"Florida","801":"Utah","802":"Vermont","803":"South Carolina","804":"Virginia","805":"California","806":"Texas","808":"Hawaii","810":"Michigan","812":"Indiana","813":"Florida","814":"Pennsylvania","815":"Illinois","816":"Missouri","817":"Texas","818":"California","828":"North Carolina","830":"Texas","831":"California","832":"Texas","843":"South Carolina","845":"New York","847":"Illinois","848":"New Jersey","850":"Florida","856":"New Jersey","857":"Massachusetts","858":"California","859":"Kentucky","860":"Connecticut","862":"New Jersey","863":"Florida","864":"South Carolina","865":"Tennessee","856":"New Jersey","870":"Arkansas","872":"Illinois","901":"Tennessee","903":"Texas","904":"Florida","906":"Michigan","907":"Alaska","908":"New Jersey","909":"California","910":"North Carolina","912":"Georgia","913":"Kansas","914":"New York","915":"Texas","916":"California","917":"New York","918":"Oklahoma","919":"North Carolina","920":"Wisconsin","925":"California","928":"Arizona","929":"New York","930":"Indiana","931":"Tennessee","936":"Texas","937":"Ohio","940":"Texas","941":"Florida","947":"Michigan","949":"California","951":"California","952":"Minnesota","954":"Florida","956":"Texas","959":"Connecticut","970":"Colorado","971":"Oregon","972":"Texas","973":"New Jersey","975":"Missouri","978":"Massachusetts","979":"Texas","980":"North Carolina","984":"North Carolina","985":"Louisiana","986":"Idaho","989":"Michigan"
};

// Extract state from E.164 or raw US number
function detectState(number) {
  const digits = (number || "").replace(/\D/g, "");
  if (digits.length >= 10) {
    const area = digits.slice(-10, -7);
    return areaCodeToState[area] || "Unknown";
  }
  return "Unknown";
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
      const state = detectState(num.number);
      await PhoneMode.updateOne(
        { number: num.number },
        { $set: { mode: num.mode, state }, $setOnInsert: { tags: [], notes: "" } },
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

    const finalState = state || detectState(normalized);

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
        const state = item.state || detectState(number);

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
