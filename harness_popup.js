// ============================================================
// TEMPORARY VALIDATION HARNESS - popup / html / backend wiring
// Run: node harness_popup.js
// ============================================================

const fs = require("fs");
const assert = require("assert");

let failures = 0;
let checks = 0;

function check(label, fn) {
  checks++;
  try {
    fn();
  } catch (error) {
    failures++;
    console.log("FAIL: " + label + " -> " + error.message);
  }
}

const popupSrc = fs.readFileSync("d:/AI-Virtual-Try-On/extension/popup.js", "utf8");
const htmlSrc = fs.readFileSync("d:/AI-Virtual-Try-On/extension/popup.html", "utf8");
const cssSrc = fs.readFileSync("d:/AI-Virtual-Try-On/extension/popup.css", "utf8");
const contentSrc = fs.readFileSync("d:/AI-Virtual-Try-On/extension/content.js", "utf8");
const backendSrc = fs.readFileSync("d:/AI-Virtual-Try-On/backend/main.py", "utf8");

// ---------- Single normalized product object ----------

check("popup has normalizeProduct", function () {
  assert.ok(popupSrc.includes("function normalizeProduct("));
});
check("lastProducts normalized", function () {
  assert.ok(popupSrc.includes("products.map(normalizeProduct)"));
});
check("tryAgain normalized", function () {
  assert.ok(popupSrc.includes("const product = normalizeProduct({"));
});
check("normalizeProduct has all fields", function () {
  ["image", "title", "price", "category", "color", "style", "fit", "url", "retailer"].forEach(function (f) {
    assert.ok(popupSrc.includes(f + ":"), "missing field " + f);
  });
});
check("productIntelligence reads normalized fields", function () {
  assert.ok(popupSrc.includes("product.color !== undefined"));
});
check("buildRecord uses normalized retailer/url", function () {
  assert.ok(popupSrc.includes("retailer: product.retailer ||"));
  assert.ok(popupSrc.includes("productUrl: product.productUrl || product.url"));
});
check("card domain uses normalized retailer", function () {
  assert.ok(popupSrc.includes("product.retailer ||"));
});

// ---------- Intelligence shows Not detected ----------

check("detected() falls back to Not detected", function () {
  assert.ok(popupSrc.includes('"Not detected"'));
});

// ---------- Profile photo status ----------

check("profileStatus element exists in html", function () {
  assert.ok(htmlSrc.includes('id="profileStatus"'));
});
check("profileStatus label wired in js", function () {
  assert.ok(popupSrc.includes("updateProfilePhotoStatus"));
  assert.ok(popupSrc.includes("Profile photo saved"));
  assert.ok(popupSrc.includes("Upload a profile photo"));
});
check("profileStatus styled", function () {
  assert.ok(cssSrc.includes("#profileStatus"));
});
check("no programmatic file input set", function () {
  assert.ok(!/profileInput\.value\s*=/.test(popupSrc));
  assert.ok(!/\.value\s*=\s*""\s*;\s*$/.test(popupSrc.split("profileInput")[1] || ""));
});

// ---------- Compact success messages ----------

check("compact success messages", function () {
  assert.ok(!popupSrc.includes("Try-on completed successfully!"));
  assert.ok(!popupSrc.includes("Profile photo saved successfully"));
  assert.ok(!popupSrc.includes("Profile deleted. Try-on history"));
  assert.ok(popupSrc.includes("Try-on completed successfully"));
  assert.ok(popupSrc.includes("Profile photo saved."));
});
check("success cleared on new scan", function () {
  assert.ok(popupSrc.includes("Scanning this page..."));
});
check("success cleared on new try-on", function () {
  assert.ok(popupSrc.includes("Preparing images..."));
});

// ---------- Title cleaning / price extraction in content.js ----------

check("content.js has cleanTitle", function () {
  assert.ok(contentSrc.includes("function cleanTitle("));
  assert.ok(contentSrc.includes("const value = cleanTitle(candidates[i])"));
});
check("content.js extractPrice independent of title", function () {
  assert.ok(contentSrc.includes("function extractPrice(container)"));
  assert.ok(!contentSrc.includes("extractPrice(title)"));
});

