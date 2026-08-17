/**
 * embed-art.mjs — embed `assets/frieren-stage.webp` into lib/client.js as an
 * inline data URI (replaces the FRIEREN_STAGE_URL placeholder block).
 *
 * Swap the character: put your image at assets/frieren-stage.webp (WebP
 * recommended; ~50-120KB is ideal for 860px wide, quality 80-85) and run:
 *
 *   node tools/embed-art.mjs
 *
 * Then restart `dsh web` and hard-refresh the browser.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artPath = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : join(root, "assets", "frieren-stage.webp");
const clientPath = join(root, "lib", "client.js");

const bytes = readFileSync(artPath);
const base64 = bytes.toString("base64");
const mime = artPath.toLowerCase().endsWith(".png") ? "image/png" : "image/webp";

let client = readFileSync(clientPath, "utf8");
const start = "/* __FRIEREN_STAGE_START__ */";
const end = "/* __FRIEREN_STAGE_END__ */";
const i0 = client.indexOf(start);
const i1 = client.indexOf(end);
if (i0 < 0 || i1 < 0) throw new Error("client.js placeholder block not found");
const block = `${start}\n\t\tvar FRIEREN_STAGE_URL = "data:${mime};base64,${base64}";\n\t\t${end}`;
client = client.slice(0, i0) + block + client.slice(i1 + end.length);

writeFileSync(clientPath, client);
console.log(`OK: embedded ${artPath} (${bytes.length} bytes -> ${base64.length} chars base64) into ${clientPath}`);
