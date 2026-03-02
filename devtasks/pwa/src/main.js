import "./style.css";

const $ = (sel) => document.querySelector(sel);

const LS_AGENTS = "devtasks_agents_v1";
const LS_ACTIVE = "devtasks_active_agent_v1";

function defaultAgents() {
  return [
    {
      id: "agent-1",
      name: "agent-1",
      api: "http://127.0.0.1:8787",
      token: "dev-token",
    },
    {
      id: "agent-2",
      name: "agent-2",
      api: "http://127.0.0.1:8787",
      token: "dev-token",
    },
    {
      id: "agent-3",
      name: "agent-3",
      api: "http://127.0.0.1:8787",
      token: "dev-token",
    },
  ];
}

function loadAgents() {
  try {
    const raw = localStorage.getItem(LS_AGENTS);
    if (!raw) return defaultAgents();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultAgents();
    return parsed;
  } catch {
    return defaultAgents();
  }
}
function saveAgents(agents) {
  localStorage.setItem(LS_AGENTS, JSON.stringify(agents));
}
function loadActiveId(agents) {
  const saved = localStorage.getItem(LS_ACTIVE);
  if (saved && agents.some((a) => a.id === saved)) return saved;
  return agents[0].id;
}
function saveActiveId(id) {
  localStorage.setItem(LS_ACTIVE, id);
}

let agents = loadAgents();
let activeId = loadActiveId(agents);

function activeAgent() {
  return agents.find((a) => a.id === activeId) || agents[0];
}

function setStatus(text, ok = true) {
  const el = $("#statusText");
  if (el) el.textContent = text;
  const dot = $("#statusDot");
  if (dot) dot.style.opacity = ok ? "1" : "0.35";
}

function renderTabs() {
  const wrap = $("#agentTabs");
  if (!wrap) return;
  wrap.innerHTML = "";

  agents.forEach((a) => {
    const b = document.createElement("button");
    b.className = "pill" + (a.id === activeId ? " pill-active" : "");
    b.textContent = a.name;
    b.onclick = () => {
      activeId = a.id;
      saveActiveId(activeId);
      syncFieldsFromAgent();
      renderTabs();
      setStatus("pronto", true);
    };
    wrap.appendChild(b);
  });

  const add = document.createElement("button");
  add.className = "pill";
  add.textContent = "+";
  add.onclick = () => {
    const name = (prompt("Nome do novo agent (ex: agent-4):") || "").trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/\s+/g, "-");
    if (agents.some((a) => a.id === id)) {
      alert("Já existe um agent com esse nome.");
      return;
    }
    const base = activeAgent();
    agents.push({ id, name, api: base.api, token: base.token });
    saveAgents(agents);
    activeId = id;
    saveActiveId(activeId);
    renderTabs();
    syncFieldsFromAgent();
  };
  wrap.appendChild(add);
}

function syncFieldsFromAgent() {
  const a = activeAgent();
  $("#apiInput").value = a.api || "";
  $("#tokenInput").value = a.token || "";
  $("#agentBadge").textContent = `agent: ${a.name}`;
}

function syncAgentFromFields() {
  const a = activeAgent();
  a.api = ($("#apiInput").value || "").trim();
  a.token = ($("#tokenInput").value || "").trim();
  saveAgents(agents);
}

async function httpGet(path) {
  const a = activeAgent();
  const url = (a.api || "").replace(/\/+$/, "") + path;
  const r = await fetch(url, { method: "GET" });
  return { r, json: await r.json().catch(() => ({})) };
}

async function runCmd(cmd) {
  const a = activeAgent();
  const url = (a.api || "").replace(/\/+$/, "") + "/run";
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Token": a.token || "",
    },
    body: JSON.stringify({ cmd }),
  });
  const json = await r.json().catch(() => ({}));
  return { r, json };
}

function appendLog(line) {
  const box = $("#logBox");
  if (!box) return;
  box.textContent += line + "\n";
  box.scrollTop = box.scrollHeight;
}

