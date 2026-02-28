#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$HOME/projects/meu-pwa}"

say() { printf "%b\n" "$1"; }

normalize() {
  local s="${1:-}"
  s="$(printf "%s" "$s" | tr '[:upper:]' '[:lower:]')"
  s="$(printf "%s" "$s" | sed 's/[^a-z0-9[:space:]]/ /g')"
  s="$(printf "%s" "$s" | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//')"
  printf "%s" "$s"
}

health_check() {
  say "🩺 Saúde do ambiente"
  command -v node >/dev/null && say "Node: $(node -v)" || say "Node: ❌"
  command -v npm  >/dev/null && say "NPM:  $(npm -v)"  || say "NPM: ❌"
  command -v git  >/dev/null && say "Git:  $(git --version)" || say "Git: ❌"
  say "✅ Ambiente verificado."
}

diagnosticar() {
  say "🧠 Cole o erro para diagnóstico:"
  printf "> "
  IFS= read -r err || true
  local e
  e="$(normalize "$err")"

  if [[ "$e" == *"eaddrinuse"* || "$e" == *"address already in use"* ]]; then
    say "🚨 Porta ocupada detectada."
    say "Sugestões:"
    say "  !lsof -i :5173"
    say "  !kill -9 <PID>"
    say "ou:"
    say "  !npm run dev -- --host 0.0.0.0 --port 5174"
    return
  fi

  if [[ "$e" == *"cannot find module"* || "$e" == *"module not found"* ]]; then
    say "📦 Dependência faltando."
    say "Tente:"
    say "  !cd \"$PROJECT_DIR\" && npm install"
    return
  fi

  if [[ "$e" == *"failed to resolve import"* ]]; then
    say "🔎 Import quebrado."
    say "Dica:"
    say "  !grep -R \"import\" \"$PROJECT_DIR/src\""
    return
  fi

  say "🤔 Não reconheci esse erro ainda."
  say "Me envie mais linhas do erro para eu aprender."
}

auto_fix() {
  say "🛠️ Auto-fix básico do projeto..."

  if [[ -f "$PROJECT_DIR/package.json" ]]; then
    say "→ Instalando dependências..."
    (cd "$PROJECT_DIR" && npm install)
  else
    say "⚠️ package.json não encontrado em $PROJECT_DIR"
  fi

  say "→ Limpando cache do Vite..."
  rm -rf "$PROJECT_DIR/node_modules/.vite" 2>/dev/null || true
  rm -rf "$PROJECT_DIR/.vite" 2>/dev/null || true

  say "→ Verificando pasta src..."
  if [[ -d "$PROJECT_DIR/src" ]]; then
    say "✅ src encontrada:"
    ls "$PROJECT_DIR/src"
  else
    say "❌ Pasta src não encontrada."
  fi

  say "✅ Auto-fix concluído."
}

smart_fix() {
  say "🧠 Modo auto-cura ativado."
  say "Cole o erro:"
  printf "> "
  IFS= read -r err || true
  local e
  e="$(normalize "$err")"

  if [[ "$e" == *"eaddrinuse"* || "$e" == *"address already in use"* ]]; then
    say "🚨 Porta ocupada detectada — vou tentar corrigir."

    if command -v lsof >/dev/null 2>&1; then
      local pid
      pid="$(lsof -ti :5173 2>/dev/null | head -n1 || true)"
      if [[ -n "${pid:-}" ]]; then
        say "💀 Matando PID $pid"
        kill -9 "$pid" 2>/dev/null || true
        sleep 1
      else
        say "⚠️ Não achei PID usando 5173."
      fi
    else
      say "⚠️ lsof não está disponível (instale com: !pkg install lsof)."
    fi

    say "🚀 Subindo Vite na porta 5174..."
    (cd "$PROJECT_DIR" &&     # 🔪 mata vite antigo (anti-zumbi)
pkill -f vite >/dev/null 2>&1 || true
pkill -f node >/dev/null 2>&1 || true
sleep 1) &
    say "✅ Tente abrir: http://<seu-ip>:5174"
    return
  fi

  if [[ "$e" == *"cannot find module"* || "$e" == *"module not found"* ]]; then
    say "📦 Dependência faltando — rodando npm install e limpando cache..."
    (cd "$PROJECT_DIR" && npm install) || true
    rm -rf "$PROJECT_DIR/node_modules/.vite" 2>/dev/null || true
    say "✅ Feito. Rode: !cd \"$PROJECT_DIR\" && npm run dev -- --host 0.0.0.0 --port 5173"
    return
  fi

  say "🤔 Ainda não tenho auto-cura para esse erro."
  say "Use 'diagnosticar' para sugestões."
}
VITE_PID_FILE="$HOME/.ai-agent-vite.pid"

VITE_PID_FILE="$HOME/.ai-agent-vite.pid"
VITE_PORT_FILE="$HOME/.ai-agent-vite.port"

