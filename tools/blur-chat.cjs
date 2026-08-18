/**
 * blur-chat.cjs — blur the chat-message column + sidebar text in a screenshot,
 * keeping the character, titlebar, composer and decorations crisp.
 * Usage: node blur-chat.cjs <in.png> <out.png> [chatRect "x,y,w,h"] [sidebarRect "x,y,w,h"] [keepBottomPx]
 */
const sharp = require("sharp");

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) { console.error("usage: node blur-chat.cjs <in> <out>"); process.exit(1); }
const chatRect = (process.argv[4] || "601,0,748,1008").split(",").map(Number);
const sidebarRect = (process.argv[5] || "0,0,280,1150").split(",").map(Number);

(async () => {
  const meta = await sharp(input).metadata();
  const W = meta.width, H = meta.height;
  console.log("image:", W, "x", H);

  // scale rects if the capture size differs from the measured viewport
  const vw = 1680, vh = 1150;
  const sx = W / vw, sy = H / vh;
  const rects = [chatRect, sidebarRect].map(([x, y, w, h]) => ({
    x: Math.round(x * sx), y: Math.round(y * sy),
    w: Math.round(w * sx), h: Math.round(h * sy),
  }));
  console.log("blur rects:", JSON.stringify(rects));

  // mask: alpha 255 keep-sharp, 0 blur region
  const mask = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) mask[i * 4 + 3] = 255;
  for (const r of rects) {
    const x1 = Math.min(W, r.x + r.w), y1 = Math.min(H, r.y + r.h);
    for (let y = Math.max(0, r.y); y < y1; y++) {
      for (let x = Math.max(0, r.x); x < x1; x++) {
        mask[(y * W + x) * 4 + 3] = 0;
      }
    }
  }
  const maskImg = await sharp(mask, { raw: { width: W, height: H, channels: 4 } })
    .blur(12) // feather the boundary
    .png().toBuffer();

  const original = sharp(input);
  const maskedSharp = await original
    .composite([{ input: maskImg, blend: "dest-in" }])
    .png().toBuffer();

  const blurred = await sharp(input).blur(28).png().toBuffer();
  const out = await sharp(blurred)
    .composite([{ input: maskedSharp, blend: "over" }])
    .png().toFile(output);
  console.log("saved", output, (await sharp(output).metadata()).width, "x", (await sharp(output).metadata()).height);
})();
