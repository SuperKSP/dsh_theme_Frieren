/** get-rects.cjs — CDP: measure chat-flow and sidebar bounding rects. */
const http = require("node:http");

const port = Number(process.argv[2] || 9223);
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

(async () => {
  let target = null;
  for (let i = 0; i < 20 && !target; i++) {
    try { const l = await httpGetJson(`http://127.0.0.1:${port}/json/list`); target = l.find((t) => t.type === "page"); } catch (e) {}
    if (!target) await sleep(500);
  }
  if (!target) throw new Error("no target");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
  const r = await send("Runtime.evaluate", {
    expression: `(() => {
      const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      const out = { viewport: { w: innerWidth, h: innerHeight }, chat: null, sidebar: null, stage: null };
      const chat = document.querySelector("[data-phase='active'] [data-chat-flow]") || document.querySelector("[data-chat-flow]");
      if (chat) out.chat = rect(chat);
      const sb = document.querySelector("[data-pane='sidebar'], [class*='sidebarCol']");
      if (sb) out.sidebar = rect(sb);
      const st = document.querySelector('.fr-stage');
      if (st) out.stage = rect(st);
      return out;
    })()`,
    returnByValue: true,
  });
  console.log(JSON.stringify(r.result.result.value, null, 2));
  ws.close(); process.exit(0);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
