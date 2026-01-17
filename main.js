/* ===== VA EFB (Pure Frontend) ===== */

const $ = (s) => document.querySelector(s);
const fmt = (iso) => new Date(iso).toLocaleString();

// --- Session keys (UNIFIED) ---
const TOKEN_KEY = "va_token";
const USER_KEY = "va_user";
const SEL_FLIGHT_KEY = "sel_flight";
const API_BASE_KEY = "api_base";

const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);

const getUser = () => localStorage.getItem(USER_KEY) || "";
const setUser = (u) => localStorage.setItem(USER_KEY, u);

const getSelectedFlight = () => localStorage.getItem(SEL_FLIGHT_KEY) || "";
const setSelectedFlight = (id) => localStorage.setItem(SEL_FLIGHT_KEY, id);

// --- Events storage (offline-first) ---
const getEvents = (id) => JSON.parse(localStorage.getItem("events_" + id) || "[]");
const saveEvent = (id, ev) => {
  const list = getEvents(id);
  list.unshift(ev);
  localStorage.setItem("events_" + id, JSON.stringify(list));
};

// ===== API config (placeholder for vAMSYS via proxy) =====
const getApiBase = () => localStorage.getItem(API_BASE_KEY) || "";

// ===== Mock flights =====
const MOCK_FLIGHTS = [
  {
    id: "f001",
    callsign: "VAM123",
    flightNumber: "VA123",
    aircraft: { icao: "A320", reg: "EC-VAA" },
    dep: { icao: "LEVC", name: "Valencia" },
    arr: { icao: "LEMD", name: "Madrid" },
    etd: "2026-01-17T20:30:00Z",
    eta: "2026-01-17T21:25:00Z",
    route: "DCT VTB UN975 TOSNU DCT",
    status: "Scheduled",
  },
  {
    id: "f002",
    callsign: "VAM456",
    flightNumber: "VA456",
    aircraft: { icao: "B738", reg: "EC-VAB" },
    dep: { icao: "LEMD", name: "Madrid" },
    arr: { icao: "LEBL", name: "Barcelona" },
    etd: "2026-01-18T09:10:00Z",
    eta: "2026-01-18T10:20:00Z",
    route: "DCT TOU UN851 BCN DCT",
    status: "Scheduled",
  },
];

let flights = [...MOCK_FLIGHTS];

// ===== ACARS SIM (AUTO EVENTS) =====
let __acarsTimer = null;
let __acarsRunningFor = "";

function startAcarsSim(flightId) {
  stopAcarsSim();
  __acarsRunningFor = flightId;

  // tweak timings here (ms)
  const plan = [
    { type: "START", delay: 0 },
    { type: "OFFBLOCK", delay: 8000 },
    { type: "TAKEOFF", delay: 25000 },
    { type: "LANDING", delay: 55000 },
    { type: "COMPLETE", delay: 65000 },
  ];

  let idx = 0;

  const fire = async () => {
    if (__acarsRunningFor !== flightId) return;

    const item = plan[idx];
    if (!item) {
      stopAcarsSim();
      return;
    }

    const ev = {
      type: item.type,
      time: new Date().toISOString(),
      note: "SIM ACARS",
    };

    await postEventToApi(flightId, ev);
    saveEvent(flightId, ev);

    idx += 1;
    route();

    const next = plan[idx];
    if (next) {
      __acarsTimer = setTimeout(fire, next.delay - item.delay);
    } else {
      stopAcarsSim();
    }
  };

  __acarsTimer = setTimeout(fire, plan[0].delay);
}

function stopAcarsSim() {
  if (__acarsTimer) clearTimeout(__acarsTimer);
  __acarsTimer = null;
  __acarsRunningFor = "";
}

