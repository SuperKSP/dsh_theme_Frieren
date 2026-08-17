/**
 * upload-to-github.cjs — publish the plugin files to a GitHub repo via the
 * Contents API (works when git:// github.com is unreachable but api.github.com
 * is fine). One commit per file.
 *
 * Usage: GH_TOKEN=ghp_... node upload-to-github.cjs <repo-owner> <repo-name> <dir>
 */
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");

const token = process.env.GH_TOKEN;
if (!token) { console.error("GH_TOKEN env var required"); process.exit(1); }
const owner = process.argv[2];
const repo = process.argv[3];
const dir = process.argv[4];
if (!owner || !repo || !dir) { console.error("usage: GH_TOKEN=... node upload-to-github.cjs <owner> <repo> <dir>"); process.exit(1); }

const SKIP = new Set([".git", ".npm-cache", "node_modules"]);
const SKIP_EXT = [".tgz"];

function collectFiles(root) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (!SKIP_EXT.some((e) => entry.name.endsWith(e))) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

function apiRequest(method, apiPath, body, attempts) {
  return new Promise((resolve) => {
    const call = (n) => {
      const payload = body ? JSON.stringify(body) : null;
      const req = https.request({ hostname: "api.github.com", path: apiPath, method, headers: {
        "User-Agent": "dsh-theme-publisher",
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
      } }, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          if (res.statusCode === 503 && n < 8) {
            console.log("  retry", n, "after 503 on", method, apiPath);
            setTimeout(() => call(n + 1), 4000);
            return;
          }
          resolve({ status: res.statusCode, body: d });
        });
      });
      req.on("error", (e) => resolve({ status: 0, body: "ERR " + e.message }));
      req.setTimeout(30000, () => req.destroy(new Error("timeout")));
      if (payload) req.write(payload);
      req.end();
    };
    call(1);
  });
}

(async () => {
  const files = collectFiles(dir);
  console.log("files to upload:", files.length);
  let ok = 0, fail = 0;
  for (const file of files) {
    const rel = path.relative(dir, file).split(path.sep).join("/");
    const content = fs.readFileSync(file).toString("base64");
    const r = await apiRequest("PUT", `/repos/${owner}/${repo}/contents/${encodeURIComponent(rel)}`, {
      message: `add ${rel}`,
      content,
      branch: "main",
    });
    if (r.status === 201 || r.status === 200) { ok++; console.log("  OK ", rel); }
    else { fail++; console.log("  FAIL", rel, r.status, r.body.slice(0, 200)); }
    if (r.status === 409) { console.log("  -> conflict on", rel, "branch may not exist yet; body:", r.body.slice(0, 200)); break; }
  }
  console.log(`done: ${ok} ok, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
