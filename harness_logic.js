// ============================================================
// TEMPORARY VALIDATION HARNESS - popup.js logic (DOM stubbed)
// Part 1: stubs + load. Tests are in harness_logic_tests.js.
// Run: node harness_logic.js
// ============================================================

const fs = require("fs");
const path = require("path");

// ---------- Minimal DOM / chrome stubs ----------

function makeElement() {
  const el = {
    style: {},
    classList: { add: function () {}, remove: function () {}, toggle: function () {} },
    children: [],
    dataset: {},
    value: "",
    textContent: "",
    innerHTML: "",
    className: "",
    appendChild: function (c) { el.children.push(c); return c; },
    removeChild: function () {},
    addEventListener: function () {},
    removeEventListener: function () {},
    setAttribute: function () {},
    getAttribute: function () { return null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    closest: function () { return null; },
    focus: function () {},
    click: function () {},
    files: []
  };
  return el;
}

const elements = {};

global.document = {
  getElementById: function (id) {
    if (!elements[id]) elements[id] = makeElement();
    return elements[id];
  },
  createElement: function () { return makeElement(); },
  createTextNode: function (t) { return { textContent: t }; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  addEventListener: function () {},
  body: makeElement()
};

global.window = {
  confirm: function () { return true; },
  open: function () {},
  location: { href: "https://example.com/" }
};

global.chrome = {
  storage: {
    local: {
      get: function (keys, cb) { if (cb) cb({}); },
      set: function () {},
      remove: function () {}
    }
  },
  tabs: {
    query: function (q, cb) { cb([{ id: 1, url: "https://example.com/" }]); },
    sendMessage: function () {},
    create: function () {}
  },
  runtime: {
    lastError: null,
    onMessage: { addListener: function () {} }
  }
};

global.fetch = function () { return Promise.reject(new Error("no network in tests")); };
global.FormData = function () { this.append = function () {}; };
global.FileReader = function () {};

// ---------- Load popup.js with exposed internals ----------

const popupSrc = fs.readFileSync("d:/AI-Virtual-Try-On/extension/popup.js", "utf8");

const exposed =
  "\nmodule.exports = { normalizeProduct, productIntelligence, buildRecord, " +
  "getGarmentDescription, detected, formatCategory, isTryOnSupported, " +
  "tryOnCategory, preferenceMatches, findKeyword, cleanProductTitle, " +
  "normalizePrice, sanitizeStoredRecord, setTryOnStatus, isTryOnStatus, " +
  "detectColor, detectFit, findPhrase, explicitField, displayAttribute, " +
  "fitValue };\n";

const testFile = path.join(process.env.TEMP || ".", "_popup_under_test.js");
fs.writeFileSync(testFile, popupSrc + exposed);

module.exports = require(testFile);
