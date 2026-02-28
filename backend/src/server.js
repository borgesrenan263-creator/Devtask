import http from "http";
import { exec } from "child_process";
import { URL } from "url";

const PORT = 8787;
const TOKEN = process.env.AGENT_TOKEN || "123456";

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,x-agent-token",
  });
  res.end(JSON.stringify(data));
}

function text(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw));
  });
}

function run(cmd, cwd = process.env.HOME) {
  return new Promise((resolve) => {
    exec(cmd, { cwd, shell: "/data/data/com.termux/files/usr/bin/bash" }, (err, stdout, stderr) => {
      resolve({
        code: err?.code ?? 0,
        stdout: String(stdout ?? ""),
        stderr: String(stderr ?? ""),
      });
    });
  });
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return json(res, 200, { ok: true });
  }

  const u = new URL(req.url, `http://${req.headers.host}`);
  const path = u.pathname;

  if (req.method === "GET" && path === "/health") {
    return json(res, 200, { ok: true, workspace: process.env.HOME });
  }

  if (req.method === "POST" && path === "/run") {
    const token = req.headers["x-agent-token"];
    if (token !== TOKEN) return json(res, 401, { error: "Unauthorized" });

    const raw = await readBody(req);
    let payload = {};
    try { payload = JSON.parse(raw || "{}"); } catch { payload = {}; }

    const cmd = payload.cmd;
    if (!cmd || typeof cmd !== "string") return json(res, 400, { error: "Missing cmd" });

    const result = await run(cmd);
    return json(res, 200, { ok: true, result });
  }

  // fallback
  if (req.method === "GET") return text(res, 404, "Not found");
  return text(res, 404, "Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend ON: http://127.0.0.1:${PORT}`);
  console.log(`TOKEN: ${TOKEN}`);
  console.log("Routes: GET /health | POST /run");
});
