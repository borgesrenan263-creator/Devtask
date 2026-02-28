export function renderApp() {
  const app = document.querySelector("#app");

  app.innerHTML = `
    <h1>🤖 Controle de Agente de IA</h1>

    <div class="card">
      <div class="row">
        <button id="btnHealth">Saúde</button>
        <input id="cmd" placeholder="Digite um comando... ex: pwd" />
        <button id="btnRun">Executar</button>
        <span id="statusDot" class="status off"></span>
      </div>

      <label class="checkrow">
        <input id="tAutostart" type="checkbox" />
        <span>Auto-start (iniciar sozinho ao ligar)</span>
      </label>

      <div id="log" class="card logbox"></div>
    </div>

    <h2>🧠 Agente Automático (Tarefas)</h2>

    <div class="card">
      <input id="tName" placeholder="Nome da tarefa (ex: monitor)" />
      <input id="tCmd" placeholder="Comando (ex: pwd)" />
      <input id="tInterval" placeholder="Intervalo seg (ex: 10)" />

      <label class="checkrow">
        <input id="tAutostart" type="checkbox" />
        <span>Auto-start (iniciar sozinho ao ligar)</span>
      </label>

      <div class="row">
        <button id="btnCreate">Criar</button>
        <button id="btnList">Listar</button>
      </div>
    </div>

    <div id="tasks"></div>

    <div id="apiBase" class="api"></div>
  `;
}