// ===== API functions (safe placeholders) =====
async function fetchFlights() {
  const API_BASE = getApiBase();
  if (!API_BASE) {
    flights = [...MOCK_FLIGHTS];
    return flights;
  }

  try {
    const res = await fetch(`${API_BASE}/api/flights`, {
      headers: {
        "Content-Type": "application/json",
        "X-VA-User": getUser(),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Bad flights payload");
    flights = data;
    return flights;
  } catch (e) {
    console.log("fetchFlights failed -> fallback mock", e);
    flights = [...MOCK_FLIGHTS];
    return flights;
  }
}

async function postEventToApi(flightId, ev) {
  const API_BASE = getApiBase();
  if (!API_BASE) return false;

  try {
    const res = await fetch(`${API_BASE}/api/flights/${flightId}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VA-User": getUser(),
      },
      body: JSON.stringify(ev),
    });
    return res.ok;
  } catch (e) {
    console.log("postEventToApi failed", e);
    return false;
  }
}

// ===== Flight stage / progress =====
function getFlightStage(flightId) {
  const events = getEvents(flightId);
  const has = (t) => events.some((e) => e.type === t);

  if (has("COMPLETE")) return { key: "COMPLETE", label: "Completed", step: 5 };
  if (has("LANDING")) return { key: "LANDING", label: "Landed", step: 4 };
  if (has("TAKEOFF")) return { key: "TAKEOFF", label: "Airborne", step: 3 };
  if (has("OFFBLOCK")) return { key: "OFFBLOCK", label: "Offblock", step: 2 };
  if (has("START")) return { key: "START", label: "Started", step: 1 };
  return { key: "SCHEDULED", label: "Scheduled", step: 0 };
}

function renderProgressBar(step) {
  const labels = ["Sched", "Start", "Off", "Air", "Ldg", "Done"];
  const pct = Math.round((step / 5) * 100);

  return `
    <div style="margin-top:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <small>Progress</small>
        <small>${pct}%</small>
      </div>

      <div style="height:10px; border:1px solid var(--border); border-radius:999px; overflow:hidden; margin-top:6px;">
        <div style="height:100%; width:${pct}%; background: var(--btn);"></div>
      </div>

      <div style="display:flex; justify-content:space-between; margin-top:6px;">
        ${labels
          .map((l, i) => `<small style="color:${i <= step ? "var(--text)" : "var(--muted)"}">${l}</small>`)
          .join("")}
      </div>
    </div>
  `;
}

// ===== Router =====
function route() {
  const hash = location.hash || "#/login";
  const [, page, section] = hash.split("/");

  if (!getToken() && page !== "login") {
    location.hash = "#/login";
    return;
  }

  if (page === "login") {
    renderLogin();
  } else if (page === "app") {
    renderApp(section || "flights").catch((e) => {
      console.error(e);
      alert("App error: " + (e?.message || e));
      location.hash = "#/login";
    });
  } else {
    location.hash = "#/app/flights";
  }
}

// ===== Shell =====
function shell(title, content) {
  const user = getUser();
  const zulu = new Date().toISOString().slice(11, 19) + "Z";

  document.body.innerHTML = `
    <header>
      <div><strong>${title}</strong></div>
      <div style="display:flex; align-items:center; gap:10px;">
        <small id="clock">${user ? user + " · " : ""}${zulu}</small>
        ${getToken() ? `<button class="secondary" id="logout">Logout</button>` : ""}
      </div>
    </header>
    <main>${content}</main>
  `;

  const lo = $("#logout");
  if (lo) {
    lo.onclick = () => {
      setToken("");
      location.hash = "#/login";
      route();
    };
  }

  // live Zulu clock (ensure only one timer)
  if (window.__zuluTimer) clearInterval(window.__zuluTimer);
  window.__zuluTimer = setInterval(() => {
    const el = document.getElementById("clock");
    if (!el) return;
    const userNow = getUser();
    const z = new Date().toISOString().slice(11, 19) + "Z";
    el.textContent = (userNow ? userNow + " · " : "") + z;
  }, 1000);
}

// ===== Login =====
function renderLogin() {
  shell(
    "VA EFB · Login",
    `
    <div class="card" style="max-width:420px;margin:30px auto;">
      <div class="k">VAMSYS USER</div>
      <input id="user" placeholder="e.g. PILOT123" value="${getUser()}" />

      <div class="k" style="margin-top:10px;">VAMSYS PASSWORD</div>
      <input id="pass" type="password" placeholder="••••••••" />

      <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
        <button id="enter">Login</button>
        <button class="secondary" id="reset">Reset</button>
      </div>

      <p style="margin-top:10px;">
        <small>模拟登录（不会直连 vAMSYS）。未来会用 VA 后端 Proxy。</small>
      </p>
    </div>
    `
  );

  $("#enter").onclick = () => {
    const user = $("#user").value.trim();
    const pass = $("#pass").value.trim();
    if (!user || !pass) return alert("请输入 USER 和 PASSWORD");

    setUser(user);
    setToken("vamsys-session");

    location.hash = "#/app/flights";
    route();
  };

  $("#reset").onclick = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(SEL_FLIGHT_KEY);
    localStorage.removeItem(API_BASE_KEY);
    stopAcarsSim();
    alert("Reset done. Please login again.");
    location.hash = "#/login";
    route();
  };
}

// ===== App Layout =====
async function renderApp(section = "flights") {
  await fetchFlights();

  const user = getUser() || "—";
  const sel = getSelectedFlight() || flights[0]?.id || "";
  const active = section || "flights";

  if (!getSelectedFlight() && sel) setSelectedFlight(sel);

  shell(
    "VA EFB",
    `
    <div class="efb-app">
      <aside class="sidebar">
        <div class="brand">
          <div>
            <div class="title">VA EFB</div>
            <small>${user}</small>
          </div>
          <div class="pill">v0.1</div>
        </div>

        <div class="nav">
          <button class="${active === "flights" ? "active" : ""}" data-nav="flights">
            Flights
            <small>Roster / Dispatch</small>
          </button>

          <button class="${active === "briefing" ? "active" : ""}" data-nav="briefing">
            Briefing
            <small>Route / Notes</small>
          </button>

          <button class="${active === "events" ? "active" : ""}" data-nav="events">
            Events
            <small>Start · Offblock · Takeoff · Landing</small>
          </button>

          <button class="${active === "docs" ? "active" : ""}" data-nav="docs">
            Docs
            <small>SOP / Links</small>
          </button>

          <button class="${active === "settings" ? "active" : ""}" data-nav="settings">
            Settings
            <small>API / Debug</small>
          </button>
        </div>

        <div class="card" style="margin-top:12px;">
          <div class="k">Selected flight</div>
          <div class="v" id="selFlightLine">—</div>
          <small id="selFlightSub">—</small>
          <div style="margin-top:10px;">
            <span class="pill" id="selFlightPhase">—</span>
          </div>
        </div>
      </aside>

      <section class="content" id="content"></section>
    </div>
    `
  );

  // nav clicks
  document.querySelectorAll("button[data-nav]").forEach((b) => {
    b.onclick = () => {
      location.hash = `#/app/${b.dataset.nav}`;
      route();
    };
  });

  // selected flight info (MUST be after shell)
  const f = flights.find((x) => x.id === sel);
  if (f) {
    $("#selFlightLine").textContent = `${f.callsign} · ${f.aircraft.icao}`;
    $("#selFlightSub").textContent = `${f.dep.icao} → ${f.arr.icao} · ETD ${fmt(f.etd)}`;
    const ph = $("#selFlightPhase");
    if (ph) ph.textContent = getFlightStage(f.id).label;
  }

  // render section
  if (active === "flights") renderFlights(sel);
  else if (active === "briefing") renderBriefing(sel);
  else if (active === "events") renderEvents(sel);
  else if (active === "settings") renderSettings();
  else renderDocs();
}

// ===== Section: Flights =====
function renderFlights(selectedId) {
  const el = $("#content");

  el.innerHTML = `
    <div class="card">
      <div class="topline">
        <div>
          <div class="k">Roster</div>
          <div class="v">Upcoming flights</div>
        </div>
        <div class="pill good">${flights.length} scheduled</div>
      </div>
      <small>API: ${getApiBase() ? "ON (proxy)" : "OFF (mock)"} · ACARS SIM: ${
        __acarsRunningFor ? "RUNNING" : "OFF"
      }</small>
    </div>

    <div class="flight-list">
      ${flights
        .map((f) => {
          const isSel = f.id === selectedId;
          const st = getFlightStage(f.id);
          const sim = __acarsRunningFor === f.id ? `<span class="pill warn">SIM</span>` : "";
          return `
            <div class="card flight-card" data-flight="${f.id}" style="${
              isSel
                ? "border-color: rgba(31,111,235,.7); box-shadow: 0 0 0 1px rgba(31,111,235,.25) inset;"
                : ""
            }">
              <div class="topline">
                <div style="display:flex;flex-direction:column;gap:4px;">
                  <div><strong>${f.callsign}</strong> <small>(${f.flightNumber})</small></div>
                  <small>${f.dep.icao} → ${f.arr.icao} · ${f.aircraft.icao} (${f.aircraft.reg})</small>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                  ${sim}
                  <span class="pill">${st.label}</span>
                </div>
              </div>

              ${renderProgressBar(st.step)}

              <div style="margin-top:10px;" class="row">
                <div class="kv"><div class="k">ETD</div><div class="v">${fmt(f.etd)}</div></div>
                <div class="kv"><div class="k">ETA</div><div class="v">${fmt(f.eta)}</div></div>
              </div>

              <div style="margin-top:10px;">
                <div class="k">Route</div>
                <div class="v" style="line-height:1.4">${f.route}</div>
              </div>

              <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
                <button class="secondary" data-copy="${f.id}">Copy Route</button>
                <button data-open="${f.id}">Open Briefing</button>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;

  // select flight
  document.querySelectorAll("[data-flight]").forEach((card) => {
    card.onclick = () => {
      const id = card.dataset.flight;
      setSelectedFlight(id);
      location.hash = "#/app/flights";
      route();
    };
  });

  // copy route
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const f = flights.find((x) => x.id === btn.dataset.copy);
      if (!f) return;
      await navigator.clipboard.writeText(f.route);
      alert("Route copied!");
    };
  });

  // open briefing
  document.querySelectorAll("[data-open]").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      setSelectedFlight(btn.dataset.open);
      location.hash = "#/app/briefing";
      route();
    };
  });
}

