import "./style.css";

const API_BASE =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8787"
    : `http://${location.hostname}:8787`;

const TOKEN = "dev-token";

function $(sel) {
  return document.querySelector(sel);
}

function setStatus(on) {
  const dot = $("#statusDot");
  if (!dot) return;
  dot.className = on ? "status on" : "status off";
}

function log(msg, type = "ok") {
  const box = $("#log");
  if (!box) return;
  const t = new Date().toLocaleTimeString();
  const line = document.createElement("div");
  line.className = `log-${type}`;
  line.textContent = `[${t}] ${msg}`;
  box.prepend(line);
}

function setBtnLoading(btn, loading, textLoading = "Rodando...") {
  if (!btn) return;
  if (loading) {
    btn.dataset.oldText = btn.textContent;
    btn.textContent = textLoading;
    btn.disabled = true;
    btn.style.opacity = "0.7";
  } else {
    if (btn.dataset.oldText) btn.textContent = btn.dataset.oldText;
    btn.disabled = false;
    btn.style.opacity = "";
  }
}

async function api(path, opts = {}) {
  const headers = Object.assign(
    { "Content-Type": "application/json" },
    opts.headers || {}
  );

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const text = await res.text();

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function runAlias(alias) {
  return api("/run", {
    method: "POST",
    headers: { "x-agent-token": TOKEN },
    body: JSON.stringify({ alias }),
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function wireUI() {
  const autoBtn = document.getElementById("btnAutoFix");
  if (!autoBtn) {
    log("ERRO: btnAutoFix não encontrado", "err");
    return;
  }

  log("DEBUG: btnAutoFix conectado");

  autoBtn.onclick = async () => {
    log("Auto corrigir acionado...");
    try {
      await runAlias("fix:clean");
      await runAlias("fix:reinstall");
      log("Auto correção finalizada ✅");
    } catch (e) {
      log("Auto correção falhou: " + (e?.message || e), "err");
    }
  };
}

function renderApp() {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `
    <div class="wrap">
      <h1>Agente Supremo</h1>
      <div class="muted">Painel rapido • Vite + Backend • Termux</div>

      <div class="card">
        <div class="row">
          <button id="btnHealth">Saude</button>
          <button id="btnAutoFix">Auto corrigir</button>
          <select id="alias">
            <option value="sys:pwd">sys:pwd</option>
            <option value="sys:ls">sys:ls</option>
            <option value="sys:ls-la">sys:ls-la</option>
            <option value="sys:node">sys:node</option>
            <option value="sys:npm">sys:npm</option>
            <option value="sys:termux-info">sys:termux-info</option>
            <option value="sys:startall">Iniciar tudo</option>
          </select>

          <button id="btnRunAlias">Executar</button>
          <span id="statusDot" class="status off"></span>
        </div>

        <div class="row" style="margin-top:10px; gap:10px; flex-wrap:wrap;">
          <button id="btnVite" class="primary">Rodar Vite (Termux)</button>
          <button id="btnFixClean">Limpar cache</button>
          <button id="btnFixReinstall">Reinstalar deps</button>
        </div>

        <div class="muted" style="margin-top:8px;">
          Dica: Rodar Vite inicia o dev server na porta 5180. Deixe o Termux aberto.
        </div>

        <div id="viteLink" class="muted" style="margin-top:8px;"></div>
        <div id="log" class="logbox"></div>

      <div class="card">
        <h2 style="margin:0 0 10px 0;">Diagnosticar erro (colar log)</h2>
        <textarea id="logInput" rows="6" placeholder="Cole aqui o LOG/ERRO completo (Vite/Node/Termux)"></textarea>
        <div class="row" style="margin-top:10px;">
          <button id="btnDiagnose">Diagnosticar</button>
          <button id="btnClearLog">Limpar campo</button>
        </div>
        <div id="diagnoseOut" class="muted" style="margin-top:10px;"></div>
      </div>

      <div class="foot">
        API: <span id="apiUrl"></span>
      </div>
    </div>
  `;
 wireUI();

  $("#apiUrl").textContent = API_BASE;
}

async function health() {
  try {
    const r = await api("/health");
    setStatus(true);
    log(`OK saude: porta=${r.port ?? 8787}`, "ok");
  } catch (e) {
    setStatus(false);
    log(`ERRO saude: ${e.message}`, "err");
  }
}

async function runVite() {
  const btn = $("#btnVite");
  setBtnLoading(btn, true, "Copiando comando...");

  try {
   const cmd = `cd ~/ai-agent/pwa && rm -rf .vite && npm run dev -- --host 0.0.0.0 --port 5180 --strictPort`
    // copia pro clipboard (quando permitido)
    try {
      await navigator.clipboard.writeText(cmd);
      log("Comando do Vite copiado! Cole no Termux e rode (Enter).", "ok");
    } catch {
      log("Não deu pra copiar automático. Vou mostrar o comando no log.", "ok");
      log(cmd, "ok");
    }

    // link (abre a porta atual do painel)
    const viteUrl = `http://${location.hostname}:5180`;
    const box = $("#viteLink");
    if (box) box.innerHTML = `Vite: <a href="${viteUrl}" target="_blank">Abrir (${viteUrl})</a>`;
  } catch (e) {
    log(`ERRO Vite: ${e.message}`, "err");
  } finally {
    setBtnLoading(btn, false);
  }
}

async function runSelectedAlias() {
  const alias = ($("#alias")?.value || "").trim();
  if (!alias) return log("Selecione um alias.", "err");

  try {
    log(`Executando: ${alias} ...`, "ok");
    const r = await runAlias(alias);
    const out = (r.stdout || "").trim() || "(sem saida)";
    log(`${alias} -> ${out}`, r.ok ? "ok" : "err");
    if (r.stderr) log(String(r.stderr).trim(), "err");
  } catch (e) {
    log(`ERRO executar: ${e.message}`, "err");
  }
}


async function fixClean() {
  try {
    log("Limpando cache (.vite) e node_modules...", "ok");
    const r = await runAlias("fix:clean");
    log(`fix:clean -> code=${r.code}`, r.ok ? "ok" : "err");
    if (r.stderr) log(String(r.stderr).trim(), "err");
  } catch (e) {
    log(`ERRO fix:clean: ${e.message}`, "err");
  }
}

async function fixReinstall() {
  try {
    log("Reinstalando dependencias (pode demorar)...", "ok");
    const r = await runAlias("fix:reinstall");
    log(`fix:reinstall -> code=${r.code}`, r.ok ? "ok" : "err");
    const out = (r.stdout || "").trim();
    if (out) log(out.slice(0, 600), r.ok ? "ok" : "err");
    if (r.stderr) log(String(r.stderr).trim(), "err");
  } catch (e) {
    log(`ERRO fix:reinstall: ${e.message}`, "err");
  }
}

function basicDiagnose(text) {
  const t = text.toLowerCase();
  const tips = [];
  const actions = [];

  if (t.includes("eaddrinuse") || t.includes("address already in use")) {
    tips.push("Porta em uso. Mude a porta ou mate o processo que ocupa a porta.");
  }
  if (t.includes("cannot find module") || t.includes("module not found")) {
    tips.push("Dependencia faltando. Recomendo reinstalar deps.");
    actions.push("fix:reinstall");
  }
  if (t.includes("failed to resolve import")) {
    tips.push("Import nao resolvido. Pode ser caminho errado ou pacote nao instalado.");
    actions.push("fix:reinstall");
  }
  if (!tips.length) {
    tips.push("Nao identifiquei erro conhecido. Cole mais linhas do log (principalmente o inicio do erro).");
  }

  return { tips, actions };
}

function wireEvents() {
  $("#btnHealth")?.addEventListener("click", health);
  $("#btnRunAlias")?.addEventListener("click", runSelectedAlias);

  $("#btnVite")?.addEventListener("click", runVite);
  $("#btnFixClean")?.addEventListener("click", fixClean);
  $("#btnFixReinstall")?.addEventListener("click", fixReinstall);

  $("#btnClearLog")?.addEventListener("click", () => {
    const el = $("#logInput");
    if (el) el.value = "";
    const out = $("#diagnoseOut");
    if (out) out.innerHTML = "";
  });

// ===== STATUS AO VIVO DO BACKEND =====
async function checkBackendStatus() {
  try {
    const r = await fetch(`${API}/status`);
    const j = await r.json();

    const dot = document.getElementById("statusDot");
    if (!dot) return;

    if (j.ok) {
      dot.classList.remove("off");
      dot.classList.add("on");
    } else {
      dot.classList.remove("on");
      dot.classList.add("off");
    }
  } catch (e) {
    const dot = document.getElementById("statusDot");
    if (dot) {
      dot.classList.remove("on");
      dot.classList.add("off");
    }
  }
}

// checa a cada 5 segundos
setInterval(checkBackendStatus, 5000);

// checa ao abrir
checkBackendStatus();

  $("#btnDiagnose")?.addEventListener("click", () => {
    const text = ($("#logInput")?.value || "").trim();
    if (!text) return log('Cole um log no campo "LOG/ERRO" e toque em Diagnosticar.', "err");

    const { tips, actions } = basicDiagnose(text);
    const out = $("#diagnoseOut");

    if (out) {
      out.innerHTML = `
        <div><b>Possiveis causas:</b></div>
        <ul>${tips.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
        ${
          actions.length
            ? `<div style="margin-top:8px;"><b>Acoes sugeridas:</b> ${actions
                .map((a) => `<code>${escapeHtml(a)}</code>`)
                .join(" ")}</div>`
            : ""
        }
      `;
    }

    log("Diagnostico gerado.", "ok");
  });
}

log("DEBUG: anexando listener do Auto corrigir...");
$("#btnAutoFix")?.addEventListener("click", async () => {
  log("DEBUG: clique no Auto corrigir ✅");
  // resto do código...
});

const autoBtn = document.getElementById("btnAutoFix");
if (!autoBtn) {
  log("ERRO: btnAutoFix não encontrado no HTML", "err");
} else {
  log("DEBUG: btnAutoFix encontrado, anexando click...");
  autoBtn.addEventListener("click", () => {
    log("DEBUG: clique em Auto corrigir ✅");
  });
}

// DEBUG: captura cliques em qualquer lugar (pra saber se JS está vivo e se o botão recebe click)
document.addEventListener("click", (e) => {
  const t = e.target;
  const id = t && t.id ? t.id : "(sem id)";
  const tag = t && t.tagName ? t.tagName : "(sem tag)";
  log(`DEBUG CLICK: tag=${tag} id=${id}`);
}, true);

renderApp();
wireEvents();
health();