function clearLog() {
  const box = $("#logBox");
  if (!box) return;
  box.textContent = "";
}

// Perf monitor polling
let perfTimer = null;
async function startPerf() {
  if (perfTimer) clearInterval(perfTimer);
  perfTimer = setInterval(async () => {
    try {
      const { r, json } = await httpGet("/metrics");
      if (!r.ok || !json?.ok) return;
      $("#cpuPill").textContent = `cpu: ${json.cpuPct}%`;
      $("#ramPill").textContent = `ram: ${json.ramMB}MB`;
      $("#reqPill").textContent = `req: ${json.reqTotal}`;
      $("#runsPill").textContent = `runs: ${json.runsActive}`;
      $("#latPill").textContent = `lat: ${json.lastLatencyMs}ms`;
    } catch {}
  }, 2000);
}

function buildUI() {
  document.body.innerHTML = `
  <div class="app">
    <header class="top">
      <div class="title">
        <h1>DevTasks</h1>
        <div class="subtitle">Matrix Black • Neon Green • Mobile-first</div>
      </div>

      <div class="stack">
        <div class="badge">vite</div>
        <div class="badge">mode: dev</div>
        <div class="badge">secure</div>
        <div class="badge">theme: matrix</div>
      </div>
    </header>

    <section class="card">
      <div class="row between">
        <div class="status">
          <span id="statusDot" class="dot"></span>
          <div>
            <div class="statusLine"><b id="statusText">pronto</b></div>
            <div class="muted" id="agentBadge">agent: agent-1</div>
          </div>
        </div>
        <button class="btn" id="retestBtn">Re-testar</button>
      </div>

      <div class="tabs" id="agentTabs"></div>

      <div class="field">
        <label>API (editável)</label>
        <input id="apiInput" spellcheck="false" />
      </div>
      <div class="field">
        <label>TOKEN (X-Token para /run)</label>
        <input id="tokenInput" spellcheck="false" />
      </div>

      <div class="grid2">
        <button class="btn" id="healthBtn">Saúde</button>
        <button class="btn" id="infoBtn">Info</button>
        <button class="btn danger" id="stopBtn">Parar</button>
        <button class="btn" id="saveHistBtn">Salvar histórico</button>
      </div>

      <div class="field">
        <label>Executar comando (seguro / limitado)</label>
        <div class="row">
          <input id="cmdInput" placeholder="ex: pwd | ls | node -v" />
          <button class="btn" id="runBtn">Executar</button>
        </div>
      </div>

      <div class="presets" id="presets"></div>

      <div class="metricsRow">
        <span class="pill" id="cpuPill">cpu: -</span>
        <span class="pill" id="ramPill">ram: -</span>
        <span class="pill" id="reqPill">req: -</span>
        <span class="pill" id="runsPill">runs: -</span>
        <span class="pill" id="latPill">lat: -</span>
      </div>

      <div class="logWrap">
        <div class="row between">
          <div class="muted">Log</div>
          <button class="btn tiny" id="clearLogBtn">Limpar log</button>
        </div>
        <pre id="logBox" class="log"></pre>
      </div>

      <div class="hint">
        Dica: comandos fora da whitelist serão bloqueados. Timeout depende do comando.
      </div>
    </section>
  </div>
  `;
}

function renderPresets() {
  const presets = [
    "pwd",
    "ls",
    "ls -la",
    "node -v",
    "npm -v",
    "whoami",
    "uname -a",
    "df -h",
    "free -h",
  ];
  const wrap = $("#presets");
  wrap.innerHTML = "";
  presets.forEach((p) => {
    const b = document.createElement("button");
    b.className = "pill";
    b.textContent = p;
    b.onclick = async () => {
      $("#cmdInput").value = p;
      await doRun();
    };
    wrap.appendChild(b);
  });
}

let lastRunId = null;

