<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Phone Manager - Secure Panel</title>
  <meta name="description" content="Secure phone number management with tagging, notes, filtering, and state auto-detection"/>
  <style>
    :root{
      --background: 220 13% 7%;
      --foreground: 0 0% 88%;
      --card: 220 13% 12%;
      --border: 220 13% 20%;
      --primary: 178 67% 53%;
      --success: 142 69% 58%;
      --warning: 45 100% 60%;
      --destructive: 0 84% 60%;
      --radius: .75rem;
    }
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:hsl(var(--background));color:hsl(var(--foreground));font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;min-height:100vh}
    .container{max-width:1200px;margin:0 auto;padding:1rem}
    .hidden{display:none!important}
    .card{background:linear-gradient(145deg,hsl(220 13% 12%),hsl(220 13% 14%));border:1px solid hsl(var(--border));border-radius:var(--radius);box-shadow:0 4px 6px -1px hsl(220 13% 4% / 0.3),0 2px 4px -2px hsl(220 13% 4% / 0.3);padding:1.25rem;margin-bottom:1rem}
    .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;gap:1rem;flex-wrap:wrap}
    .header h1{font-size:2rem;background:linear-gradient(135deg,hsl(var(--primary)),hsl(178 67% 65%));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .btn{padding:.7rem 1.1rem;border-radius:calc(var(--radius) - 3px);border:1px solid hsl(var(--border));background:transparent;color:hsl(var(--foreground));cursor:pointer;transition:transform .15s ease}
    .btn:hover{transform:translateY(-1px)}
    .btn-primary{background:hsl(var(--primary));border:none;color:hsl(220 13% 7%)}
    .btn-destructive{background:hsl(var(--destructive) / .12);border-color:hsl(var(--destructive) / .35);color:hsl(var(--destructive))}
    .btn-outline{background:transparent}
    input,select,textarea{width:100%;padding:.75rem 1rem;border-radius:calc(var(--radius) - 3px);border:1px solid hsl(var(--border));background:hsl(220 13% 10%);color:hsl(var(--foreground))}
    input:focus,select:focus,textarea:focus{outline:none;border-color:hsl(var(--primary));box-shadow:0 0 0 2px hsl(var(--primary) / .25)}
    .grid{display:grid;gap:1rem}
    .grid-2{grid-template-columns:repeat(2,1fr)}
    .grid-3{grid-template-columns:repeat(3,1fr)}
    @media(max-width:900px){.grid-3{grid-template-columns:1fr}.grid-2{grid-template-columns:1fr}}
    .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}
    @media(max-width:700px){.stats{grid-template-columns:repeat(2,1fr)}}
    .stat-num{font-size:1.8rem;font-weight:700;color:hsl(var(--primary))}
    .mode-badge{display:inline-flex;align-items:center;gap:.4rem;padding:.25rem .6rem;border-radius:999px;font-size:.8rem;border:1px solid}
    .mode-call{background:hsl(var(--success) / .12);color:hsl(var(--success));border-color:hsl(var(--success) / .35)}
    .mode-otp{background:hsl(var(--warning) / .15);color:hsl(var(--warning));border-color:hsl(var(--warning) / .35)}
    .tag{display:inline-flex;gap:.35rem;align-items:center;padding:.25rem .6rem;border-radius:999px;border:1px solid hsl(var(--border));background:hsl(220 13% 10%);font-size:.78rem;margin:.2rem .3rem .2rem 0}
    .status{padding:.85rem;border-radius:calc(var(--radius) - 3px);margin-bottom:1rem;display:none}
    .ok{background:hsl(var(--success) / .12);color:hsl(var(--success));border:1px solid hsl(var(--success) / .35)}
    .err{background:hsl(var(--destructive) / .12);color:hsl(var(--destructive));border:1px solid hsl(var(--destructive) / .35)}
    .numbers-grid{display:grid;grid-template-columns:repeat(1,1fr);gap:1rem}
    @media(min-width:800px){.numbers-grid{grid-template-columns:repeat(2,1fr)}}
    @media(min-width:1100px){.numbers-grid{grid-template-columns:repeat(3,1fr)}}
    .row{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap}
  </style>