// ===== Section: Briefing =====
function renderBriefing(id) {
  const f = flights.find((x) => x.id === id);
  const el = $("#content");
  if (!f) {
    el.innerHTML = `<div class="card">No flight selected.</div>`;
    return;
  }

  const st = getFlightStage(id);

  el.innerHTML = `
    <div class="card">
      <div class="topline">
        <div>
          <div class="k">Briefing</div>
          <div class="v">${f.callsign} · ${f.dep.icao} → ${f.arr.icao}</div>
        </div>
        <span class="pill warn">${f.aircraft.icao}</span>
      </div>

      <div style="margin-top:10px;">
        <div class="k">Route</div>
        <div class="v" style="line-height:1.4">${f.route}</div>
      </div>

      ${renderProgressBar(st.step)}

      <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
        <button id="copyRoute">Copy Route</button>
        <button class="secondary" id="goEvents">Go Events</button>
      </div>
    </div>

    <div class="card">
      <div class="k">Pilot notes</div>
      <input id="note" placeholder="e.g. gate, SID/STAR, remarks..." />
      <div style="margin-top:10px;">
        <button class="secondary" id="saveNote">Save Note</button>
      </div>
      <p><small>注：现在先存本地，后面接 vAMSYS/ACARS 再同步。</small></p>
    </div>
  `;

  $("#copyRoute").onclick = async () => {
    await navigator.clipboard.writeText(f.route);
    alert("Route copied!");
  };

  $("#goEvents").onclick = () => {
    location.hash = "#/app/events";
    route();
  };

  const key = "note_" + id;
  $("#note").value = localStorage.getItem(key) || "";
  $("#saveNote").onclick = () => {
    localStorage.setItem(key, $("#note").value);
    alert("Saved");
  };
}

