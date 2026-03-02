import express from "express";
import cors from "cors";
import os from "os";
import { spawn } from "child_process";

const app = express();
app.use(cors());
app.use(express.json({ limit: "64kb" }));

const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.DEVTASKS_TOKEN || "dev-token";

// ---- runtime state ----
const startedAt = Date.now();
const runs = new Map(); // runId -> { proc, cmd, startedAt }
let reqTotal = 0;
let authFail = 0;
let blocked = 0;
let lastLatencyMs = 0;

const SAFE_WHITELIST = new Set([
  "pwd",
  "ls",
  "ls -la",
  "node -v",
  "npm -v",
  "whoami",
  "uname -a",
  "df -h",
  "free -h",
]);

// CPU % (process) via delta
let lastCpu = process.cpuUsage();
let lastCpuTs = Date.now();

function cpuPercentSinceLast() {
  const now = Date.now();
  const deltaMs = Math.max(1, now - lastCpuTs);

  const cur = process.cpuUsage(lastCpu);
  lastCpu = process.cpuUsage();
  lastCpuTs = now;

  // cur.user/system are microseconds
  const usedMs = (cur.user + cur.system) / 1000;
  const pct = Math.max(0, Math.min(100, (usedMs / (deltaMs * os.cpus().length)) * 100));
  return Number(pct.toFixed(1));
}

app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => {
    reqTotal++;
    lastLatencyMs = Date.now() - t0;
  });
  next();
});

function makeRunId() {
  return Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36).slice(2, 8);
}

function isWhitelisted(cmd) {
  const clean = (cmd || "").trim();
  return SAFE_WHITELIST.has(clean);
}

function runCommand(cmd) {
  const clean = (cmd || "").trim();
  const runId = makeRunId();

  const proc = spawn("sh", ["-lc", clean], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let out = "";
  let err = "";

  proc.stdout.on("data", (d) => (out += d.toString()));
  proc.stderr.on("data", (d) => (err += d.toString()));

  const done = new Promise((resolve) => {
    proc.on("close", (code, signal) => {
      runs.delete(runId);
      resolve({ code, signal, out, err });
    });
  });

  runs.set(runId, { proc, cmd: clean, startedAt: Date.now() });
  return { runId, done };
}

function stopRun(runId) {
  const item = runs.get(runId);
  if (!item) return { ok: false, error: "not_found" };
  try {
    item.proc.kill("SIGTERM");
    return { ok: true };
  } catch {
    return { ok: false, error: "kill_failed" };
  }
}

app.get("/health", (req, res) => {
  res.json({ ok: true, status: "healthy", ts: new Date().toISOString() });
});

app.get("/ping", (req, res) => res.json({ ok: true, pong: true }));
app.get("/info", (req, res) => {
  res.json({
    ok: true,
    root: process.cwd(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
  });
});

// ---- NEW: metrics ----
app.get("/metrics", (req, res) => {
  const mu = process.memoryUsage();
  res.json({
    ok: true,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    reqTotal,
    authFail,
    blocked,
    lastLatencyMs,
    runsActive: runs.size,
    cpuPct: cpuPercentSinceLast(),
    ramMB: Number((mu.rss / 1024 / 1024).toFixed(1)),
    heapUsedMB: Number((mu.heapUsed / 1024 / 1024).toFixed(1)),
  });
});

// token only for /run and /stop
function requireToken(req, res, next) {
  const header = req.header("X-Token") || "";
  if (header !== TOKEN) {
    authFail++;
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  next();
}

app.post("/run", requireToken, async (req, res) => {
  const cmd = (req.body?.cmd || "").trim();
  if (!cmd) return res.status(400).json({ ok: false, error: "empty_cmd" });

  if (!isWhitelisted(cmd)) {
    blocked++;
    return res.status(403).json({ ok: false, error: "blocked", hint: "not in whitelist" });
  }

  const { runId, done } = runCommand(cmd);

  // timeout default 12s (pode ajustar via body.timeoutMs)
  const timeoutMs = Math.min(60000, Math.max(1000, Number(req.body?.timeoutMs || 12000)));
  const timeout = new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), timeoutMs));

  const result = await Promise.race([done, timeout]);

  if (result?.timeout) {
    stopRun(runId);
    return res.json({ ok: false, runId, error: "timeout", timeoutMs });
  }

  return res.json({ ok: true, runId, ...result });
});

app.post("/stop", requireToken, (req, res) => {
  const runId = (req.body?.runId || "").trim();
  if (!runId) return res.status(400).json({ ok: false, error: "missing_runId" });
  return res.json(stopRun(runId));
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`DevTasks backend hardened on ${PORT}`);
});
