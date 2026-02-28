/**
 * ~/ai-agent/backend/server.cjs
 * Backend do Agente Supremo (Termux):
 * - GET  /health
 * - POST /run    (runner seguro por alias)
 * - POST /agent  (envia texto para ~/ai-agent/agente.sh via stdin)
 *
 * Segurança:
 * - Header obrigatório: x-agent-token (em /run e /agent)
 * - Só executa aliases pré-definidos (sem comando livre)
 */

const express = require("express");
const { spawn } = require("child_process");
const path = require("path");

const app = express();

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

function logLine(text, level = "info") {
  sseSend("log", { ts: nowHHMMSS(), level, text: String(text) });
}

const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.AGENT_TOKEN || "dev-token";

// raiz do projeto
const ROOT = process.env.AGENT_ROOT || path.join(process.env.HOME || "", "ai-agent");

// script principal do agente
const AGENT_SH = path.join(ROOT, "agente.sh");

// CORS simples (para o PWA chamar do navegador)
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

// Runner seguro por alias (em vez de comando livre)
const COMMANDS = {
  // básicos
  "sys:pwd": { cmd: "pwd", args: [], cwd: ROOT },
  "sys:ls": { cmd: "ls", args: [], cwd: ROOT },
  "sys:ls-la": { cmd: "ls", args: ["-la"], cwd: ROOT },
  "sys:node": { cmd: "node", args: ["-v"], cwd: ROOT },
  "sys:npm": { cmd: "npm", args: ["-v"], cwd: ROOT },
  "sys:termux-info": { cmd: "termux-info", args: [], cwd: ROOT },
  "fix:clean": {
  cmd: "bash",
  args: ["-lc", "cd ~/ai-agent/pwa && rm -rf .vite"],
  cwd: ROOT,
},

"fix:reinstall": {
  cmd: "bash",
  args: ["-lc", "cd ~/ai-agent/pwa && npm install"],
  cwd: ROOT,
},  

// PWA (Vite)
  "pwa:install": { cmd: "npm", args: ["install"], cwd: path.join(ROOT, "pwa") },
  "pwa:dev": {
    cmd: "npm",
    args: ["run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"],
    cwd: path.join(ROOT, "pwa"),
  },
 
"sys:startall": {
  cmd: "bash",
  args: ["-lc", "~/ai-agent/scripts/start-all.sh"],
},

 "pwa:build": { cmd: "npm", args: ["run", "build"], cwd: path.join(ROOT, "pwa") },

  // Auto-fix (PWA)
  "fix:clean": { cmd: "bash", args: ["-lc", "rm -rf node_modules .vite"], cwd: path.join(ROOT, "pwa") },
  "fix:reinstall": {
    cmd: "bash",
    args: ["-lc", "rm -rf node_modules .vite && npm install"],
    cwd: path.join(ROOT, "pwa"),
},

"dev:up": {
  cmd: "npm",
  args: ["run", "dev", "--", "--host",
 "0.0.0.0", "--port", "5173"],
  cwd: path.join(ROOT, "pwa"),
},
  // Backend
  "backend:install": { cmd: "npm", args: ["install"], cwd: path.join(ROOT, "backend") },
};



function runSpawn(cmd, args, options) {
logLine(`Executando: ${cmd} ${args.join(" ")}`);
  return new Promise((resolve) => {
    const p = spawn(cmd, args, {
      cwd: options?.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let out = "";
    let err = "";

   p.stdout.on("data", (d) => {
  const s = d.toString();
  out += s;
  logLine(s, "out");
});
p.stderr.on("data", (d) => {
  const s = d.toString();
  err += s;
  logLine(s, "err");
});
    // timeout simples (30s)
    const to = setTimeout(() => {
      try { p.kill("SIGKILL"); } catch {}
      resolve({ code: 124, stdout: out, stderr: err + "\n[timeout]" });
    }, 30_000);

    p.on("close", (code) => {
p.on("close", (code) => {
  logLine(`Processo finalizou (code=${code})`, code === 0 ? "ok" : "err");
  resolve({ code, out, err });
});    
  clearTimeout(to);
      resolve({ code: Number(code ?? 0), stdout: out, stderr: err });
    });

    // se alguém quiser usar stdin (no /agent)
    if (options?.stdinText != null) {
      p.stdin.write(String(options.stdinText));
      if (!String(options.stdinText).endsWith("\n")) p.stdin.write("\n");
      p.stdin.end();
    } else {
      p.stdin.end();
    }
  });
}

// health (aberto)
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "agente-supremo-backend",
    port: PORT,
    root: ROOT,
    agent: AGENT_SH,
    time: new Date().toISOString(),
    allowedAliases: Object.keys(COMMANDS),
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

app.get("/status", (req, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
    pid: process.pid,
    cwd: process.cwd(),
    node: process.version,
  });
});

// runner seguro
app.post("/run", requireToken, async (req, res) => {
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

  const result = await runSpawn(entry.cmd, entry.args, { cwd: entry.cwd });
  res.json({
    ok: result.code === 0,
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    meta: { alias, cwd: entry.cwd },
  });
});

// manda texto para o agente.sh (sem interpolar string em bash -lc)
app.post("/agent", requireToken, async (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ ok: false, error: "Envie { text }" });

  const result = await runSpawn("bash", [AGENT_SH], { cwd: ROOT, stdinText: text });
  res.json({
    ok: result.code === 0,
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[backend] ON http://0.0.0.0:${PORT}`);
  console.log(`[backend] ROOT: ${ROOT}`);
  console.log(`[backend] TOKEN: ${TOKEN}`);
});
