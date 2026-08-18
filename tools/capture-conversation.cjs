/**
 * capture-conversation.cjs — CDP: open a real conversation in the DSH GUI and
 * screenshot the "chat active" state (Frieren shrinks to the safe corner).
 * Usage: node capture-conversation.cjs <debugPort> <guiUrl> <outFile>
 */
const http = require("node:http");
const fs = require("node:fs");

const port = Number(process.argv[2] || 9222);
const guiUrl = process.argv[3] || "http://127.0.0.1:3080";
const outFile = process.argv[4] || "conversation.png";

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
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await send("Page.navigate", { url: guiUrl + "?conv=" + Date.now() });
  await waitFor(`document.body && document.body.hasAttribute('data-dsh-frieren')`, 60000, "skin apply");
  await evalJs(`document.body.setAttribute('data-ds-dark-theme', '')`);

  // open a real conversation: click the first leaf session row in the sidebar
  const clickResult = await evalJs(`(() => {
    const rows = [...document.querySelectorAll("[role='treeitem']")];
    const leaf = rows.find(r => !r.hasAttribute('aria-expanded'));
    const target = leaf || rows[0];
    if (!target) return 'no-treeitem';
    target.click();
    return 'clicked ' + (target.getAttribute('aria-selected') ? 'selected' : 'row');
  })()`);
  console.log("click:", clickResult);

  // wait for the app to enter an active conversation
  await waitFor(`document.querySelector("[data-phase='active'] [data-chat-flow]") !== null`, 30000, "active chat");
  // wait for the skin projection + layout transition to settle
  await waitFor(`document.body.hasAttribute('data-fr-chat-active')`, 10000, "fr-chat-active");
  await sleep(4500);
  await capture(outFile);
  console.log("fr-chat-active:", await evalJs(`document.body.hasAttribute('data-fr-chat-active')`));
  console.log("stage width:", await evalJs(`(() => { const s = document.querySelector('.fr-stage'); if (!s) return 'no-stage'; return getComputedStyle(s).width; })()`));

  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
