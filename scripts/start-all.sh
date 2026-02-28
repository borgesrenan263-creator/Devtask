#!/data/data/com.termux/files/usr/bin/bash
set -e

ROOT="$HOME/ai-agent"
BACK="$ROOT/backend"
PWA="$ROOT/pwa"

echo "[start-all] checando backend (8787)..."
if lsof -i :8787 >/dev/null 2>&1; then
  echo "[start-all] backend OK"
else
  echo "[start-all] subindo backend..."
  (cd "$BACK" && nohup node server.cjs > "$BACK/backend.log" 2>&1 &)
  sleep 1
fi

echo "[start-all] checando vite (5180)..."
if lsof -i :5180 >/dev/null 2>&1; then
  echo "[start-all] vite OK"
else
  echo "[start-all] subindo vite..."
  (cd "$PWA" && rm -rf .vite && nohup npm run dev -- --host 0.0.0.0 --port 5180 --strictPort > "$PWA/vite.log" 2>&1 &)
  sleep 1
fi

echo "[start-all] status:"
lsof -i :8787 || true
lsof -i :5180 || true
echo "[start-all] pronto."
