// Node shims for three's GLTFExporter image pipeline (canvas.toBlob -> PNG via node:zlib).
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
export function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy
      ? Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
      : Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function parseCssColor(s) {
  if (typeof s !== 'string') return { r: 255, g: 255, b: 255, a: 1 };
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return { r: 255, g: 255, b: 255, a: 1 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const m = s.match(/rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,\s/]\s*([\d.]+%?))?\s*\)/);
  if (m) {
    let a = m[4] === undefined ? 1 : +m[4];
    if (m[4] && m[4].endsWith('%')) a /= 100;
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  return { r: 255, g: 255, b: 255, a: 1 };
}

function makeCtx(st) {
  const stack = [];
  const px = (x, y) => {
    if (x < 0 || y < 0 || x >= st.w || y >= st.h) return;
    const i = (y * st.w + x) * 4;
    return [i, i + 1, i + 2, i + 3];
  };
  const fillRect = (x, y, rw, rh) => {
    const c = parseCssColor(st.fillStyle);
    const a = c.a * st.globalAlpha;
    const x0 = Math.max(0, Math.floor(x)), x1 = Math.min(st.w, Math.ceil(x + rw));
    const y0 = Math.max(0, Math.floor(y)), y1 = Math.min(st.h, Math.ceil(y + rh));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const [r, g, b, al] = px(xx, yy);
        st.buf[r] = st.buf[r] * (1 - a) + c.r * a;
        st.buf[g] = st.buf[g] * (1 - a) + c.g * a;
        st.buf[b] = st.buf[b] * (1 - a) + c.b * a;
        st.buf[al] = Math.max(st.buf[al], Math.round(a * 255));
      }
    }
  };
  const line = (x0, y0, x1, y1, lw) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      const r = Math.max(1, Math.round(lw / 2));
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) fillRect(x + dx, y + dy, 1, 1);
      }
    }
  };
  const saveState = () => ({ fillStyle: st.fillStyle, strokeStyle: st.strokeStyle, lineWidth: st.lineWidth, globalAlpha: st.globalAlpha, path: st.path });
  const ctx = {
    get fillStyle() { return st.fillStyle; },
    set fillStyle(v) { st.fillStyle = v; },
    get strokeStyle() { return st.strokeStyle; },
    set strokeStyle(v) { st.strokeStyle = v; },
    get lineWidth() { return st.lineWidth; },
    set lineWidth(v) { st.lineWidth = v; },
    get globalAlpha() { return st.globalAlpha; },
    set globalAlpha(v) { st.globalAlpha = v; },
    fillRect,
    clearRect(x, y, rw, rh) {
      const x0 = Math.max(0, Math.floor(x)), x1 = Math.min(st.w, Math.ceil(x + rw));
      const y0 = Math.max(0, Math.floor(y)), y1 = Math.min(st.h, Math.ceil(y + rh));
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const [r, g, b, al] = px(xx, yy); st.buf[r] = st.buf[g] = st.buf[b] = st.buf[al] = 0; }
    },
    strokeRect(x, y, rw, rh) {
      const lw = Math.max(1, st.lineWidth | 0);
      this.beginPath();
      this.moveTo(x, y); this.lineTo(x + rw, y); this.lineTo(x + rw, y + rh); this.lineTo(x, y + rh); this.closePath();
      st._lastRect = [x, y, rw, rh, lw];
      const r = st._lastRect;
      line(r[0], r[1], r[0] + r[2], r[1], r[4]);
      line(r[0], r[1] + r[3], r[0] + r[2], r[1] + r[3], r[4]);
      line(r[0], r[1], r[0], r[1] + r[3], r[4]);
      line(r[0] + r[2], r[1], r[0] + r[2], r[1] + r[3], r[4]);
    },
    beginPath() { st.path = []; },
    moveTo(x, y) { st.path = [[x, y]]; },
    lineTo(x, y) { (st.path = st.path || []).push([x, y]); },
    closePath() {},
    stroke() {
      const p = st.path || [];
      const c = parseCssColor(st.strokeStyle);
      const a = c.a * st.globalAlpha;
      st.strokeStyle = c; // normalize so inner fillRect uses exact color
      const saved = st.strokeStyle;
      st.strokeStyle = { __c: c, __a: a };
      for (let i = 1; i < p.length; i++) {
        const [x0, y0] = p[i - 1], [x1, y1] = p[i];
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t);
          const r = Math.max(0, (st.lineWidth - 1) / 2);
          for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            const i2 = (y + dy) * st.w * 4 + (x + dx) * 4;
            if (x + dx < 0 || y + dy < 0 || x + dx >= st.w || y + dy >= st.h) continue;
            st.buf[i2] = st.buf[i2] * (1 - a) + c.r * a;
            st.buf[i2 + 1] = st.buf[i2 + 1] * (1 - a) + c.g * a;
            st.buf[i2 + 2] = st.buf[i2 + 2] * (1 - a) + c.b * a;
            st.buf[i2 + 3] = Math.max(st.buf[i2 + 3], Math.round(a * 255));
          }
        }
      }
      st.strokeStyle = saved;
      st.path = [];
    },
    arc(cx, cy, r, a0, a1) {
      const p = (st.path = st.path || []);
      const steps = Math.max(8, Math.ceil(2 * Math.PI * r * 0.5));
      const start = p.length ? p[p.length - 1] : [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r];
      p.push(start);
      for (let i = 1; i <= steps; i++) {
        const t = a0 + (a1 - a0) * (i / steps);
        p.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
      }
    },
    fill() {
      // approximate closed path fill: rasterize with even-odd scanline
      const p = st.path || [];
      st.path = [];
      if (p.length < 3) return;
      const c = parseCssColor(st.fillStyle);
      const a = c.a * st.globalAlpha;
      const ys = p.map(q => q[1]);
      const minY = Math.max(0, Math.floor(Math.min(...ys))), maxY = Math.min(st.h, Math.ceil(Math.max(...ys)));
      for (let y = minY; y <= maxY; y++) {
        const xints = [];
        for (let i = 0; i < p.length; i++) {
          const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length];
          if ((y0 <= y + 0.5 && y1 > y + 0.5) || (y1 <= y + 0.5 && y0 > y + 0.5)) {
            const t = (y + 0.5 - y0) / (y1 - y0);
            xints.push(x0 + (x1 - x0) * t);
          }
        }
        xints.sort((u, v) => u - v);
        for (let i = 0; i + 1 < xints.length; i += 2) {
          const x0 = Math.max(0, Math.ceil(xints[i])), x1 = Math.min(st.w, Math.floor(xints[i + 1]));
          for (let x = x0; x < x1; x++) {
            const i2 = y * st.w * 4 + x * 4;
            st.buf[i2] = st.buf[i2] * (1 - a) + c.r * a;
            st.buf[i2 + 1] = st.buf[i2 + 1] * (1 - a) + c.g * a;
            st.buf[i2 + 2] = st.buf[i2 + 2] * (1 - a) + c.b * a;
            st.buf[i2 + 3] = Math.max(st.buf[i2 + 3], Math.round(a * 255));
          }
        }
      }
    },
    putImageData(imageData, dx, dy) {
      const data = imageData.data, iw = imageData.width, ih = imageData.height;
      for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
        const tpx = x + dx, tpy = y + dy;
        if (tpx < 0 || tpy < 0 || tpx >= st.w || tpy >= st.h) continue;
        const si = (y * iw + x) * 4, ti = (tpy * st.w + tpx) * 4;
        st.buf[ti] = data[si]; st.buf[ti + 1] = data[si + 1]; st.buf[ti + 2] = data[si + 2]; st.buf[ti + 3] = data[si + 3];
      }
    },
    drawImage() {},
    save() { stack.push(saveState()); },
    restore() { const s = stack.pop(); if (s) Object.assign(st, s); },
  };
  st.fillStyle = '#ffffff';
  st.strokeStyle = '#000000';
  st.lineWidth = 1;
  st.globalAlpha = 1;
  st.path = [];
  return ctx;
}

