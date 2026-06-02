// index.js — boot do servidor basalt.
// Express + rotas /api + (prod) estático app/dist + watcher de GUT.

const path = require('path');
const fs = require('fs');
const express = require('express');

const config = require('./config');
const routes = require('./routes');
const { startWatcher } = require('./watcher');

const app = express();
app.use(express.json());

app.use('/api', routes);

// Em produção, serve o build do frontend (Vite) se existir.
const DIST = path.resolve(__dirname, '..', 'app', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  // SPA fallback: qualquer rota não-/api volta o index.html.
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

// Inicia o watcher que recalcula os campos fórmula (nunca commita).
// Lê config.TASKS_DIR/schema do VAULT corrente; o watcher relê o schema vivo.
startWatcher({ TASKS_DIR: config.TASKS_DIR, schema: config.schema });

// Auto-escuta SÓ quando rodado direto (`node server/index.js` / `npm start`).
// Quando requerido por outro processo (ex.: Electron main), o consumidor chama
// `app.listen(port, cb)` ele mesmo — incluindo porta 0 (livre) pra evitar conflito.
const PORT = process.env.PORT || 4317;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`basalt server on :${PORT}`);
  });
}

module.exports = app;
