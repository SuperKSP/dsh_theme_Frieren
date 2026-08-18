/**
 * sync-github.cjs — push local changes to the GitHub repo via Contents API:
 * PUT (create or update with sha) / DELETE per file. Mirrors the local git
 * commit 461943f.
 */
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");

const token = process.env.GH_TOKEN;
if (!token) { console.error("GH_TOKEN required"); process.exit(1); }
const OWNER = "SuperKSP", REPO = "dsh_theme_Frieren", BRANCH = "main";
const ROOT = "D:/harness/_plugins_src/dsh-client-ui-skin-frieren";

function api(method, apiPath, body, attempts) {
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
          if (res.statusCode === 503 && n < 8) { setTimeout(() => call(n + 1), 4000); return; }
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

const getSha = async (rel) => {
  const r = await api("GET", `/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(rel)}`);
  if (r.status !== 200) return null;
  return JSON.parse(r.body).sha;
};

(async () => {
  // files to PUT (create/update), in order
  const puts = [
    "docs/screenshot-light.png",
    "docs/screenshot-dark.png",
    "README.md",
    "skin.json",
    "package.json",
    "tools/capture-skin.cjs",
    "tools/capture-skin-v2.cjs",
    "tools/upload-to-github.cjs",
  ];
  for (const rel of puts) {
    const file = path.join(ROOT, rel.split("/").join(path.sep));
    const content = fs.readFileSync(file).toString("base64");
    const sha = await getSha(rel);
    const r = await api("PUT", `/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(rel)}`, {
      message: (sha ? "update " : "add ") + rel,
      content,
      sha: sha || undefined,
      branch: BRANCH,
    });
    console.log((sha ? "UPD " : "ADD "), rel, "->", r.status);
  }
  // files to DELETE (old stylized previews)
  for (const rel of ["preview/light.svg", "preview/dark.svg"]) {
    const sha = await getSha(rel);
    if (!sha) { console.log("SKIP (absent)", rel); continue; }
    const r = await api("DELETE", `/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(rel)}`, {
      message: "remove " + rel, sha, branch: BRANCH,
    });
    console.log("DEL ", rel, "->", r.status);
  }
  console.log("done");
})();
