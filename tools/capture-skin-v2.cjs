/**
 * capture-skin-v2.cjs — force light/dark via the app's own theme attribute.
 * After the skin applies, we toggle body[data-ds-dark-theme] explicitly so the
 * host preference (fixed dark) cannot keep both captures dark.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.argv[2] || 9222);
const guiUrl = process.argv[3] || "http://127.0.0.1:3080";
const outDir = process.argv[4] || process.cwd();

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let target = null;
  for (let i = 0; i < 20 && !target; i++) {
    try {
      const list = await httpGetJson(`http://127.0.0.1:${port}/json/list`);
      target = list.find((t) => t.type === "page");
    } catch (e) { /* retry */ }
    if (!target) await sleep(500);
  }
  if (!target) throw new Error("no page target");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const waitFor = async (expr, timeoutMs, label) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (await evalJs(expr)) return;
      await sleep(400);
    }
    throw new Error("timeout: " + label);
  };
  const capture = async (file) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    const b64 = r.result && r.result.data;
    if (!b64) throw new Error("no screenshot data");
    fs.writeFileSync(file, Buffer.from(b64, "base64"));
    console.log("saved", file, fs.statSync(file).size, "bytes");
  };

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1680, height: 1150, deviceScaleFactor: 1, mobile: false });

  const loadAndSnap = async (dark, file) => {
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }] });
    await send("Page.navigate", { url: guiUrl + "?shot=" + Date.now() });
    await waitFor(`document.body && document.body.hasAttribute('data-dsh-frieren')`, 60000, "skin apply");
    // force the theme attribute so host preference cannot override
    await evalJs(`document.body.setAttribute('data-ds-dark-theme', ${dark ? '""' : '""'}); ${dark ? "" : "document.body.removeAttribute('data-ds-dark-theme');"}`);
    if (!dark) await evalJs(`document.body.removeAttribute('data-ds-dark-theme')`);
    await waitFor(
      `document.body.hasAttribute('data-ds-dark-theme') === ${dark}`,
      10000,
      "theme attr " + (dark ? "dark" : "light")
    );
    await sleep(4500);
    await capture(file);
    console.log("captured:", file, "darkAttr =", await evalJs(`document.body.hasAttribute('data-ds-dark-theme')`));
  };

  await loadAndSnap(false, path.join(outDir, "screenshot-light.png"));
  await loadAndSnap(true, path.join(outDir, "screenshot-dark.png"));

  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
