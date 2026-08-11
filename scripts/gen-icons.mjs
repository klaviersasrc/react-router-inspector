// Generate the extension icon master (a teal rounded square with a white "RR"
// monogram, matching the panel brand). Writes icons/icon512.png; scripts/package
// downscales to 128/48/16 with sips. Pure Node (zlib) — no image deps.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const SIZE = 512;
const TEAL = [0x4e, 0xc9, 0xb0, 0xff];
const WHITE = [0xff, 0xff, 0xff, 0xff];

const px = new Uint8Array(SIZE * SIZE * 4);
function set(x, y, c) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3];
}

// Rounded-square background (transparent corners).
const R = 96;
const hi = SIZE - 1 - R;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let inside = true;
    if (x < R && y < R) inside = (R - x) ** 2 + (R - y) ** 2 <= R * R;
    else if (x > hi && y < R) inside = (x - hi) ** 2 + (R - y) ** 2 <= R * R;
    else if (x < R && y > hi) inside = (R - x) ** 2 + (y - hi) ** 2 <= R * R;
    else if (x > hi && y > hi) inside = (x - hi) ** 2 + (y - hi) ** 2 <= R * R;
    if (inside) set(x, y, TEAL);
  }
}

// "RR" as scaled 5x7 block letters.
const R_BMP = [
  [1, 1, 1, 1, 0],
  [1, 0, 0, 0, 1],
  [1, 0, 0, 0, 1],
  [1, 1, 1, 1, 0],
  [1, 0, 1, 0, 0],
  [1, 0, 0, 1, 0],
  [1, 0, 0, 0, 1],
];
const COLS = 5, ROWS = 7, GAP = 1, LETTERS = 2;
const totalCols = COLS * LETTERS + GAP * (LETTERS - 1);
const cell = Math.floor(Math.min(360 / totalCols, 300 / ROWS));
const wL = totalCols * cell, hL = ROWS * cell;
const x0 = Math.floor((SIZE - wL) / 2), y0 = Math.floor((SIZE - hL) / 2);
for (let L = 0; L < LETTERS; L++) {
  const lx = x0 + L * (COLS + GAP) * cell;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!R_BMP[r][c]) continue;
      for (let dy = 0; dy < cell; dy++) {
        for (let dx = 0; dx < cell; dx++) set(lx + c * cell + dx, y0 + r * cell + dy, WHITE);
      }
    }
  }
}

// ---- minimal PNG encoder --------------------------------------------------
const crcTable = (() => {
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
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
const stride = SIZE * 4;
const raw = Buffer.alloc(SIZE * (stride + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (stride + 1)] = 0; // filter: none
  Buffer.from(px.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
mkdirSync("icons", { recursive: true });
writeFileSync("icons/icon512.png", png);
console.log("wrote icons/icon512.png");
