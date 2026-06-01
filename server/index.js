// index.js — boot do servidor orchestra-tasks.
// Express + rotas /api + (prod) estático app/dist + watcher de GUT.

const path = require('path');
const fs = require('fs');
const express = require('express');

const { schema, gute, TASKS_DIR } = require('./config');
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

// Inicia o watcher que recalcula derivados GUT (nunca commita).
startWatcher({ TASKS_DIR, gute, schema });

const PORT = process.env.PORT || 4317;
app.listen(PORT, () => {
  console.log(`orchestra-tasks server on :${PORT}`);
});

module.exports = app;
