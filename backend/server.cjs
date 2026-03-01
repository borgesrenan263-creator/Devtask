/**
 * ~/ai-agent/backend/server.cjs
 * Backend do Agente Supremo (Termux):
 * - GET  /health
 * - GET  /status
 * - GET  /events  (SSE logs)
 * - POST /run     (runner seguro por alias)
 * - POST /agent   (envia texto para ~/ai-agent/agente.sh via stdin)
 *
 * Segurança:
 * - Header obrigatório: x-agent-token (em /run e /agent)
 * - Só executa aliases pré-definidos (sem comando livre)
 */

const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();

// ===== Config =====
const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.AGENT_TOKEN || "dev-token";

// raiz do projeto (~/ai-agent por padrão)
const ROOT = process.env.AGENT_ROOT || path.join(process.env.HOME || "", "ai-agent");

// script principal do agente
const AGENT_SH = path.join(ROOT, "agente.sh");

// log em arquivo (fica em ~/ai-agent/backend/backend.log)
const LOG_FILE = path.join(__dirname, "backend.log");

// ===== SSE (logs em tempo real) =====
const SSE_CLIENTS = new Set();

function sseSend(type, data) {
  const payload =
    `event: ${type}\n` +
    `data: ${JSON.stringify(data)}\n\n`;
  for (const res of SSE_CLIENTS) {
    try { res.write(payload); } catch (_) {}
  }
}

function nowHHMMSS() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function safeAppendLog(line) {
  try {
    fs.appendFileSync(LOG_FILE, line + "\n", "utf8");
  } catch (_) {
    // se falhar, só ignora (não queremos derrubar o backend por log)
  }
}

function rotateLogIfNeeded(maxBytes = 2 * 1024 * 1024) {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const st = fs.statSync(LOG_FILE);
    if (st.size <= maxBytes) return;

    const rotated = LOG_FILE.replace(/\.log$/, "") + ".1.log";
    try { fs.unlinkSync(rotated); } catch (_) {}
    fs.renameSync(LOG_FILE, rotated);
    safeAppendLog(`[${new Date().toISOString()}] [info] log rotated -> ${path.basename(rotated)}`);
  } catch (_) {}
}

function logLine(text, level = "info") {
  const ts = nowHHMMSS();
  const line = `[${ts}] [${level}] ${String(text).replace(/\s+$/g, "")}`;
  sseSend("log", { ts, level, text: String(text) });
  safeAppendLog(line);
}

// Rotaciona log na inicialização (simples e eficiente)
rotateLogIfNeeded();

// ===== CORS simples (para o PWA chamar do navegador) =====
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type,x-agent-token");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.use(express.json({ limit: "1mb" }));

function requireToken(req, res, next) {
  const t = req.headers["x-agent-token"];
  if (!t || t !== TOKEN) return res.status(401).json({ ok: false, error: "unauthorized" });
  next();
}

// ===== Runner seguro por alias (sem comando livre) =====
const COMMANDS = {
  // Sistema
  "sys:pwd": { cmd: "pwd", args: [], cwd: ROOT },
  "sys:ls": { cmd: "ls", args: [], cwd: ROOT },
  "sys:ls-la": { cmd: "ls", args: ["-la"], cwd: ROOT },
  "sys:node": { cmd: "node", args: ["-v"], cwd: ROOT },
  "sys:npm": { cmd: "npm", args: ["-v"], cwd: ROOT },
  "sys:termux-info": { cmd: "termux-info",
 args: [], cwd: ROOT },

"fix:clean": {
  cmd: "bash",
  args: ["-lc", "cd ~/ai-agent/pwa && rm -rf .vite node_modules"],
  cwd: ROOT
},

"fix:reinstall": {
  cmd: "bash",
  args: ["-lc", "cd ~/ai-agent/pwa && npm install"],
  cwd: ROOT
},
  // PWA (Vite)
  "pwa:install": { cmd: "npm", args: ["install"], cwd: path.join(ROOT, "pwa") },
  "pwa:dev": {
    cmd: "npm",
    args: ["run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"],
    cwd: path.join(ROOT, "pwa"),
  },
  "pwa:build": { cmd: "npm", args: ["run", "build"], cwd: path.join(ROOT, "pwa") },

  // Auto-fix (PWA)
  "pwa:fix:clean": { cmd: "bash", args: ["-lc", "rm -rf node_modules .vite"], cwd: path.join(ROOT, "pwa") },
  "pwa:fix:reinstall": {
    cmd: "bash",
    args: ["-lc", "rm -rf node_modules .vite && npm install"],
    cwd: path.join(ROOT, "pwa"),
  },

  // Backend
  "backend:install": { cmd: "npm", args: ["install"], cwd: path.join(ROOT, "backend") },

  // Scripts
  "sys:startall": { cmd: "bash", args: ["-lc", "~/ai-agent/scripts/start-all.sh"], cwd: ROOT },
};

