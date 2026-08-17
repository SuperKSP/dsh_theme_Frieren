/**
 * check-transparent.cjs — decode the webp embedded in lib/client.js and verify
 * it carries a real alpha channel with transparent corners (a true cut-out).
 */
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const client = fs.readFileSync(path.join(__dirname, "..", "lib", "client.js"), "utf8");
const re = /FRIEREN_STAGE_URL = "data:(image\/webp);base64,([A-Za-z0-9+/=]+)"/;
const m = client.match(re);
if (!m) { console.error("FAIL: no embedded webp found"); process.exit(1); }
const buf = Buffer.from(m[2], "base64");

(async () => {
  const meta = await sharp(buf).metadata();
  console.log(`mime=${m[1]} ${meta.width}x${meta.height} hasAlpha=${meta.hasAlpha} format=${meta.format}`);
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
  const corners = { tl: px(2, 2), tr: px(W - 3, 2), bl: px(2, H - 3), br: px(W - 3, H - 3) };
  console.log("corners:", JSON.stringify(corners));
  // top edge and left edge should be background (hair may touch top/right/bottom)
  let edgeTransparent = 0, edgeTotal = 0;
  for (let x = 0; x < W; x += 2) { edgeTotal++; if (data[x * 4 + 3] < 16) edgeTransparent++; }
  for (let y = 0; y < H; y += 2) { edgeTotal++; if (data[(y * W) * 4 + 3] < 16) edgeTransparent++; }
  const edgeRatio = edgeTransparent / edgeTotal;
  // overall cut-out ratio on a 4px grid
  let transparent = 0, total = 0;
  for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) {
    total++;
    if (data[(y * W + x) * 4 + 3] < 16) transparent++;
  }
  const ratio = transparent / total;
  console.log(`transparent ratio=${(ratio * 100).toFixed(1)}%  top/left-edge transparent=${(edgeRatio * 100).toFixed(1)}%`);
  if (!meta.hasAlpha) { console.error("FAIL: no alpha channel"); process.exit(1); }
  if (ratio < 0.25) { console.error("FAIL: too little transparency — background not cut out"); process.exit(1); }
  if (edgeRatio < 0.4) { console.error("FAIL: background edges still opaque"); process.exit(1); }
  console.log("PASS: embedded stage art is a true transparent cut-out (webp + alpha, background removed)");
})().catch((e) => { console.error(e); process.exit(1); });