// ===== Section: Events =====
async function renderEvents(id) {
  const f = flights.find((x) => x.id === id);
  const el = $("#content");
  if (!f) {
    el.innerHTML = `<div class="card">No flight selected.</div>`;
    return;
  }

  const events = getEvents(id);

  el.innerHTML = `
    <div class="card">
      <div class="topline">
        <div>
          <div class="k">Events</div>
          <div class="v">${f.callsign} · ${f.dep.icao} → ${f.arr.icao}</div>
        </div>
        <span class="pill">${events.length} records</span>
      </div>

      <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
        ${["START", "OFFBLOCK", "TAKEOFF", "LANDING", "COMPLETE"]
          .map((t) => `<button data-ev="${t}">${t}</button>`)
          .join("")}
      </div>

      <div style="margin-top:10px;">
        <input id="evNote" placeholder="optional note (delay, gate, etc.)" />
      </div>

      <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="secondary" id="acarsStart">SIM ACARS START</button>
        <button class="danger" id="acarsStop">SIM ACARS STOP</button>
      </div>
    </div>

    <div class="card">
      <div class="k">History</div>
      <div style="margin-top:10px;">
        ${events.length ? events.map(drawEvent).join("") : "<small>No events yet.</small>"}
      </div>
    </div>
  `;

  // event buttons
  document.querySelectorAll("button[data-ev]").forEach((b) => {
    b.onclick = async () => {
      const ev = {
        type: b.dataset.ev,
        time: new Date().toISOString(),
        note: $("#evNote").value.trim(),
      };

      await postEventToApi(id, ev);
      saveEvent(id, ev);

      route();
    };
  });

  // ACARS SIM buttons (NOT inside the loop)
  const s = $("#acarsStart");
  if (s) {
    s.onclick = () => {
      startAcarsSim(id);
      alert("SIM ACARS started");
    };
  }

  const t = $("#acarsStop");
  if (t) {
    t.onclick = () => {
      stopAcarsSim();
      alert("SIM ACARS stopped");
      route();
    };
  }
}