// ===== spawn seguro + timeout + logs =====
function runSpawn(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, {
      cwd: options.cwd,
      shell: false,
      env: { ...process.env, ...(options.env || {}) },
    });

    let stdout = "";
    let stderr = "";
    const timeoutMs = options.timeoutMs ?? 30_000;

    p.stdout.on("data", (d) => {
      const s = d.toString();
      stdout += s;
      logLine(s, "info");
    });

    p.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      logLine(s, "err");
    });

    const to = setTimeout(() => {
      try { p.kill("SIGKILL"); } catch (_) {}
      resolve({ code: 124, stdout, stderr: stderr + "\n[timeout]" });
    }, timeoutMs);

    p.on("close", (code) => {
      clearTimeout(to);
      const c = Number(code ?? 0);
      logLine(`Processo finalizou (code=${c})`, c === 0 ? "ok" : "err");
      resolve({ code: c, stdout, stderr });
    });

    // se alguém quiser usar stdin (no /agent)
    if (options.stdinText != null) {
      p.stdin.write(String(options.stdinText));
      if (!String(options.stdinText).endsWith("\n")) p.stdin.write("\n");
    }
    p.stdin.end();
  });
}

// ===== Rotas =====

// health (aberto)
app.get("/health", (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    ok: true,
    service: "agente-supremo-backend",
    port: PORT,
    root: ROOT,
    agent: AGENT_SH,
    node: process.version,
    pid: process.pid,
    uptimeSec: Math.floor(process.uptime()),
    memoryMB: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    },
    time: new Date().toISOString(),
    allowedAliases: Object.keys(COMMANDS),
  });
});

app.get("/status", (_req, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
    pid: process.pid,
    cwd: process.cwd(),
    node: process.version,
  });
});

// SSE endpoint (browser conecta e recebe logs)
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  res.flushHeaders?.();

  // "hello" inicial
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  SSE_CLIENTS.add(res);
  req.on("close", () => {
    SSE_CLIENTS.delete(res);
  });
});

// runner seguro
app.post("/run", requireToken, async (req, res, next) => {
  try {
    const alias = String(req.body?.alias || "").trim();
    if (!alias) return res.status(400).json({ ok: false, error: "Envie { alias }" });

    const entry = COMMANDS[alias];
    if (!entry) {
      return res.status(403).json({
        ok: false,
        error: "alias_not_allowed",
        alias,
        allowedAliases: Object.keys(COMMANDS),
      });
    }

    logLine(`RUN alias=${alias}`, "info");
    const result = await runSpawn(entry.cmd, entry.args, { cwd: entry.cwd });

    res.json({
      ok: result.code === 0,
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
      meta: { alias, cwd: entry.cwd },
    });
  } catch (e) {
    next(e);
  }
});

// manda texto para o agente.sh (sem interpolar string em bash -lc)
app.post("/agent", requireToken, async (req, res, next) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ ok: false, error: "Envie { text }" });

    logLine(`AGENT input (${Math.min(text.length, 120)} chars)`, "info");
    const result = await runSpawn("bash", [AGENT_SH], { cwd: ROOT, stdinText: text });

    res.json({
      ok: result.code === 0,
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (e) {
    next(e);
  }
});

// erro global (não derruba o servidor e dá resposta consistente)
app.use((err, _req, res, _next) => {
  logLine(err?.stack || err?.message || String(err), "err");
  res.status(500).json({ ok: false, error: "internal_error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[backend] ON http://0.0.0.0:${PORT}`);
  console.log(`[backend] ROOT: ${ROOT}`);
  console.log(`[backend] TOKEN: ${TOKEN}`);
  logLine(`Backend ON :${PORT}`, "ok");
});
