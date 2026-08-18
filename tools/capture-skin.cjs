/**
 * capture-skin.cjs — drive headless Chrome via CDP (DevTools Protocol) to
 * screenshot the DSH web GUI with the Frieren skin, light and dark.
 *
 * Prereq: Chrome launched with --remote-debugging-port=<port> (see README).
 * Usage: node capture-skin.cjs <debugPort> <guiUrl> <outDir>
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
      res.on("end", () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(new Error("bad json: " + d.slice(0, 200))); }
      });
    }).on("error", reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // find the page target
  let target = null;
  for (let i = 0; i < 20 && !target; i++) {
    try {
      const list = await httpGetJson(`http://127.0.0.1:${port}/json/list`);
      target = list.find((t) => t.type === "page");
    } catch (e) { /* retry */ }
    if (!target) await sleep(500);
  }
  if (!target) throw new Error("no page target on " + port);
  console.log("target:", target.url);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
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
      const v = await evalJs(expr);
      if (v) return v;
      await sleep(400);
    }
    throw new Error("timeout waiting for " + label);
  };

  async function capture(file) {
    const r = await send("Page.captureScreenshot", { format: "png" });
    const b64 = r.result && r.result.data;
    if (!b64) throw new Error("no screenshot data");
    fs.writeFileSync(file, Buffer.from(b64, "base64"));
    console.log("saved", file, fs.statSync(file).size, "bytes");
  }

  async function dismissOnboarding() {
    // best-effort: click any obvious skip/dismiss in onboarding overlays
    await evalJs(`(() => {
      const els = [...document.querySelectorAll('[role="dialog"], [class*="onboard"], [class*="Onboard"], [class*="welcome"], [class*="Welcome"], [class*="notice"]')];
      for (const el of els) {
        const btn = [...el.querySelectorAll('button')].find(b => /跳过|开始|进入|明白了|知道了|下一步|Skip|Start|Let's go|Done|OK/i.test(b.textContent || ''));
        if (btn) { btn.click(); return 'clicked: ' + btn.textContent; }
      }
      return 'none';
    })()`);
  }

  // --- light ---
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1680, height: 1050, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  await send("Page.navigate", { url: guiUrl });
  await waitFor(`document.body && document.body.hasAttribute('data-dsh-frieren')`, 60000, "skin apply (light)");
  await waitFor(`document.querySelector('[data-phase="active"], [data-chat-flow], [class*="sidebar"], [class*="composer"], main, [role="main"]') !== null`, 30000, "app render");
  await sleep(4000); // settle animations
  await dismissOnboarding();
  await sleep(800);
  await capture(path.join(outDir, "screenshot-light.png"));

  // --- dark ---
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await send("Page.reload", { ignoreCache: true });
  await waitFor(`document.body && document.body.hasAttribute('data-ds-dark-theme') && document.body.hasAttribute('data-dsh-frieren')`, 60000, "skin apply (dark)");
  await sleep(5000);
  await dismissOnboarding();
  await sleep(800);
  await capture(path.join(outDir, "screenshot-dark.png"));

  console.log("dark attr:", await evalJs(`document.body.getAttribute('data-ds-dark-theme')`));
  ws.close();
  process.exit(0);
}

main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
