/**
 * Smoke test for dsh-client-ui-skin-frieren/lib/client.js — runs apply() against
 * a minimal DOM stub (no jsdom needed) and asserts the skin mounts and cleans up.
 *
 * Run: node tests/smoke.test.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const CLIENT = fs.readFileSync(
  path.join(__dirname, "..", "lib", "client.js"),
  "utf8"
);

// ---- minimal DOM stub -----------------------------------------------------
function makeNode(tagName) {
  const node = {
    tagName: String(tagName).toUpperCase(),
    dataset: {},
    attributes: {},
    children: [],
    parentNode: null,
    className: "",
    id: "",
    textContent: "",
    innerHTML: "",
    style: (() => {
      const props = {};
      const style = {
        setProperty(name, value) { props[name] = value; },
        getPropertyValue(name) { return props[name] || ""; },
        removeProperty(name) { delete props[name]; },
        cssText: "",
      };
      return style;
    })(),
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    prepend(child) {
      child.parentNode = this;
      this.children.unshift(child);
    },
    remove() {
      if (this.parentNode) {
        const i = this.parentNode.children.indexOf(this);
        if (i >= 0) this.parentNode.children.splice(i, 1);
        this.parentNode = null;
      }
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); },
    removeAttribute(name) { delete this.attributes[name]; },
    toggleAttribute(name, force) {
      const has = this.hasAttribute(name);
      const want = force === undefined ? !has : !!force;
      if (want) this.setAttribute(name, "");
      else if (has) this.removeAttribute(name);
    },
    querySelector(selector) {
      return querySelectorOn(this, selector);
    },
    querySelectorAll(selector) {
      const out = [];
      collectBySelector(this, selector, out);
      return out;
    },
  };
  return node;
}

function attrValueOf(node, name) {
  if (name === "class") return String(node.className);
  return node.hasAttribute(name) ? String(node.getAttribute(name)) : null;
}

function matches(node, selector) {
  // comma-separated selector list
  if (selector.includes(",")) {
    return selector.split(",").some((part) => matches(node, part.trim()));
  }
  // attribute selector [name='value'] (and bare [name])
  const attrRe = /^\[([a-z-]+)(?:='([^']*)')?\]$/i;
  const m = attrRe.exec(selector);
  if (m) {
    const value = attrValueOf(node, m[1]);
    if (value === null) return false;
    if (m[2] !== undefined) return value === m[2];
    return true;
  }
  // class*='substr' attribute-contains
  const containsRe = /^\[([a-z-]+)\*='([^']*)'\]$/i;
  const c = containsRe.exec(selector);
  if (c) {
    const value = attrValueOf(node, c[1]);
    return value !== null && value.includes(c[2]);
  }
  // id selector
  if (selector.startsWith("#")) return node.id === selector.slice(1);
  // class selector
  if (selector.startsWith(".")) {
    return String(node.className).split(/\s+/).includes(selector.slice(1));
  }
  // tag[attr] / tag[attr='value'] / tag[attr*='value'] forms
  const tagAttrRe = /^([a-z][a-z0-9-]*)\[([a-z-]+)(\*?)=?'([^']*)'?\]$/i;
  const ta = tagAttrRe.exec(selector);
  if (ta) {
    if (node.tagName !== ta[1].toUpperCase()) return false;
    const value = attrValueOf(node, ta[2]);
    if (value === null) return false;
    if (ta[3] === "*") return value.includes(ta[4]);
    return value === ta[4];
  }
  // tag selector
  if (/^[a-z][a-z0-9-]*$/i.test(selector)) return node.tagName === selector.toUpperCase();
  return false;
}

function querySelectorOn(root, selector) {
  // comma-separated list: try each part
  if (selector.includes(",")) {
    for (const part of selector.split(",")) {
      const hit = querySelectorOn(root, part.trim());
      if (hit) return hit;
    }
    return null;
  }
  const parts = selector.trim().split(/\s+/);
  if (parts.length > 1) {
    // minimal descendant-combinator support: "A B" → B inside an A
    const last = parts[parts.length - 1];
    const rest = parts.slice(0, -1);
    const queue = [...root.children];
    while (queue.length) {
      const node = queue.shift();
      if (matches(node, last)) {
        let a = node.parentNode;
        while (a) {
          if (matches(a, rest.join(" "))) return node;
          a = a.parentNode;
        }
      }
      queue.push(...node.children);
    }
    return null;
  }
  if (matches(root, selector)) return root;
  for (const child of root.children) {
    const hit = querySelectorOn(child, selector);
    if (hit) return hit;
  }
  return null;
}

function collectBySelector(root, selector, out) {
  if (matches(root, selector)) out.push(root);
  for (const child of root.children) collectBySelector(child, selector, out);
}

// pre-seeded DOM: head with theme-color meta + favicon link, body with titlebar
const documentStub = {
  title: "DeepSeek Harness",
  head: makeNode("head"),
  body: makeNode("body"),
  getElementById(id) {
    for (const root of [this.head, this.body]) {
      const hit = querySelectorOn(root, "#" + id);
      if (hit) return hit;
    }
    return null;
  },
  createElement(tag) { return makeNode(tag); },
  querySelector(sel) {
    for (const root of [this.head, this.body]) {
      const hit = querySelectorOn(root, sel);
      if (hit) return hit;
    }
    return null;
  },
  querySelectorAll(sel) {
    const out = [];
    for (const root of [this.head, this.body]) collectBySelector(root, sel, out);
    return out;
  },
};
documentStub.head.appendChild(
  (() => { const m = makeNode("meta"); m.setAttribute("name", "theme-color"); m.setAttribute("content", "#ffffff"); return m; })()
);
documentStub.head.appendChild(
  (() => { const l = makeNode("link"); l.setAttribute("rel", "icon"); l.setAttribute("href", "/favicon.ico"); return l; })()
);
const titlebar = makeNode("div");
titlebar.className = "app-titlebar";
documentStub.body.appendChild(titlebar);

// ---- run the bundle in a sandbox ------------------------------------------
let registered = null;
const windowStub = {
  __ModuleLoader__: {
    load(handoff) { registered = handoff; },
  },
};
const sandbox = {
  window: windowStub,
  document: documentStub,
  console,
  MutationObserver: class {
    static instances = [];
    constructor(cb) { this.cb = cb; this.constructor.instances.push(this); }
    observe() {} disconnect() {}
  },
  setTimeout,
  clearTimeout,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(CLIENT, sandbox, { filename: "client.js" });

if (!registered) throw new Error("FAIL: __ModuleLoader__.load was never called");
if (registered.id !== "dsh-client-ui-skin-frieren") throw new Error("FAIL: unexpected module id " + registered.id);

// ---- materialize the factory and call apply -------------------------------
const exports_ = registered.factory(() => { throw new Error("unexpected require"); });
if (typeof exports_.apply !== "function") throw new Error("FAIL: apply is not exported");

const disposers = [];
const ctx = {
  effect(fn) { const dispose = fn(); disposers.push(dispose); },
};
exports_.apply(ctx);

// ---- assertions: mounted ---------------------------------------------------
const assert = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); };

assert(documentStub.body.getAttribute("data-dsh-frieren") === "", "body gate data-dsh-frieren not set");
const styleTag = documentStub.getElementById("dsh-skin-frieren-style");
assert(!!styleTag, "skin style tag missing");
assert(styleTag.textContent.includes("--dsw-alias-brand-primary: #b5853a"), "light tokens missing in CSS");
assert(styleTag.textContent.includes("body[data-dsh-frieren][data-ds-dark-theme]"), "dark token block missing in CSS");

const watermark = documentStub.body.querySelector("[class='fr-magic-watermark']") || documentStub.body.querySelector(".fr-magic-watermark");
assert(!!watermark, "magic watermark missing");
assert(watermark.innerHTML.includes("<svg"), "watermark has no svg");

const stage = documentStub.body.children.find((c) => c.className === "fr-stage");
assert(!!stage, "character stage missing");
assert(stage.children.length === 1 && stage.children[0].tagName === "IMG", "stage image missing");
assert(stage.children[0].src.startsWith("data:image/webp;base64,"), "stage image not embedded as webp data URI");
assert(stage.children[0].src.length > 1000, "stage image data URI too short (not embedded?)");

const cornerLayer = documentStub.body.children.find((c) => c.className === "fr-corners");
assert(!!cornerLayer && cornerLayer.children.length === 4, "4 corner ornaments missing");

const petalLayer = documentStub.body.children.find((c) => c.className === "fr-petals");
assert(!!petalLayer && petalLayer.children.length === 16, "16 petals missing");

const sparkleLayer = documentStub.body.children.find((c) => c.className === "fr-sparkles");
assert(!!sparkleLayer && sparkleLayer.children.length === 8, "8 sparkles missing");
assert(sparkleLayer.children[0].innerHTML.includes("<svg"), "sparkle has no svg");

const runeLayer = documentStub.body.children.find((c) => c.className === "fr-runes");
assert(!!runeLayer && runeLayer.children.length === 8, "8 magic runes missing");
assert(runeLayer.children[0].innerHTML.includes("<svg"), "rune has no svg");

const shootingLayer = documentStub.body.children.find((c) => c.className === "fr-shooting-layer");
assert(!!shootingLayer && shootingLayer.children.length === 3, "3 shooting stars missing");

const glow = documentStub.body.children.find((c) => c.className === "fr-glow");
assert(!!glow, "magic glow missing");

const circle2 = documentStub.body.children.find((c) => c.className === "fr-magic-circle-2");
assert(!!circle2 && circle2.innerHTML.includes("<svg"), "second magic circle missing");

const favicon = documentStub.head.querySelector("link[rel='icon']");
assert(favicon && favicon.getAttribute("href").startsWith("data:image/svg+xml"), "favicon not swapped");

const themeMeta = documentStub.head.querySelector("meta[name='theme-color']");
assert(themeMeta && themeMeta.getAttribute("content") === "#f4efe0", "theme-color not synced to light");

const brand = titlebar.children.find((c) => c.dataset.skinChrome === "frieren-titlebar-brand");
assert(!!brand, "titlebar brand missing");
assert(brand.textContent.includes("葬送的芙莉莲") || brand.innerHTML.includes("葬送的芙莉莲"), "titlebar brand text missing");

// body inline backdrop mirrored
assert(documentStub.body.style.getPropertyValue("background-attachment") === "fixed", "body backdrop not mirrored");

// ---- layout linkage: hero (no chat) → active chat ---------------------------
assert(documentStub.body.getAttribute("data-fr-chat-active") === null, "hero state should not mark chat-active");
const chatFlow = (() => {
  const phase = makeNode("div"); phase.setAttribute("data-phase", "active");
  const flow = makeNode("div"); flow.setAttribute("data-chat-flow", "");
  phase.appendChild(flow);
  return phase;
})();
documentStub.body.appendChild(chatFlow);
for (const obs of sandbox.MutationObserver.instances) obs.cb([]);
assert(documentStub.body.getAttribute("data-fr-chat-active") === "", "chat-active attribute not projected");
chatFlow.remove();
for (const obs of sandbox.MutationObserver.instances) obs.cb([]);
assert(documentStub.body.getAttribute("data-fr-chat-active") === null, "chat-active not cleared when chat leaves");

// ---- assertions: cleaned up ------------------------------------------------
for (const dispose of disposers) dispose();
assert(documentStub.body.getAttribute("data-dsh-frieren") === null, "body gate not removed on dispose");
assert(documentStub.getElementById("dsh-skin-frieren-style") === null, "style tag not removed on dispose");
assert(!documentStub.body.children.some((c) => c.className && c.className.indexOf("fr-") === 0), "chrome layers not removed on dispose");
assert(favicon.getAttribute("href") === "/favicon.ico", "favicon not restored on dispose");
assert(themeMeta.getAttribute("content") === "#ffffff", "theme-color not restored on dispose");
assert(titlebar.children.length === 0, "titlebar brand not removed on dispose");
assert(documentStub.body.style.getPropertyValue("background-attachment") === "", "body backdrop not restored on dispose");

console.log("PASS: skin mounts (tokens/css/chrome/stage/favicon/meta/brand) and fully cleans up");

// ---- SVG art well-formedness (balanced tags) --------------------------------
function checkWellFormed(xml, label) {
  const VOID = new Set(["circle", "path", "stop", "use", "img", "br", "input", "meta", "link"]);
  const stack = [];
  const re = /<\/?([a-z][a-z0-9-]*)((?:"[^"]*"|'[^']*'|[^"'>])*?)(\/?)>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const tag = m[1].toLowerCase();
    const selfClosing = m[3] === "/" || VOID.has(tag);
    if (m[0][1] === "/") {
      const top = stack.pop();
      if (top !== tag) throw new Error(`FAIL: ${label} mismatched closing </${tag}> (expected </${top}>)`);
    } else if (!selfClosing) {
      stack.push(tag);
    }
  }
  if (stack.length > 0) throw new Error(`FAIL: ${label} unclosed tags: ${stack.join(", ")}`);
  assert(xml.trim().startsWith("<svg") && xml.trim().endsWith("</svg>"), `${label} not an svg`);
}
checkWellFormed(watermark.innerHTML, "magic circle");
checkWellFormed(cornerLayer.children[0].innerHTML, "corner ornament");
checkWellFormed(petalLayer.children[0].innerHTML, "petal");
checkWellFormed(runeLayer.children[0].innerHTML, "rune");
checkWellFormed(circle2.innerHTML, "second magic circle");

console.log("PASS: SVG art is well-formed (magic circle, corners, petals)");
// ---- second scenario: boot directly into dark mode -------------------------
const disposers2 = [];
const ctx2 = { effect(fn) { const dispose = fn(); disposers2.push(dispose); } };
documentStub.body.setAttribute("data-ds-dark-theme", "");
documentStub.head.querySelector("meta[name='theme-color']").setAttribute("content", "#ffffff");
documentStub.head.querySelector("link[rel='icon']").setAttribute("href", "/favicon.ico");
exports_.apply(ctx2);

assert(documentStub.body.getAttribute("data-dsh-frieren") === "", "dark: body gate missing");
assert(
  documentStub.body.style.getPropertyValue("background-image").includes("#151b10"),
  "dark: backdrop not switched to forest gradient"
);
const petalLayer2 = documentStub.body.children.find((c) => c.className === "fr-petals");
const firstPetal = petalLayer2 && petalLayer2.children[0];
assert(firstPetal && firstPetal.style.getPropertyValue("--fr-petal-color") === "#d6af62", "dark: petal palette not dark");
const themeMeta2 = documentStub.head.querySelector("meta[name='theme-color']");
assert(themeMeta2.getAttribute("content") === "#141a10", "dark: theme-color not synced");
for (const dispose of disposers2) dispose();
assert(documentStub.body.getAttribute("data-dsh-frieren") === null, "dark: body gate not removed on dispose");

console.log("PASS: dark-mode boot (backdrop, petal palette, theme-color) and cleanup");