async function doRetest() {
  syncAgentFromFields();
  try {
    const { r } = await httpGet("/health");
    if (!r.ok) throw new Error("health fail");
    setStatus("online • Backend OK", true);
  } catch {
    setStatus("offline • Failed to fetch", false);
  }
}

async function doRun() {
  syncAgentFromFields();
  const cmd = ($("#cmdInput").value || "").trim();
  if (!cmd) {
    appendLog("[warn] comando vazio");
    return;
  }
  setStatus("executando...", true);
  try {
    const { r, json } = await runCmd(cmd);
    if (!r.ok || !json.ok) {
      appendLog(`[run] FAIL • ${json.error || r.status}`);
      setStatus("falha", false);
      return;
    }
    lastRunId = json.runId;
    appendLog(`► run: ${cmd}`);
    if (json.out) appendLog(json.out.trimEnd());
    if (json.err) appendLog(json.err.trimEnd());
    setStatus("pronto", true);
  } catch (e) {
    appendLog(`[run] FAIL • ${String(e)}`);
    setStatus("falha", false);
  }
}

async function doStop() {
  syncAgentFromFields();
  const a = activeAgent();
  const url = (a.api || "").replace(/\/+$/, "") + "/stop";
  if (!lastRunId) {
    appendLog("[stop] nada para parar (sem runId)");
    return;
  }
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Token": a.token || "" },
      body: JSON.stringify({ runId: lastRunId }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.ok) {
      appendLog(`[stop] falhou • ${json.error || r.status}`);
      return;
    }
    appendLog(`[stop] ok • ${lastRunId}`);
  } catch (e) {
    appendLog(`[stop] falhou • ${String(e)}`);
  }
}

async function doInfo() {
  try {
    const { r, json } = await httpGet("/info");
    if (!r.ok || !json.ok) throw new Error("info fail");
    appendLog(`[info] root: ${json.root}`);
    appendLog(`[info] node: ${json.node}`);
  } catch {
    appendLog("[info] falhou");
  }
}

async function doHealth() {
  try {
    const { r, json } = await httpGet("/health");
    if (!r.ok || !json.ok) throw new Error("health fail");
    appendLog(`[health] ok • ${json.ts}`);
  } catch {
    appendLog("[health] FAIL • Failed to fetch");
  }
}

// “Salvar histórico” aqui salva o log atual em arquivo (download)
function saveHistory() {
  const txt = ($("#logBox").textContent || "").trim();
  if (!txt) {
    appendLog("[hist] vazio");
    return;
  }
  const blob = new Blob([txt + "\n"], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `devtasks-log-${activeId}-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
  appendLog("[hist] baixado");
}

buildUI();
renderTabs();
syncFieldsFromAgent();
renderPresets();
startPerf();
doRetest();

$("#apiInput").addEventListener("input", () => syncAgentFromFields());
$("#tokenInput").addEventListener("input", () => syncAgentFromFields());

$("#retestBtn").onclick = doRetest;
$("#runBtn").onclick = doRun;
$("#stopBtn").onclick = doStop;
$("#infoBtn").onclick = doInfo;
$("#healthBtn").onclick = doHealth;
$("#saveHistBtn").onclick = saveHistory;
$("#clearLogBtn").onclick = clearLog;

$("#cmdInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") doRun();
});

// ===== DevTasks loading helper =====
function setLoading(v) {
  document.body.classList.toggle("loading", !!v);
}

// ===== DevTasks run wrapper =====
if (typeof doRun === "function") {
  const __doRunOriginal = doRun;
  doRun = async function (...args) {
    try {
      setLoading(true);
      return await __doRunOriginal.apply(this, args);
    } finally {
      setLoading(false);
    }
  };
}

// ===== DevTasks stop wrapper =====
if (typeof doStop === "function") {
  const __doStopOriginal = doStop;
  doStop = async function (...args) {
    try {
      setLoading(true);
      return await __doStopOriginal.apply(this, args);
    } finally {
      setLoading(false);
    }
  };
}
