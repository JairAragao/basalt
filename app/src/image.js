// image.js — reduz/recomprime imagens ANTES do upload (via canvas). Um print de
// 3MB vira ~150KB: corta o crescimento do histórico git na fonte, transparente
// pro usuário. GIF (animado) passa direto — canvas achataria pra 1 frame.

const DEFAULTS = { maxDim: 1600, quality: 0.82 };

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('falha ao ler a imagem'));
    r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('imagem inválida'));
    img.src = src;
  });
}

// processImage(file, opts) → { data: dataURI, mime }. Nunca lança: em qualquer
// falha (formato exótico, canvas indisponível) devolve o original intacto.
export async function processImage(file, opts = {}) {
  const { maxDim, quality } = { ...DEFAULTS, ...opts };
  const type = (file && file.type) || '';
  const original = await readAsDataUrl(file);
  // GIF preserva animação; SVG não é raster (o server já bloqueia) → passa direto
  if (type === 'image/gif' || type === 'image/svg+xml') return { data: original, mime: type };

  try {
    const img = await loadImage(original);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return { data: original, mime: type };

    const scale = Math.min(1, maxDim / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { data: original, mime: type };
    ctx.drawImage(img, 0, 0, tw, th);

    // webp preserva transparência e comprime bem; se o navegador não suportar,
    // o toDataURL cai em png. PNG opaco vira webp; PNG com alpha continua alpha.
    let out = canvas.toDataURL('image/webp', quality);
    let outMime = 'image/webp';
    if (!out.startsWith('data:image/webp')) { out = canvas.toDataURL('image/png'); outMime = 'image/png'; }

    // se não reduziu (imagem já minúscula), fica com o menor dos dois
    if (out.length >= original.length && scale === 1) return { data: original, mime: type };
    return { data: out, mime: outMime };
  } catch {
    return { data: original, mime: type };
  }
}
