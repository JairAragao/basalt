#!/usr/bin/env node
// publish-release.js — publica a release no GitHub de forma IDEMPOTENTE, sem o
// publisher do electron-builder (que corre concorrente e dá 422 "already_exists",
// deixando a release sem latest.yml e quebrando o auto-update).
//
// Fluxo: pega os artefatos já buildados em release/, GERA um latest.yml correto
// (sha512+size do exe), get-or-create da release vX.Y.Z e SUBSTITUI os 3 assets
// (exe, blockmap, latest.yml). Pode rodar quantas vezes quiser — sempre converge.
//
// Requer GH_TOKEN no ambiente (token com escopo de repo). Uso:
//   GH_TOKEN=... node scripts/publish-release.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OWNER = 'JairAragao';
const REPO = 'basalt';

function die(msg) { console.error('ERRO:', msg); process.exit(1); }

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) die('defina GH_TOKEN no ambiente (token com escopo de repo)');

const version = require(path.join(ROOT, 'package.json')).version;
const tag = `v${version}`;
const exeName = `Basalt-Setup-${version}.exe`; // nome de asset (sem espaço; casa com o url do latest.yml)
const exePath = path.join(ROOT, 'release', `Basalt Setup ${version}.exe`);
const blockmapPath = `${exePath}.blockmap`;
const latestPath = path.join(ROOT, 'release', 'latest.yml');

if (!fs.existsSync(exePath)) die(`instalador não encontrado: ${exePath} (rode "npm run electron:build" antes)`);
if (!fs.existsSync(blockmapPath)) die(`blockmap não encontrado: ${blockmapPath}`);

const api = 'https://api.github.com';
const uploads = 'https://uploads.github.com';
const H = { Authorization: `token ${token}`, 'User-Agent': 'basalt-release', Accept: 'application/vnd.github+json' };

async function main() {
  // 1) latest.yml consistente com o exe buildado
  const buf = fs.readFileSync(exePath);
  const sha512 = crypto.createHash('sha512').update(buf).digest('base64');
  const yml = [
    `version: ${version}`,
    'files:',
    `  - url: ${exeName}`,
    `    sha512: ${sha512}`,
    `    size: ${buf.length}`,
    `path: ${exeName}`,
    `sha512: ${sha512}`,
    `releaseDate: '${new Date().toISOString()}'`,
    '',
  ].join('\n');
  fs.writeFileSync(latestPath, yml);
  console.log(`latest.yml gerado (${tag}, size ${buf.length})`);

  // 2) get-or-create da release
  let rel = await (await fetch(`${api}/repos/${OWNER}/${REPO}/releases/tags/${tag}`, { headers: H })).json();
  if (!rel || !rel.id) {
    const r = await fetch(`${api}/repos/${OWNER}/${REPO}/releases`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ tag_name: tag, name: version, draft: false, prerelease: false }),
    });
    rel = await r.json();
    if (!rel.id) die(`falha ao criar release: ${rel.message || r.status}`);
    console.log('release criada:', tag);
  } else {
    console.log('release já existe:', tag, '(vai substituir os assets)');
  }

  // 3) substitui os assets (deleta os de mesmo nome + sobe os 3)
  const files = [
    [exePath, exeName, 'application/octet-stream'],
    [blockmapPath, `${exeName}.blockmap`, 'application/octet-stream'],
    [latestPath, 'latest.yml', 'text/yaml'],
  ];
  const names = new Set(files.map((f) => f[1]));
  const cur = await (await fetch(`${api}/repos/${OWNER}/${REPO}/releases/${rel.id}/assets?per_page=100`, { headers: H })).json();
  for (const a of Array.isArray(cur) ? cur : []) {
    if (!names.has(a.name)) continue;
    const d = await fetch(`${api}/repos/${OWNER}/${REPO}/releases/assets/${a.id}`, { method: 'DELETE', headers: H });
    console.log('del', a.name, '->', d.status);
  }
  for (const [file, name, ct] of files) {
    const body = fs.readFileSync(file);
    const r = await fetch(`${uploads}/repos/${OWNER}/${REPO}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`, {
      method: 'POST', headers: { ...H, 'Content-Type': ct, 'Content-Length': body.length }, body,
    });
    const j = await r.json();
    if (r.status !== 201) die(`falha ao subir ${name}: ${r.status} ${j.message || ''}`);
    console.log('up', name, '->', r.status);
  }

  // 4) verifica consistência do latest.yml servido
  const assets = await (await fetch(`${api}/repos/${OWNER}/${REPO}/releases/${rel.id}/assets`, { headers: H })).json();
  const ymlAsset = assets.find((a) => a.name === 'latest.yml');
  const served = await (await fetch(ymlAsset.browser_download_url, { headers: { 'User-Agent': 'basalt-release' } })).text();
  const servedSha = (served.match(/^sha512: (.+)$/m) || [])[1];
  console.log(`\nOK: release ${tag} publicada — latest.yml sha == exe sha: ${servedSha === sha512}`);
  console.log(rel.html_url || `https://github.com/${OWNER}/${REPO}/releases/tag/${tag}`);
}

main().catch((e) => die(e.message));
