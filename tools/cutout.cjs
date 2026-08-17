/**
 * cutout.cjs — clean a cut-out character image for the Frieren skin:
 *   1. keep the largest opaque connected component (drops stray specks),
 *   2. matte-correct edge pixels against a white background (kills halos),
 *   3. crop to the remaining content + margin, resize to width 860,
 *   4. write assets/frieren-stage.webp (transparent WebP).
 *
 * Usage (from the plugin dir):
 *   node tools/cutout.cjs <input.png> [out.webp]
 * sharp must be resolvable via NODE_PATH or installed locally.
 */
const sharp = require("sharp");
const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const input = process.argv[2];
if (!input) { console.error("usage: node tools/cutout.cjs <input.png> [out.webp]"); process.exit(1); }
const out = process.argv[3] ?? path.join(root, "assets", "frieren-stage.webp");

const ALPHA_THRESHOLD = 32;
const MARGIN = 24;
const TARGET_WIDTH = 860;

(async () => {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;

  // ---- 1. connected components of the opaque mask -----------------------------
  const opaque = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) opaque[i] = data[i * 4 + 3] > ALPHA_THRESHOLD ? 1 : 0;

  const label = new Int32Array(W * H).fill(-1);
  const sizes = [];
  const stack = new Int32Array(W * H);
  let nextLabel = 0;
  for (let start = 0; start < W * H; start++) {
    if (opaque[start] !== 1 || label[start] !== -1) continue;
    let sp = 0, count = 0;
    stack[sp++] = start;
    label[start] = nextLabel;
    while (sp > 0) {
      const idx = stack[--sp];
      count++;
      const x = idx % W, y = (idx / W) | 0;
      const nb = [
        y > 0 ? idx - W : -1,
        y < H - 1 ? idx + W : -1,
        x > 0 ? idx - 1 : -1,
        x < W - 1 ? idx + 1 : -1,
      ];
      for (const n of nb) {
        if (n >= 0 && opaque[n] === 1 && label[n] === -1) { label[n] = nextLabel; stack[sp++] = n; }
      }
    }
    sizes.push(count);
    nextLabel++;
  }
  if (sizes.length === 0) { console.error("no opaque pixels found"); process.exit(1); }
  let keep = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[keep]) keep = i;
  console.log(`components: ${sizes.length} (keep #${keep} size=${sizes[keep]}, remove ${sizes.length - 1} strays)`);

  // ---- 2. zero out stray components + matte correction ------------------------
  const WHITE = 255;
  for (let i = 0; i < W * H; i++) {
    if (label[i] !== keep) { data[i * 4 + 3] = 0; continue; }
    const a = data[i * 4 + 3];
    if (a <= 0 || a >= 255) continue;
    const na = a / 255;
    for (let c = 0; c < 3; c++) {
      let v = (data[i * 4 + c] - WHITE * (1 - na)) / na;
      data[i * 4 + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }

  // ---- 3. crop to content + margin --------------------------------------------
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * 4 + 3] > ALPHA_THRESHOLD) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) { console.error("nothing opaque after cleanup"); process.exit(1); }
  const left = Math.max(0, minX - MARGIN);
  const top = Math.max(0, minY - MARGIN);
  const right = Math.min(W - 1, maxX + MARGIN);
  const bottom = Math.min(H - 1, maxY + MARGIN);
  const crop = { left, top, width: right - left + 1, height: bottom - top + 1 };
  console.log(`content box: (${minX},${minY})-(${maxX},${maxY})  crop:`, JSON.stringify(crop));

  // ---- 4. output transparent WebP ----------------------------------------------
  await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .extract(crop)
    .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    .webp({ quality: 85, alphaQuality: 95, effort: 4 })
    .toFile(out);
  const meta = await sharp(out).metadata();
  console.log(`OK: ${out} (${meta.width}x${meta.height}, hasAlpha=${meta.hasAlpha}, size=${require("node:fs").statSync(out).size} bytes)`);
})().catch((e) => { console.error(e); process.exit(1); });