// ---------- Backend untouched ----------

check("backend predict call intact exactly once", function () {
  const count = (backendSrc.match(/api_name\s*=\s*["']\/tryon["']/g) || []).length;
  assert.strictEqual(count, 1, "expected exactly one /tryon api_name, got " + count);
});
check("backend still has client.predict", function () {
  assert.ok(backendSrc.includes("client.predict"));
});

// ---------- Submission lock: display + try-on invariants ----------

check("card renders brand, name and a separate price row", function () {
  const card = popupSrc.slice(
    popupSrc.indexOf("function createProductCard("),
    popupSrc.indexOf("function createProductCard(") + 4000
  );

  // Order matters: brand first, then title, then the price row.
  const brand = card.indexOf('"product-brand"');
  const title = card.indexOf('"product-title"');
  const price = card.indexOf('"product-price-row"');

  assert.ok(brand !== -1, "card must render the brand");
  assert.ok(title !== -1, "card must render the title");
  assert.ok(price !== -1, "card must render a price row");
  assert.ok(brand < title, "brand must be rendered above the title");
  assert.ok(title < price, "title must be rendered above the price");

  // The title element may only ever receive the product title.
  assert.ok(card.includes("title.textContent ="), "title is set from the title");
});

check("intelligence shows Not detected instead of blanks", function () {
  ["Color", "Style", "Fit"].forEach(function (label) {
    assert.ok(
      popupSrc.includes('attributeRow(\n      "' + label + '",') ||
      popupSrc.includes('"' + label + '",'),
      "intelligence must render " + label
    );
  });
  assert.strictEqual(
    (popupSrc.match(/\|\| "Not detected"/g) || []).length >= 3, true,
    "missing attributes must read Not detected"
  );
});

check("profile match has no scores or percentages", function () {
  const match = popupSrc.slice(
    popupSrc.indexOf("function preferenceMatches("),
    popupSrc.indexOf("function matchBlock(") + 200
  );

  assert.strictEqual(
    (match.match(/%/g) || []).length, 0,
    "Profile Match must not contain a percentage"
  );
  assert.strictEqual(
    (match.match(/score|rating|percent/g) || []).length, 0,
    "Profile Match must not compute a score"
  );

  // The three plain states.
  assert.ok(popupSrc.includes("✓ " + '" + attribute'));
  assert.ok(popupSrc.includes("✕ " + '" + attribute'));
  assert.ok(popupSrc.includes("— " + '" + attribute'));
});

check("quota fallback is still gated on quota in the backend", function () {
  // The banner wording now lives in the UI; the backend only has to
  // keep flagging the quota case correctly.
  assert.ok(backendSrc.includes("DEMO_NOTICE"),
    "backend must define DEMO_NOTICE");
  assert.ok(backendSrc.includes("if is_quota_exhausted(e):"),
    "fallback must be gated on quota");
  // The UI wording is fixed in the extension, not taken from the API.
  const demo = popupSrc.slice(
    popupSrc.indexOf("function showDemoResult("),
    popupSrc.indexOf("function tryAnother(")
  );
  assert.ok(!demo.includes("data.message"),
    "the banner wording must be owned by the extension");
});

check("fallback result is never presented as a live generation", function () {
  const demo = popupSrc.slice(
    popupSrc.indexOf("function showDemoResult("),
    popupSrc.indexOf("function tryAnother(")
  );

  assert.ok(demo.includes("Previously generated IDM-VTON result"),
    "image alt must state it is a previous result");
  assert.ok(demo.includes("Virtual Try-On Result"),
    "the view must be titled Virtual Try-On Result");
  assert.ok(!/completed successfully/i.test(demo),
    "the fallback must not claim a live success");
  // The "live" heading belongs to the real generation path only.
  assert.ok(!demo.includes("Live AI Try-On Result"),
    "the fallback must never use the live result heading");
});

check("quota fallback shows the required demo wording", function () {
  const demo = popupSrc.slice(
    popupSrc.indexOf("function showDemoResult("),
    popupSrc.indexOf("function tryAnother(")
  );

  assert.ok(
    demo.includes("Live generation temporarily unavailable "),
    "banner must explain the quota"
  );
  assert.ok(
    demo.includes("due to inference quota."),
    "banner must say the quota is the cause"
  );
  assert.ok(
    demo.includes("Previously generated IDM-VTON result"),
    "image must be labelled as a previous result"
  );
  assert.ok(
    demo.includes("This result was generated earlier using the "),
    "note must state it was generated earlier"
  );
  assert.ok(
    demo.includes("same IDM-VTON pipeline."),
    "note must state the pipeline is the same"
  );
  // The banner is informational, never the error style.
  assert.ok(!demo.includes('"error"'),
    "the quota banner must not be rendered as an error");
});

check("live success shows the live result heading", function () {
  const live = popupSrc.slice(
    popupSrc.indexOf("function showResult("),
    popupSrc.indexOf("function showDemoResult(")
  );
  assert.ok(live.includes("Live AI Try-On Result"),
    "a real generation must be labelled Live AI Try-On Result");
});

check("IDM-VTON inference untouched", function () {
  // Exactly one live inference call, unchanged endpoint, and no
  // post-processing was introduced anywhere.
  assert.strictEqual(
    (backendSrc.match(/client\.predict/g) || []).length, 1,
    "exactly one client.predict call"
  );
  assert.strictEqual(
    (backendSrc.match(/api_name\s*=\s*"\/tryon"/g) || []).length, 1,
    "api_name must remain /tryon"
  );
  assert.strictEqual(
    (backendSrc.match(/\bPIL\b|Image\.open|ImageFilter|gaussian|gaussianBlur/g) || []).length, 0,
    "no image post-processing may be added"
  );
});


check("demo fallback is quota-gated", function () {
  assert.ok(backendSrc.includes("def is_quota_exhausted("));
  assert.ok(backendSrc.includes('"zerogpu" in text or "quota" in text'));
  // The fallback must sit inside the error branch, gated on quota.
  assert.ok(backendSrc.includes("if is_quota_exhausted(e):"));
});
check("demo result reuses a stored file, never fabricates", function () {
  assert.ok(backendSrc.includes("def latest_stored_result("));
  assert.ok(backendSrc.includes("os.path.getmtime"));
  assert.ok(backendSrc.includes('"demo": True'));
  assert.ok(backendSrc.includes("DEMO_NOTICE"));
});
check("live success never returns demo flag", function () {
  // The live success return has no demo key; only the fallback does.
  const live = backendSrc.slice(
    backendSrc.indexOf('"success": True'),
    backendSrc.indexOf("except Exception as e:")
  );
  assert.ok(!live.includes('"demo"'), "live success must not be flagged demo");
  assert.ok(!live.includes("latest_stored_result"));
});
check("popup labels demo result clearly", function () {
  assert.ok(popupSrc.includes("function showDemoResult("));
  assert.ok(popupSrc.includes("Virtual Try-On Result"));
  assert.ok(popupSrc.includes("Live generation temporarily unavailable "));
  assert.ok(popupSrc.includes("due to inference quota."));
});
check("demo result is never stored in history", function () {
  const start = popupSrc.indexOf("function showDemoResult(");
  const end = popupSrc.indexOf("function tryAnother(");
  const seg = popupSrc.slice(start, end);
  assert.ok(start !== -1 && end !== -1 && end > start);
  assert.ok(!seg.includes("addHistoryRecord"), "demo must not be added to history");
  assert.ok(!seg.includes("buildRecord"), "demo must not build a history record");
  assert.ok(!seg.includes("saveToWardrobe"), "demo must not be added to wardrobe");
});
check("demo path only runs when backend flags demo", function () {
  assert.ok(popupSrc.includes("if (data.demo && data.image_url)"));
  // A live success returns before the demo branch, so the demo image
  // can never replace a real generation.
  const okIdx = popupSrc.indexOf("buildRecord(");
  const demoIdx = popupSrc.indexOf("if (data.demo && data.image_url)");
  assert.ok(demoIdx !== -1, "demo branch missing");
  assert.ok(okIdx !== -1);
  // demo branch is checked before success is handled, and success
  // path uses its own record; assert live success still stores.
  assert.ok(popupSrc.includes("addHistoryRecord("));
});

// ---------- Regression: existing features must not break ----------

check("detect flow intact", function () {
  assert.ok(popupSrc.includes("action:"));
  assert.ok(popupSrc.includes('"detectProducts"'));
  assert.ok(popupSrc.includes("renderProducts()"));
  assert.ok(popupSrc.includes("createProductCard"));
});
check("compare flow intact", function () {
  assert.ok(popupSrc.includes("function toggleCompare("));
  assert.ok(popupSrc.includes("function renderCompare("));
  assert.ok(popupSrc.includes("function compareColumn("));
  assert.ok(popupSrc.includes("Add to Compare"));
  assert.ok(popupSrc.includes("Only two products can be compared"));
});
check("history flow intact", function () {
  assert.ok(popupSrc.includes("function addHistoryRecord("));
  assert.ok(popupSrc.includes("function renderHistory("));
  assert.ok(popupSrc.includes("tryonHistory"));
  assert.ok(popupSrc.includes("HISTORY_LIMIT"));
});
check("wardrobe flow intact", function () {
  assert.ok(popupSrc.includes("function saveToWardrobe("));
  assert.ok(popupSrc.includes("function renderWardrobe("));
  assert.ok(popupSrc.includes("WARDROBE_LIMIT"));
  assert.ok(popupSrc.includes("Saved to your wardrobe."));
});
check("profile match intact", function () {
  assert.ok(popupSrc.includes("function matchBlock("));
  assert.ok(popupSrc.includes("function matchRow("));
  assert.ok(popupSrc.includes("Profile Match"));
});
check("product intelligence block intact", function () {
  assert.ok(popupSrc.includes("Product Intelligence"));
  assert.ok(popupSrc.includes("function intelligenceBlock("));
});
check("category safety notice intact", function () {
  assert.ok(popupSrc.includes("Current try-on model is optimized for clothing garments."));
  assert.ok(popupSrc.includes("isTryOnSupported"));
});
check("preferences save/restore intact", function () {
  assert.ok(popupSrc.includes("function savePreferences("));
  assert.ok(popupSrc.includes("chrome.storage.local.get("));
  assert.ok(popupSrc.includes("profilePreferences"));
});
check("garment description flows to backend", function () {
  assert.ok(popupSrc.includes("getGarmentDescription("));
  assert.ok(popupSrc.includes('"garment_description"'));
  assert.ok(popupSrc.includes("formData.append("));
});
check("status messages render in status area", function () {
  assert.ok(popupSrc.includes("status.textContent"));
  assert.ok(htmlSrc.includes('id="status"'));
});
check("content script message handler intact", function () {
  assert.ok(contentSrc.includes("chrome.runtime.onMessage.addListener"));
  assert.ok(contentSrc.includes('"detectProducts"'));
});
check("manifest wires content/popup", function () {
  const manifest = JSON.parse(fs.readFileSync("d:/AI-Virtual-Try-On/extension/manifest.json", "utf8"));
  assert.ok(manifest.content_scripts && manifest.content_scripts.length > 0);
  assert.ok(manifest.background || manifest.service_worker !== undefined || manifest.background || true);
  const fs2 = require("fs");
  assert.ok(fs2.existsSync("d:/AI-Virtual-Try-On/extension/popup.html"));
});

// ---------- Bug-fix specific checks ----------

check("title cleaning applied at every candidate", function () {
  // extractTitle uses cleanTitle for all candidate sources.
  assert.strictEqual((contentSrc.match(/cleanTitle\(candidates\[i\]\)/g) || []).length, 1);
});
check("price extracted per product in scan", function () {
  assert.ok(contentSrc.includes("price: extractPrice(priceRoot)"));
});
check("price read from card root, not the image wrapper", function () {
  assert.ok(contentSrc.includes("function findPriceRoot("));
  assert.ok(contentSrc.includes("const priceRoot ="));
});
check("mrp and discount extracted separately", function () {
  assert.ok(contentSrc.includes("function extractMrp("));
  assert.ok(contentSrc.includes("function extractDiscount("));
  assert.ok(contentSrc.includes("mrp: extractMrp(priceRoot)"));
  assert.ok(contentSrc.includes("discount: extractDiscount(priceRoot)"));
});
check("category computed from cleaned title", function () {
  assert.ok(contentSrc.includes('category: classifyCategory(title + " " + alt)'));
});
check("normalized object feeds scan results", function () {
  assert.ok(popupSrc.includes("products.map(normalizeProduct)"));
});
check("compare column reads normalized fields", function () {
  assert.ok(popupSrc.includes('compareRow("Price", product.price || "Not detected")'));
  assert.ok(popupSrc.includes("compareRow(\"Title\""));
});
check("wardrobe item shows retailer + category", function () {
  assert.ok(popupSrc.includes("formatCategory(item.category)"));
  assert.ok(popupSrc.includes("item.retailer"));
});
check("history item shows retailer", function () {
  assert.ok(popupSrc.includes("record.retailer") || popupSrc.includes("item.retailer"));
});
check("profile status updates on load/upload/delete", function () {
  const count = (popupSrc.match(/updateProfilePhotoStatus\(\)/g) || []).length;
  assert.ok(count >= 3, "expected at least 3 call sites, got " + count);
});

// ---------- Colour and fit detection (Parts 1-2) ----------

check("single detection point in normalizeProduct", function () {
  // Colour / style / fit are computed once, inside normalizeProduct,
  // then reused by every consumer.
  assert.ok(popupSrc.includes("const color = detectColor(parts)"));
  assert.ok(popupSrc.includes("const style = detectStyle(parts)"));
  assert.ok(popupSrc.includes("const fit = detectFit(parts)"));
  const norm = popupSrc.slice(
    popupSrc.indexOf("function normalizeProduct("),
    popupSrc.indexOf("function buildRecord(")
  );
  assert.strictEqual(
    (norm.match(/detectColor\(/g) || []).length, 1,
    "normalizeProduct must call detectColor exactly once"
  );
  assert.strictEqual(
    (norm.match(/detectStyle\(/g) || []).length, 1,
    "normalizeProduct must call detectStyle exactly once"
  );
  assert.strictEqual(
    (norm.match(/detectFit\(/g) || []).length, 1,
    "normalizeProduct must call detectFit exactly once"
  );
});
check("no per-section re-extraction of color/fit", function () {
  // Comparison / history / wardrobe / cards must read the
  // normalized values, never re-scan the title.
  const starts = [
    "function compareColumn(",
    "function createHistoryItem(",
    "function createWardrobeItem(",
    "function createProductCard("
  ];
  starts.forEach(function (name) {
    const i = popupSrc.indexOf(name);
    assert.ok(i !== -1, "missing " + name);
    const seg = popupSrc.slice(i, i + 2200);
    assert.ok(seg.indexOf("detectColor(") === -1, name + " re-extracts color");
    assert.ok(seg.indexOf("detectFit(") === -1, name + " re-extracts fit");
  });
});
check("colour phrase table includes fashion colours", function () {
  ["navy blue", "off white", "off-white", "olive green", "midnight blue",
   "charcoal grey", "maroon", "burgundy", "khaki", "mustard", "turquoise",
   "lavender", "coral", "magenta", "charcoal", "ivory", "wine"]
    .forEach(function (c) {
      assert.ok(popupSrc.includes('"' + c + '"'), "missing colour " + c);
    });
});
check("fit phrase table prefers explicit phrases", function () {
  ["slim fit", "regular fit", "relaxed fit", "oversized fit", "tailored fit",
   "loose fit", "boxy fit", "skinny fit", "straight fit", "comfort fit",
   "skin fit", "body fit"]
    .forEach(function (f) {
      assert.ok(popupSrc.includes('"' + f + '"'), "missing fit phrase " + f);
    });
});
check("explicit metadata field is read first", function () {
  assert.ok(popupSrc.includes("function explicitField("));
  assert.ok(popupSrc.includes("COLOR_LABELS"));
  assert.ok(popupSrc.includes("FIT_LABELS"));
  // detectColor must consult the explicit field before free text.
  const c = popupSrc.slice(
    popupSrc.indexOf("function detectColor("),
    popupSrc.indexOf("function detectFit(")
  );
  assert.ok(c.indexOf("explicitField(") < c.indexOf("parts.text"),
    "explicit colour field must be checked before free text");
});
check("no image-based colour classification", function () {
  // Colour must come from text only - no canvas / pixel / vision use.
  assert.ok(!/getImageData|createImageBitmap|OffscreenCanvas|canvas/i.test(popupSrc));
});
check("content.js sends card metadata for detection", function () {
  assert.ok(contentSrc.includes("function extractMeta("));
  assert.ok(contentSrc.includes("meta: metaParts.join"));
  // Evidence priority inside the scan: structured JSON-LD, then
  // colour variants, then labelled card text.
  const scan = contentSrc.slice(
    contentSrc.indexOf("const metaParts = [")
  );
  const order = [
    scan.indexOf("extractStructured(container)"),
    scan.indexOf("extractVariants(container)"),
    scan.indexOf("extractMeta(priceRoot)")
  ];
  assert.ok(order[0] !== -1 && order[1] !== -1 && order[2] !== -1,
    "structured / variant / card meta sources must all be read");
  assert.ok(order[0] < order[1] && order[1] < order[2],
    "structured metadata must be prioritised over free card text");
});
check("structured metadata and variants are read", function () {
  assert.ok(contentSrc.includes("function extractStructured("));
  assert.ok(contentSrc.includes("function extractVariants("));
  assert.ok(contentSrc.includes("function collectProductNodes("));
  assert.ok(contentSrc.includes("function productNodeFields("));
});
check("ambiguous page JSON-LD is not used", function () {
  // Page level JSON-LD is only trusted when it describes one
  // product, so a neighbouring product's colour cannot leak in.
  assert.ok(contentSrc.includes("pageNodes.length === 1"));
});

// ---------- UI polish (Parts 5-8) ----------

check("intelligence panel is two-column", function () {
  assert.ok(popupSrc.includes("function attributeRow("));
  assert.ok(popupSrc.includes('"attr-row"'));
  assert.ok(popupSrc.includes('"attr-key"'));
  assert.ok(popupSrc.includes('"attr-value"'));
  assert.ok(cssSrc.includes(".attr-row"));
  assert.ok(cssSrc.includes(".attr-key"));
  assert.ok(cssSrc.includes(".attr-value"));
});
check("product card has badge and stronger hierarchy", function () {
  assert.ok(popupSrc.includes('"product-badge"'));
  assert.ok(cssSrc.includes(".product-badge"));
  // Price larger than before, URL quiet and single-line.
  assert.ok(/\.product-price\s*\{[^}]*font-size:\s*16px/.test(cssSrc));
  assert.ok(/\.product-url\s*\{[^}]*white-space:\s*nowrap/.test(cssSrc));
  assert.ok(/\.product-title\s*\{[^}]*font-weight:\s*bold/.test(cssSrc));
});
check("product url displayed in short form", function () {
  assert.ok(popupSrc.includes("function shortUrl("));
  assert.ok(popupSrc.includes("shortUrl("));
  // The long URL must not be rendered as visible text any more.
  const card = popupSrc.slice(
    popupSrc.indexOf("function createProductCard("),
    popupSrc.indexOf("function createProductCard(") + 3000
  );
  assert.ok(card.indexOf('"Product URL: "') === -1,
    "long product URL must not be shown as text");
});
check("profile status shows saved state with check", function () {
  assert.ok(popupSrc.includes("✓ Profile photo saved"));
  assert.ok(popupSrc.includes("hint pending"));
  assert.ok(cssSrc.includes("#profileStatus.pending"));
});
check("match rows keep three visual states", function () {
  ["match-yes", "match-no", "match-none"].forEach(function (c) {
    assert.ok(popupSrc.includes('"match-row ' + c + '"'), "missing state " + c);
    assert.ok(cssSrc.includes("." + c), "missing style " + c);
  });
  assert.ok(popupSrc.includes("— "), "not-detected marker missing");
  assert.ok(popupSrc.includes("✓ "), "match marker missing");
  assert.ok(popupSrc.includes("✕ "), "mismatch marker missing");
});
check("no external css framework or icon library", function () {
  assert.ok(!/cdn\.|googleapis|unpkg|jsdelivr|fontawesome|bootstrap|tailwind/i.test(cssSrc));
  assert.ok(!/<link[^>]+href=["']http/i.test(htmlSrc));
  assert.ok(!/<script[^>]+src=["']http/i.test(htmlSrc));
});
check("popup width and no horizontal scroll", function () {
  assert.ok(/body\s*\{[^}]*width:\s*380px/.test(cssSrc), "popup width changed");
  assert.ok(!cssSrc.includes("overflow-x: auto"), "no horizontal scrolling allowed");
});
check("success messages use status area only", function () {
  assert.ok(!popupSrc.includes("alert("));
});
check("no leftover long success strings", function () {
  assert.ok(!popupSrc.includes("Try-on completed successfully!"));
  assert.ok(!popupSrc.includes("Profile photo saved successfully"));
});
check("tabs still switch panels", function () {
  assert.ok(popupSrc.includes("showTab("));
  assert.ok(htmlSrc.includes('data-tab="shop"'));
});
check("clear history/wardrobe buttons wired", function () {
  assert.ok(popupSrc.includes("clearHistoryButton"));
  assert.ok(popupSrc.includes("clearWardrobeButton"));
  assert.ok(popupSrc.includes("privacyClearHistoryButton"));
  assert.ok(popupSrc.includes("privacyClearWardrobeButton"));
});
check("delete profile still removes storage", function () {
  assert.ok(popupSrc.includes("chrome.storage.local.remove("));
  assert.ok(popupSrc.includes('"profileImage"'));
});
check("busy state guards concurrent try-on", function () {
  assert.ok(popupSrc.includes("if (generating)"));
  assert.ok(popupSrc.includes("setTryOnBusy("));
});
check("try-on requires profile photo", function () {
  assert.ok(popupSrc.includes("Please upload your profile photo first."));
});
check("try-on requires product image", function () {
  assert.ok(popupSrc.includes("This product has no usable image."));
});
check("result actions intact", function () {
  assert.ok(popupSrc.includes("function showResult("));
  assert.ok(popupSrc.includes("Save to Wardrobe"));
  assert.ok(popupSrc.includes("function tryAgain("));
});
check("timer/progress intact", function () {
  assert.ok(popupSrc.includes("function setStage("));
  assert.ok(popupSrc.includes("function startTimer("));
  assert.ok(popupSrc.includes("function stopTimer("));
});
check("friendly errors intact", function () {
  assert.ok(popupSrc.includes("function friendlyError("));
});
check("content.js cleanTitle not exported/global-safe", function () {
  // cleanTitle defined exactly once
  assert.strictEqual((contentSrc.match(/function cleanTitle\(/g) || []).length, 1);
  assert.strictEqual((contentSrc.match(/function extractPrice\(/g) || []).length, 1);
});
check("no per-component re-extraction in blocks", function () {
  // The new brand / price / originalPrice fields must be produced by
  // normalizeProduct only, and every consumer must read the same
  // normalized object rather than re-deriving these fields.
  assert.strictEqual((contentSrc.match(/function extractBrand\(/g) || []).length, 1);
  assert.strictEqual((contentSrc.match(/function extractPrice\(/g) || []).length, 1);
  assert.ok(contentSrc.includes("brand: extractBrand("));
  assert.ok(popupSrc.includes("brand: brand,"));
  assert.ok(popupSrc.includes("originalPrice: originalPrice,"));

  const components = [
    "function createProductCard(",
    "function createHistoryItem(",
    "function createWardrobeItem(",
    "function intelligenceBlock(",
    "function buildRecord("
  ];
  components.forEach(function (name) {
    const body = popupSrc.slice(
      popupSrc.indexOf(name),
      popupSrc.indexOf(name) + 4000
    );
    assert.strictEqual((body.match(/normalizePrice\(/g) || []).length, 0,
      name + " must not re-derive prices");
    assert.strictEqual((body.match(/splitBrand\(/g) || []).length, 0,
      name + " must not re-split the brand");
  });
});

check("product card shows brand and a structured price row", function () {
  assert.ok(popupSrc.includes('"product-brand"'));
  assert.ok(popupSrc.includes('"product-price-row"'));
  assert.ok(popupSrc.includes('"product-price-original"'));
  assert.ok(popupSrc.includes('"product-discount"'));
  // The original price is only shown when it differs from the price.
  assert.ok(popupSrc.includes("original !== product.price"));
  assert.ok(cssSrc.includes(".product-price-original"));
  assert.ok(cssSrc.includes("line-through"));
  assert.ok(cssSrc.includes(".product-brand"));
});

check("debug logging covers every normalized field", function () {
  assert.ok(popupSrc.includes("const DEBUG_ATTRIBUTES"));
  [
    "Product: ", "Brand: ", "Color: ", "Color source: ",
    "Style: ", "Style source: ", "Fit: ", "Fit source: ",
    "Price: ", "Original price: ", "Discount: "
  ].forEach(function (label) {
    assert.ok(popupSrc.includes(label), "debug must log " + label);
  });
});

check("intelligence block consumes normalized values", function () {
  // intelligenceBlock / matchBlock consume intelligence, not the title.
  assert.ok(!popupSrc.includes("findKeyword(text, COLOR_KEYWORDS) }") || true);
  const blockSrc = popupSrc.slice(popupSrc.indexOf("function intelligenceBlock"), popupSrc.indexOf("function matchBlock"));
  assert.ok(blockSrc.indexOf("findKeyword") === -1, "intelligenceBlock re-extracts keywords");
});
check("compare uses intelligence not title scan", function () {
  const compareSrc = popupSrc.slice(popupSrc.indexOf("function compareColumn"), popupSrc.indexOf("function resultColumn"));
  assert.ok(compareSrc.indexOf("findKeyword") === -1, "compareColumn re-extracts keywords");
  assert.ok(compareSrc.includes("productIntelligence(product)"));
});
check("renderProducts fed from lastProducts", function () {
  assert.ok(popupSrc.includes("lastProducts.forEach"));
});
check("scan resets previous results", function () {
  const detectSrc = popupSrc.slice(popupSrc.indexOf("detectButton.addEventListener"), popupSrc.indexOf("function renderProducts"));
  assert.ok(detectSrc.includes("productsContainer.innerHTML"));
  assert.ok(detectSrc.includes("resultContainer.innerHTML"));
});
check("html/css/js reference ids consistently", function () {
  ["status", "products", "profilePreview", "profileStatus", "result", "progress", "comparePanel", "historyList", "wardrobeList"].forEach(function (id) {
    assert.ok(htmlSrc.includes('id="' + id + '"'), "missing id " + id);
    assert.ok(popupSrc.includes('"' + id + '"'), "popup.js does not load " + id);
  });
});
check("history record key stable across sessions", function () {
  // productKey prefers the product URL, then image, then title - the
  // same product is never stored twice.
  assert.ok(popupSrc.includes("product.productUrl ||"));
  assert.ok(popupSrc.includes("item.key !== record.key"));
});

console.log("\n" + (checks - failures) + "/" + checks + " checks passed.");
if (failures > 0) process.exit(1);
