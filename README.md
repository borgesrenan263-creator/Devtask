# 🧠 Agente Supremo

Painel web (PWA) para controlar um backend local no Termux e executar ações rápidas (saúde, comandos, auto-correção), com foco em **workflow mobile**.

[![Deploy](https://img.shields.io/badge/Render-Live-success)](https://agente-supremo-ui.onrender.com/)
[![PWA](https://img.shields.io/badge/PWA-Installable-blue)](#)
[![Node](https://img.shields.io/badge/Node-18%2B-brightgreen)](#)
[![License](https://img.shields.io/badge/License-ISC-lightgrey)](#licença)

🔗 **Demo (UI online):** https://agente-supremo-ui.onrender.com/

---

## ✨ O que é

O **Agente Supremo** é um painel rápido que conecta uma interface web (Vite + PWA) a um backend Node/Express que roda no **Termux**.
A proposta é acelerar tarefas do dia a dia no celular: verificar status, disparar ações e organizar uma base para evoluir em um agente mais completo.

---

## ✅ Funcionalidades

- **Health check** do backend (status/porta)
- **Execução de ações rápidas** via UI
- **Auto corrigir** (base para rotinas automáticas)
- **PWA instalável** (atalho na tela inicial)
- **Funciona em rede local** (outro dispositivo acessa via IP)

---

## 🧱 Stack

- Frontend: **Vite + JavaScript + CSS (PWA)**
- Backend: **Node.js + Express**
- Ambiente: **Termux (Android)**
- Deploy UI: **Render (Static Site)**

---

## 📸 Prints

> Adicione prints aqui (recomendado para portfólio)
- `docs/print-1.png`
- `docs/print-2.png`

---

## 🚀 Como rodar local (Termux)

### 1) Backend
```bash
cd backend
npm install
node server.cjs
