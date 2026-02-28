# Agente Supremo (Termux + PWA + Node)

Agente Supremo é um projeto full stack criado 100% via celular (Termux), que integra um **backend Node.js** com um **PWA (Vite)** para **controlar tarefas de desenvolvimento**: health-check, execução controlada de comandos, automações de ambiente e “auto-fix”.

> **Diferencial:** desenvolvido e operado diretamente no Android via Termux.

## O que ele faz
- Painel PWA para acionar comandos e ver logs
- Backend com endpoints de saúde e execução
- Whitelist de comandos (execução controlada)
- Script `start-all.sh` para subir backend + vite automaticamente
- Botão “Iniciar tudo” e “Auto corrigir” (clean + reinstall + dev)

## Tecnologias
- Frontend: Vite + JavaScript (migração para TypeScript em andamento)
- Backend: Node.js
- Execução: Termux (Android)

## Como rodar local (Termux)
### 1) Backend
```bash
cd ~/ai-agent/backend
node server.cjs