</head>
<body>
  <!-- LOGIN -->
  <div id="loginView" class="container">
    <div class="card" style="max-width:420px;margin:12vh auto 0">
      <h1 style="text-align:center;margin-bottom:.5rem;">🔐 Phone Manager</h1>
      <p style="text-align:center;opacity:.7;margin-bottom:1rem;">Enter admin password to continue</p>
      <div id="loginMsg" class="status err"></div>
      <div class="grid">
        <input id="password" type="password" placeholder="Password"/>
        <button class="btn btn-primary" onclick="login()">Sign In</button>
      </div>
    </div>
  </div>

  <!-- APP -->
  <div id="appView" class="container hidden">
    <div class="header">
      <h1>Phone Manager</h1>
      <div class="row">
        <button class="btn" onclick="refresh()">Refresh</button>
        <button class="btn btn-outline" onclick="logout()">Logout</button>
      </div>
    </div>

    <div id="mainMsg" class="status"></div>

    <!-- Stats -->
    <div class="stats">
      <div class="card">
        <div class="stat-num" id="totalCount">0</div>
        <div>Total Numbers</div>
      </div>
      <div class="card">
        <div class="stat-num" id="callCount">0</div>
        <div>CALL Mode</div>
      </div>
      <div class="card">
        <div class="stat-num" id="otpCount">0</div>
        <div>OTP Mode</div>
      </div>
    </div>

    <!-- Add Number -->
    <div class="card">
      <h3 style="margin-bottom:.6rem;">Add New Number</h3>
      <div class="grid grid-3">
        <div>
          <label>Phone Number</label>
          <input id="newNumber" type="tel" placeholder="+12345678901"/>
        </div>
        <div>
          <label>Mode</label>
          <select id="newMode">
            <option value="CALL">CALL</option>
            <option value="OTP">OTP</option>
          </select>
        </div>
        <div>
          <label>Tags (comma separated)</label>
          <input id="newTags" type="text" placeholder="Work, Banking, Personal"/>
        </div>
      </div>
      <div class="grid grid-2" style="margin-top:1rem">
        <div>
          <label>Notes (optional)</label>
          <textarea id="newNotes" rows="2" placeholder="Optional notes"></textarea>
        </div>
        <div>
          <label>State (optional, auto-detected if empty)</label>
          <input id="newState" type="text" placeholder="Texas"/>
        </div>
      </div>
      <button class="btn btn-primary" style="margin-top:1rem" onclick="addNumber()">Add Number</button>
    </div>

    <!-- Filters -->
    <div class="card">
      <h3 style="margin-bottom:.6rem;">Filters</h3>
      <div class="grid grid-3">
        <div><input id="searchQ" type="text" placeholder="Search number, tag, or notes" oninput="applyFilters()"/></div>
        <div>
          <select id="filterMode" onchange="applyFilters()">
            <option value="">All Modes</option>
            <option value="CALL">CALL</option>
            <option value="OTP">OTP</option>
          </select>
        </div>
        <div>
          <select id="filterState" onchange="applyFilters()">
            <option value="">All States</option>
          </select>
        </div>
      </div>
      <div class="row" style="margin-top:.6rem">
        <label>By Tag:</label>
        <select id="filterTag" onchange="applyFilters()"><option value="">All Tags</option></select>
        <button class="btn btn-outline" onclick="clearFilters()">Clear</button>
      </div>
    </div>

    <!-- Numbers -->
    <div class="card">
      <h3 style="margin-bottom:.6rem;">Numbers</h3>
      <div id="numbersGrid" class="numbers-grid"></div>
      <div id="emptyState" style="text-align:center;opacity:.6;display:none;padding:1rem">No numbers found.</div>
    </div>
  </div>

  <script>
    // ---------- Config ----------
    const API_BASE = "https://backn8n.onrender.com"; // <-- your backend base URL
    let token = null;
    let allNumbers = [];
    let filtered = [];

    // ---------- Utils ----------
    function show(el, type, msg) {
      const box = document.getElementById(el);
      box.textContent = msg;
      box.className = type ? `status ${type}` : "status";
      box.style.display = "block";
      clearTimeout(box._t);
      box._t = setTimeout(() => { box.style.display = "none"; }, 4000);
    }
    function hide(el) {
      const box = document.getElementById(el);
      box.style.display = "none";
      box.textContent = "";
    }
    function uniq(arr) { return [...new Set(arr)]; }

    // ---------- Auth ----------
    async function login() {
      const password = document.getElementById("password").value.trim();
      try {
        const res = await fetch(`${API_BASE}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Login failed");
        token = data.token;
        localStorage.setItem("pm_token", token);
        document.getElementById("loginView").classList.add("hidden");
        document.getElementById("appView").classList.remove("hidden");
        await refresh();
      } catch (e) {
        show("loginMsg", "err", e.message);
      }
    }
    function logout() {
      token = null;
      localStorage.removeItem("pm_token");
      document.getElementById("appView").classList.add("hidden");
      document.getElementById("loginView").classList.remove("hidden");
    }

    // Enforce login on load (no auto-bypass)
    window.addEventListener("DOMContentLoaded", async () => {
      const saved = localStorage.getItem("pm_token");
      if (saved) token = saved;
      // Always show login first; only proceed after successful fetch
    });

    // ---------- API ----------
    async function api(path, options = {}) {
      const headers = options.headers || {};
      headers["Content-Type"] = "application/json";
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
      // If response is not JSON (e.g., HTML error), throw a useful error
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (!res.ok) throw new Error(data.error || "Request failed");
        return data;
      } catch {
        throw new Error(`Unexpected response (not JSON) from ${path}`);
      }
    }

    async function refresh() {
      try {
        const list = await api("/numbers");
        allNumbers = list;
        renderFilters();
        applyFilters();
        const stats = await api("/stats");
        document.getElementById("totalCount").textContent = stats.total || list.length;
        document.getElementById("callCount").textContent = (stats.call ?? list.filter(n => n.mode === "CALL").length);
        document.getElementById("otpCount").textContent = (stats.otp ?? list.filter(n => n.mode === "OTP").length);
        hide("mainMsg");
      } catch (e) {
        show("mainMsg", "err", e.message);
      }
    }

    async function addNumber() {
      const number = document.getElementById("newNumber").value.trim();
      const mode = document.getElementById("newMode").value;
      const tags = document.getElementById("newTags").value.split(",").map(t => t.trim()).filter(Boolean);
      const notes = document.getElementById("newNotes").value.trim();
      const state = document.getElementById("newState").value.trim(); // optional; backend auto-detects if empty

      if (!number.startsWith("+")) {
        show("mainMsg", "err", "Phone number must start with + (E.164)");
        return;
      }
      try {
        await api("/add-number", {
          method: "POST",
          body: JSON.stringify({ number, mode, tags, notes, state })
        });
        show("mainMsg", "ok", "Number added successfully");
        document.getElementById("newNumber").value = "";
        document.getElementById("newMode").value = "CALL";
        document.getElementById("newTags").value = "";
        document.getElementById("newNotes").value = "";
        document.getElementById("newState").value = "";
        await refresh();
      } catch (e) {
        show("mainMsg", "err", e.message);
      }
    }

    async function saveEdits(id) {
      const card = document.querySelector(`[data-id="${id}"]`);
      const mode = card.querySelector(".edit-mode").value;
      const notes = card.querySelector(".edit-notes").value.trim();
      const state = card.querySelector(".edit-state").value.trim();
      const tags = card.querySelector(".edit-tags").value.split(",").map(t => t.trim()).filter(Boolean);
      try {
        await api("/update-number", { method: "PUT", body: JSON.stringify({ id, mode, tags, notes, state }) });
        show("mainMsg", "ok", "Number updated");
        await refresh();
      } catch (e) {
        show("mainMsg", "err", e.message);
      }
    }

    async function changeModeQuick(id, mode) {
      try {
        await api("/update-mode", { method: "PUT", body: JSON.stringify({ id, mode }) });
        await refresh();
      } catch (e) {
        show("mainMsg", "err", e.message);
      }
    }

    async function removeNumber(id) {
      if (!confirm("Delete this number?")) return;
      try {
        await api(`/delete-number/${id}`, { method: "DELETE" });
        show("mainMsg", "ok", "Number deleted");
        await refresh();
      } catch (e) {
        show("mainMsg", "err", e.message);
      }
    }

    // ---------- Filters ----------
    function renderFilters() {
      // Tags
      const allTags = uniq(allNumbers.flatMap(n => Array.isArray(n.tags) ? n.tags : []));
      const tagSel = document.getElementById("filterTag");
      tagSel.innerHTML = `<option value="">All Tags</option>` + allTags.map(t => `<option value="${t}">${t}</option>`).join("");

      // States
      const allStates = uniq(allNumbers.map(n => n.state || "Unknown")).filter(Boolean).sort();
      const stateSel = document.getElementById("filterState");
      stateSel.innerHTML = `<option value="">All States</option>` + allStates.map(s => `<option value="${s}">${s}</option>`).join("");
    }

    function applyFilters() {
      const q = document.getElementById("searchQ").value.toLowerCase().trim();
      const mode = document.getElementById("filterMode").value;
      const tag = document.getElementById("filterTag").value;
      const state = document.getElementById("filterState").value;

      filtered = allNumbers.filter(n => {
        const matchesQ = !q ||
          n.number.toLowerCase().includes(q) ||
          (n.notes || "").toLowerCase().includes(q) ||
          (n.tags || []).some(t => t.toLowerCase().includes(q));
        const matchesMode = !mode || n.mode === mode;
        const matchesTag = !tag || (n.tags || []).includes(tag);
        const matchesState = !state || (n.state === state);
        return matchesQ && matchesMode && matchesTag && matchesState;
      });

      renderNumbers();
    }

    function clearFilters() {
      document.getElementById("searchQ").value = "";
      document.getElementById("filterMode").value = "";
      document.getElementById("filterTag").value = "";
      document.getElementById("filterState").value = "";
      applyFilters();
    }

    // ---------- Render ----------
    function renderNumbers() {
      const grid = document.getElementById("numbersGrid");
      const empty = document.getElementById("emptyState");
      if (filtered.length === 0) {
        grid.innerHTML = "";
        empty.style.display = "block";
        return;
      }
      empty.style.display = "none";

      grid.innerHTML = filtered.map(n => {
        const tags = (n.tags || []).map(t => `<span class="tag">${t}</span>`).join("");
        return `
          <div class="card" data-id="${n._id}">
            <div class="row" style="justify-content:space-between;align-items:flex-start">
              <div>
                <div style="font-size:1.1rem;font-weight:600;color:hsl(var(--primary));">${n.number}</div>
                <div class="row" style="margin:.4rem 0">
                  <span class="mode-badge ${n.mode === "CALL" ? "mode-call":"mode-otp"}">${n.mode}</span>
                  <span class="tag">${n.state || "Unknown"}</span>
                </div>
                ${tags ? `<div class="row" style="margin:.2rem 0">${tags}</div>` : ""}
                ${n.notes ? `<div style="opacity:.8;margin-top:.3rem"><em>${n.notes}</em></div>` : ""}
              </div>
              <div class="row">
                <select class="edit-mode" onchange="changeModeQuick('${n._id}', this.value)">
                  <option value="CALL" ${n.mode === "CALL" ? "selected":""}>CALL</option>
                  <option value="OTP" ${n.mode === "OTP" ? "selected":""}>OTP</option>
                </select>
                <button class="btn btn-destructive" onclick="removeNumber('${n._id}')">Delete</button>
              </div>
            </div>
            <div style="margin-top:.7rem" class="grid grid-3">
              <input class="edit-tags" type="text" placeholder="tags, comma,separated" value="${(n.tags||[]).join(", ")}"/>
              <input class="edit-state" type="text" placeholder="State (e.g., Texas)" value="${n.state || ""}"/>
              <input class="edit-notes" type="text" placeholder="Notes" value="${n.notes || ""}"/>
            </div>
            <div class="row" style="margin-top:.6rem">
              <button class="btn btn-primary" onclick="saveEdits('${n._id}')">Save Changes</button>
            </div>
          </div>
        `;
      }).join("");
    }
  </script>
</body>
</html>
