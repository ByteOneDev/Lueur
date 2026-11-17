/* Lueur — stockage des images (IndexedDB : bien plus de place que le stockage local) */
const Images = (() => {
  'use strict';
  let dbp = null;
  const urls = new Map();

  function db() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open('lueur', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('images');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbp;
  }
  async function op(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction('images', mode);
      const req = fn(tx.objectStore('images'));
      tx.oncomplete = () => res(req ? req.result : undefined);
      tx.onerror = () => rej(tx.error);
    });
  }

  /** Réduit l’image (côté max) et l’enregistre en JPEG. Retourne { id, w, h }. */
  async function fromFile(file, max = 1600) {
    const bmp = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
    const k = Math.min(1, max / Math.max(bmp.naturalWidth, bmp.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.naturalWidth * k));
    c.height = Math.max(1, Math.round(bmp.naturalHeight * k));
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    URL.revokeObjectURL(bmp.src);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', .86));
    const id = 'img_' + Store.uid();
    await op('readwrite', s => s.put(blob, id));
    return { id, w: c.width, h: c.height };
  }
  const get = id => op('readonly', s => s.get(id));
  async function url(id) {
    if (!id) return '';
    if (urls.has(id)) return urls.get(id);
    const b = await get(id).catch(() => null);
    if (!b) return '';
    const u = URL.createObjectURL(b);
    urls.set(id, u);
    return u;
  }
  async function bytes(id) {
    const b = await get(id).catch(() => null);
    return b ? new Uint8Array(await b.arrayBuffer()) : null;
  }
  async function del(ids) {
    for (const id of [].concat(ids).filter(Boolean)) {
      if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
      await op('readwrite', s => s.delete(id)).catch(() => {});
    }
  }
  return { fromFile, url, bytes, del };
})();