function drawEvent(e) {
  return `
    <div class="card" style="margin:10px 0;">
      <div class="row">
        <div class="kv"><div class="k">Type</div><div class="v">${e.type}</div></div>
        <div class="kv"><div class="k">Time</div><div class="v">${fmt(e.time)}</div></div>
      </div>
      ${e.note ? `<div style="margin-top:8px;"><small>${e.note}</small></div>` : ""}
    </div>
  `;
}

// ===== Section: Docs =====
function renderDocs() {
  const el = $("#content");
  el.innerHTML = `
    <div class="card">
      <div class="k">Docs</div>
      <div class="v">SOP / Links</div>
      <p><small>你可以把常用链接放这里：ChartFox、Navigraph、VA SOP、Discord、活动通告。</small></p>
    </div>

    <div class="card">
      <div class="k">Quick links</div>
      <ul>
        <li><a href="#" onclick="alert('Later: open ChartFox/Navigraph'); return false;">Charts</a></li>
        <li><a href="#" onclick="alert('Later: SOP PDF list'); return false;">SOP</a></li>
        <li><a href="#" onclick="alert('Later: VA website'); return false;">VA Website</a></li>
      </ul>
    </div>
  `;
}

// ===== Section: Settings =====
function renderSettings() {
  const el = $("#content");
  const current = getApiBase();

  el.innerHTML = `
    <div class="card">
      <div class="k">API Base (Proxy URL)</div>
      <div class="v">未来接 vAMSYS API v3：EFB → 你们的 Proxy → vAMSYS</div>

      <div style="margin-top:10px;">
        <input id="apiBase" placeholder="https://your-proxy.example.com" value="${current}" />
      </div>

      <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
        <button id="saveApi">Save</button>
        <button class="secondary" id="clearApi">Clear</button>
        <button class="secondary" id="testApi">Test /api/flights</button>
      </div>

      <p style="margin-top:10px;">
        <small>
          留空 = 使用本地 mock。<br/>
          填写后 = 尝试从 <code>/api/flights</code> 拉 roster。<br/>
          （你们还没部署 Proxy 时，别填）
        </small>
      </p>
    </div>
  `;

  $("#saveApi").onclick = () => {
    const v = $("#apiBase").value.trim();
    localStorage.setItem(API_BASE_KEY, v);
    alert("Saved. Reloading...");
    location.reload();
  };

  $("#clearApi").onclick = () => {
    localStorage.removeItem(API_BASE_KEY);
    alert("Cleared. Reloading...");
    location.reload();
  };

  $("#testApi").onclick = async () => {
    const v = $("#apiBase").value.trim();
    if (!v) return alert("先填 API Base");

    try {
      const res = await fetch(`${v}/api/flights`, {
        headers: { "X-VA-User": getUser() },
      });
      const txt = await res.text();
      alert(`HTTP ${res.status}\n` + txt.slice(0, 600));
    } catch (e) {
      alert("Test failed: " + e);
    }
  };
}

// ===== Start =====
window.addEventListener("hashchange", route);
route();