vite_get_pid() { [[ -f "$VITE_PID_FILE" ]] && cat "$VITE_PID_FILE" || true; }
vite_get_port(){ [[ -f "$VITE_PORT_FILE" ]] && cat "$VITE_PORT_FILE" || true; }

vite_is_running() {
  local pid
  pid="$(vite_get_pid)"
  if [[ -n "${pid:-}" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

vite_start() {
  local port="${1:-5173}"

  # mata instâncias antigas (anti-zumbi)
  pkill -f "vite.*--host" >/dev/null 2>&1 || true
  pkill -f "node.*vite"   >/dev/null 2>&1 || true
  sleep 1

  # acha porta livre (5173–5188)
  local p
  for p in $(seq "$port" 5188); do
    if ! lsof -i :"$p" >/dev/null 2>&1; then
      port="$p"
      break
    fi
  done

  say "🚀 Iniciando Vite em $port..."
  (cd "$PROJECT_DIR" && npm run dev -- --host 0.0.0.0 --port "$port") >/dev/null 2>&1 &
  echo $! > "$VITE_PID_FILE"
  echo "$port" > "$VITE_PORT_FILE"
  sleep 1
  say "✅ Vite PID $(vite_get_pid) na porta $(vite_get_port)"
}

vite_watch() {
  say "👀 Vigia do Vite ligado (CTRL+C para parar)."
  say "Se cair, eu reinicio. Porta atual: $(vite_get_port || true)"

  # garante que tem um vite rodando
  if ! vite_is_running; then
    vite_start 5173
  fi

  while true; do
    if vite_is_running; then
      echo "✅ Vite OK (PID $(vite_get_pid), porta $(vite_get_port))"
    else
      say "⚠️ Vite caiu. Reiniciando..."
      vite_start 5173
    fi
    sleep 5
  done
}

add_button() {
  local main=""
  for f in "$PROJECT_DIR/src/main.js" "$PROJECT_DIR/src/main.ts"; do
    [[ -f "$f" ]] && main="$f" && break
  done

  if [[ -z "$main" ]]; then
    say "⚠️ Não achei main.js/main.ts"
    return
  fi

  if grep -q "data-agente-botao" "$main"; then
    say "✅ Botão já existe."
    return
  fi

  cat >> "$main" <<'JS'

/* --- agente: botão inteligente --- */
window.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('[data-agente-botao]')) return;

  const btn = document.createElement('button');
  btn.setAttribute('data-agente-botao', '1');
  btn.textContent = 'Botão do agente';
  btn.style.marginTop = '12px';
  btn.onclick = () => alert('Botão OK!');

  const card = document.querySelector('.card');
  const app = document.querySelector('#app');

  if (card) card.appendChild(btn);
  else if (app) app.appendChild(btn);
  else document.body.appendChild(btn);
});
JS

  say "✅ Botão inteligente adicionado."
}

change_title() {
  local html="$PROJECT_DIR/index.html"
  [[ -f "$html" ]] || { say "❌ index.html não encontrado"; return; }

  local new_title="${1:-Meu PWA}"
  sed -i "s|<title>.*</title>|<title>$new_title</title>|" "$html"
  say "✅ Título atualizado para: $new_title"
}

help_menu() {
  say "Exemplos:"
  say "  saude"
  say "  diagnosticar"
  say "  corrigir erro"
  say "  autofix"
  say "  adiciona um botao"
  say "  mudar titulo para Meu App"
  say ""
  say "Modo comando: prefixe com !  (ex: !ls, !npm run dev ...)"
  say ""
  say "Projeto atual: PROJECT_DIR=$PROJECT_DIR"
}

main() {
  say "🤖 Agente pronto. Fale naturalmente."
  help_menu

  while true; do
    printf "\n> "
    IFS= read -r input || exit 0

    # modo shell
    if [[ "$input" == \!* ]]; then
      cmd="${input#!}"
      echo "⚙️ Executando: $cmd"
      set +e
      eval "$cmd"
      set -e
      continue
    fi

    n="$(normalize "$input")"

    case "$n" in
      *sair*|*exit*|*quit*)
        say "👋 Fechando."
        exit 0
        ;;
      *ajuda*|*help*)
        help_menu
        ;;
      *saude*|*status*|*health*)
        health_check
        ;;
      *autofix*|*auto\ fix*|*corrigir\ projeto*)
        auto_fix
        ;;
      *corrigir\ erro*|*auto\ cura*|*smartfix*)
        smart_fix
        ;;
      *diagnosticar*|*diagnostico*)
        diagnosticar
        ;;
      *botao*)
        add_button
        ;;
      *mudar\ titulo\ para*)
        t="${input#*para }"
        change_title "$t"
        ;;
      *mudar\ titulo*)
        change_title
        ;;
*vigiar\ vite*|*watch\ vite*|*monitorar\ vite*)
        vite_watch
        ;;
      *iniciar\ vite*|*start\ vite*)
        vite_start
        ;; *)
        say "🤔 Ainda não entendi... (digite 'ajuda' para ver comandos)"
        ;;
    esac
  done
}

main "$@"