function makeCanvas() {
  const st = { w: 0, h: 0, buf: new Uint8ClampedArray(0) };
  const ctx = null; // lazy
  let ctxRef = null;
  const canvas = {
    _st: st,
    getContext(kind) {
      if (kind !== '2d') return null;
      if (!ctxRef) ctxRef = makeCtx(st);
      return ctxRef;
    },
    toBlob(cb, mime) {
      const png = encodePNG(st.w, st.h, st.buf);
      Promise.resolve().then(() => cb(new Blob([png], { type: mime || 'image/png' })));
    },
    toDataURL(mime) {
      const png = encodePNG(st.w, st.h, st.buf);
      return 'data:' + (mime || 'image/png') + ';base64,' + Buffer.from(png).toString('base64');
    },
  };
  Object.defineProperty(canvas, 'width', {
    get() { return st.w; },
    set(v) { st.w = v | 0; st.buf = new Uint8ClampedArray(st.w * st.h * 4); },
  });
  Object.defineProperty(canvas, 'height', {
    get() { return st.h; },
    set(v) { st.h = v | 0; st.buf = new Uint8ClampedArray(st.w * st.h * 4); },
  });
  return canvas;
}

export function installDocumentShim() {
  if (typeof document !== 'undefined') return;
  globalThis.document = { createElement(tag) { if (tag !== 'canvas') throw new Error('shim: unsupported element ' + tag); return makeCanvas(); } };
  if (typeof FileReader === 'undefined') {
    globalThis.FileReader = class FileReader {
      readAsArrayBuffer(blob) {
        Promise.resolve(blob.arrayBuffer()).then((ab) => {
          this.result = ab;
          if (this.onloadend) this.onloadend();
          if (this.onload) this.onload();
        });
      }
      readAsDataURL(blob) {
        Promise.resolve(blob.arrayBuffer()).then((ab) => {
          this.result = 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + Buffer.from(ab).toString('base64');
          if (this.onloadend) this.onloadend();
          if (this.onload) this.onload();
        });
      }
    };
  }
  if (typeof ImageData === 'undefined') {
    globalThis.ImageData = class ImageData {
      constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); }
    };
  }
}