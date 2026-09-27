// ============================================================
// TEMPORARY VALIDATION HARNESS (not part of the extension)
// Run: node harness_check.js
// ============================================================

const fs = require("fs");
const assert = require("assert");
const path = require("path");

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

// ---------- Load content.js with stubs ----------

global.chrome = {
  runtime: { onMessage: { addListener: function () {} } }
};
global.document = { baseURI: "https://example.com/" };

const contentSrc = fs.readFileSync(
  "d:/AI-Virtual-Try-On/extension/content.js",
  "utf8"
);

// Expose internals for testing.
const exposed =
  "\nmodule.exports = { cleanTitle, extractPrice, extractMrp, " +
  "extractDiscount, extractTitle, classifyCategory, findPriceRoot, " +
  "extractMeta, extractStructured, extractVariants, " +
  "collectProductNodes, productNodeFields, PRICE_PATTERN };\n";

const testFile = path.join(process.env.TEMP || ".", "_content_under_test.js");
fs.writeFileSync(testFile, contentSrc + exposed);
const content = require(testFile);

// ---------- cleanTitle: 9 prototyped cases ----------

const titleCases = [
  ["Route Women Cotton ShrugSizes: XLRs. 468Rs. 2499(81% OFF)", "Route Women Cotton Shrug"],
  ["Women Cotton Shrug", "Women Cotton Shrug"],
  ["Black Oversized T-Shirt", "Black Oversized T-Shirt"],
  ["White Formal Shirt", "White Formal Shirt"],
  ["Style Quotient Women Formal Shirt Rs. 659", "Style Quotient Women Formal Shirt"],
  ["Men Slim Fit Blue Cotton T-Shirt - \u20b9799 (50% OFF)", "Men Slim Fit Blue Cotton T-Shirt"],
  ["Denim Jacket Sizes: S, M, L Rs. 1499 MRP: Rs. 2999", "Denim Jacket"],
  ["Casual Sneakers $49.99 USD", "Casual Sneakers"],
  ["Red Dress - Sizes: XS, S, M, L - 30% OFF", "Red Dress"]
];

titleCases.forEach(function (pair, i) {
  check("cleanTitle #" + (i + 1), function () {
    assert.strictEqual(content.cleanTitle(pair[0]), pair[1]);
  });
});

check("cleanTitle empty/null", function () {
  assert.strictEqual(content.cleanTitle(""), "");
  assert.strictEqual(content.cleanTitle(null), "");
  assert.strictEqual(content.cleanTitle(undefined), "");
});

// Titles that must NOT be damaged by cleaning.
["Nike Air Zoom Pegasus 40", "Levi's 501 Original Fit Jeans", "H&M Loose Fit Hoodie"].forEach(function (t) {
  check("cleanTitle keeps: " + t, function () {
    assert.strictEqual(content.cleanTitle(t), t);
  });
});

// ---------- cleanTitle: extended edge cases ----------

const titleCases2 = [
  ["Anouk Ethnic Motifs Straight Kurta", "Anouk Ethnic Motifs Straight Kurta"],
  ["HRX by Hrithik Roshan Running T-Shirt MRP Rs. 1299", "HRX by Hrithik Roshan Running T-Shirt"],
  ["Roadster Denim Jacket Price: 999", "Roadster Denim Jacket"],
  ["Puma Sports Shoes Rs.2,499 (40% OFF)", "Puma Sports Shoes"],
  ["Kids Tee 15% OFF", "Kids Tee"],
  [" handloom Cotton Shirt ", "handloom Cotton Shirt"],
  ["Sling Bag $25", "Sling Bag"],
  ["Women Leggings INR 499", "Women Leggings"],
  ["Printed Kurti  Rs. 719  Rs. 1,599 (55% OFF)", "Printed Kurti"]
];

titleCases2.forEach(function (pair, i) {
  check("cleanTitle edge #" + (i + 1), function () {
    assert.strictEqual(content.cleanTitle(pair[0]), pair[1]);
  });
});

// ---------- SPEC CASES (Myntra real inputs) ----------

const specCases = [
  ["RouteWomen Cotton ShrugSizes: XLRs. 468Rs. 2499(81% OFF)", "Route Women Cotton Shrug"],
  ["Style QuotientWomen Formal ShirtSizes: XLRs. 674Rs. 1399(52% OFF)", "Style Quotient Women Formal Shirt"]
];

specCases.forEach(function (pair, i) {
  check("SPEC cleanTitle #" + (i + 1), function () {
    assert.strictEqual(content.cleanTitle(pair[0]), pair[1]);
  });
});

check("SPEC extractPrice selling price first", function () {
  assert.strictEqual(
    content.extractPrice(fakeContainer("Rs. 674 Rs. 1399 (52% OFF)")),
    "Rs. 674"
  );
});

// ---------- SPEC: MRP and discount are separate fields ----------

check("SPEC extractMrp second distinct price", function () {
  assert.strictEqual(
    content.extractMrp(fakeContainer("Rs. 674 Rs. 1399 (52% OFF)")),
    "Rs. 1399"
  );
  assert.strictEqual(
    content.extractMrp(fakeContainer("Rs. 468Rs. 2499(81% OFF)")),
    "Rs. 2499"
  );
});

check("SPEC extractMrp empty when single price", function () {
  assert.strictEqual(content.extractMrp(fakeContainer("Rs. 674 only")), "");
  assert.strictEqual(content.extractMrp(null), "");
});

check("SPEC extractDiscount percent off", function () {
  assert.strictEqual(
    content.extractDiscount(fakeContainer("Rs. 674 Rs. 1399 (52% OFF)")),
    "52% OFF"
  );
  assert.strictEqual(
    content.extractDiscount(fakeContainer("RouteWomen ShrugSizes: XLRs. 468Rs. 2499(81% OFF)")),
    "81% OFF"
  );
  assert.strictEqual(content.extractDiscount(fakeContainer("No discount here")), "");
  assert.strictEqual(content.extractDiscount(null), "");
});

// ---------- extractTitle: more fallbacks ----------

check("extractTitle prefers name element text", function () {
  const img = fakeImg({ alt: "ignored alt", src: "https://cdn.example.com/a.jpg" });
  const container = {
    querySelector: function (sel) {
      if (sel.indexOf("itemprop") !== -1 || sel.indexOf("productName") !== -1) {
        return { textContent: "Nice Cotton Shirt Rs. 550" };
      }
      return null;
    }
  };
  assert.strictEqual(content.extractTitle(img, container), "Nice Cotton Shirt");
});
// ---------- cleanTitle: identifier integrity ----------

check("cleanTitle defined once", function () {
  assert.strictEqual((contentSrc.match(/function cleanTitle\(/g) || []).length, 1);
});
check("cleanTitle handles unicode rupee", function () {
  assert.strictEqual(content.cleanTitle("Cotton Kurta ₹1,299"), "Cotton Kurta");
});
check("cleanTitle handles glued percent", function () {
  assert.strictEqual(content.cleanTitle("Summer Top40% OFF"), "Summer Top");
});
check("cleanTitle keeps numeric model names", function () {
  assert.strictEqual(content.cleanTitle("Air Max 90 Shoes"), "Air Max 90 Shoes");
});
check("cleanTitle keeps 'Rs' as word in name", function () {
  // "Rs" only cuts when followed by a number.
  assert.strictEqual(content.cleanTitle("RS Collections Shirt"), "RS Collections Shirt");
});
check("cleanTitle trims trailing separators", function () {
  assert.strictEqual(content.cleanTitle("Blue Shirt - "), "Blue Shirt");
});
check("cleanTitle does not cut on plain colon word", function () {
  // Only "Size:"/"Sizes:"/"Price:" are metadata; a plain colon stays.
  assert.strictEqual(content.cleanTitle("Top: Casual Wear"), "Top: Casual Wear");
});

// ---------- category safety ----------

check("classifyCategory accessories", function () {
  assert.strictEqual(content.classifyCategory("Leather Handbag"), "accessories");
});
check("classifyCategory footwear", function () {
  assert.strictEqual(content.classifyCategory("Running Shoes"), "footwear");
});
check("classifyCategory lower_body", function () {
  assert.strictEqual(content.classifyCategory("Slim Fit Jeans"), "lower_body");
});
check("classifyCategory unknown", function () {
  assert.strictEqual(content.classifyCategory("Mystery Box"), "unknown");
});



// ---------- extractPrice: independent of title, first match wins ----------

function fakeContainer(text) {
  return { innerText: text, textContent: text };
}

const priceCases = [
  ["Rs. 468 Rs. 2499 (81% OFF)", "Rs. 468"],
  ["\u20b91,299 \u20b92,999 (56% OFF)", "\u20b91,299"],
  ["INR 799 MRP Rs. 1,499", "INR 799"],
  ["$49.99 USD $99.99", "$49.99"],
  ["Black Cotton Shirt\nSizes: M, L\nRs. 899 Rs. 1,799 (50% OFF)", "Rs. 899"],
  ["No price here at all", ""],
  ["", ""]
];

priceCases.forEach(function (pair, i) {
  check("extractPrice #" + (i + 1), function () {
    assert.strictEqual(content.extractPrice(fakeContainer(pair[0])), pair[1]);
  });
});

check("extractPrice null container", function () {
  assert.strictEqual(content.extractPrice(null), "");
});

check("extractPrice runs independently of title", function () {
  const p = content.extractPrice(fakeContainer("Fancy thing \u20b9499 only"));
  assert.strictEqual(p, "\u20b9499");
});
// ---------- extractPrice: extended cases ----------

const priceCases2 = [
  ["Rs.468", "Rs.468"],
  ["Rs 899", "Rs 899"],
  ["INR 2,999 MRP INR 4,999", "INR 2,999"],
  ["USD 49.99", "USD 49.99"],
  ["Sizes: S, M, L XL", ""],
  ["50% OFF only", ""],
  ["Rs.", ""],
  ["Price on request", ""]
];

priceCases2.forEach(function (pair, i) {
  check("extractPrice edge #" + (i + 1), function () {
    assert.strictEqual(content.extractPrice(fakeContainer(pair[0])), pair[1]);
  });
});

check("extractPrice uses textContent when innerText missing", function () {
  assert.strictEqual(
    content.extractPrice({ textContent: "Sale Rs. 999 today" }),
    "Rs. 999"
  );
});

// ---------- Myntra card shape: image wrapper has no price text ----------

// Myntra wraps the product image in a container that contains only
// the image, while the name / sizes / prices live in a sibling
// subtree of the same card. findPriceRoot must resolve the container
// that actually holds the card text.
check("findPriceRoot falls back to the anchor when container is missing", function () {
  const anchor = { innerText: "Route Shrug Sizes: XL Rs. 468" };
  const img = {
    closest: function (sel) { return sel === "a" ? anchor : null; }
  };
  assert.strictEqual(content.findPriceRoot(img, null), anchor);
});

check("findPriceRoot keeps the resolved card container", function () {
  const container = { innerText: "Rs. 468" };
  const img = { closest: function () { return null; } };
  assert.strictEqual(content.findPriceRoot(img, container), container);
});

check("price is read from the card root, not the image wrapper", function () {
  // Image-only wrapper -> no price, exactly like a real Myntra card.
  const imageWrapper = { innerText: "", textContent: "" };
  const cardRoot = fakeContainer(
    "RouteWomen Cotton ShrugSizes: XLRs. 468Rs. 2499(81% OFF)"
  );

  assert.strictEqual(content.extractPrice(imageWrapper), "");
  assert.strictEqual(content.extractPrice(cardRoot), "Rs. 468");
  assert.strictEqual(content.extractMrp(cardRoot), "Rs. 2499");
  assert.strictEqual(content.extractDiscount(cardRoot), "81% OFF");
});


// ---------- extractTitle end-to-end with a fake card ----------

function fakeImg(attrs) {
  return {
    getAttribute: function (n) { return attrs[n] || null; },
    currentSrc: attrs.src || "",
    closest: function () { return null; }
  };
}

check("extractTitle cleans metadata from alt", function () {
  const img = fakeImg({
    alt: "Route Women Cotton ShrugSizes: XLRs. 468Rs. 2499(81% OFF)",
    src: "https://cdn.example.com/p/1.jpg"
  });
  assert.strictEqual(content.extractTitle(img, null), "Route Women Cotton Shrug");
});

check("extractTitle keeps clean alt", function () {
  const img = fakeImg({ alt: "Black Oversized T-Shirt", src: "https://cdn.example.com/p/2.jpg" });
  assert.strictEqual(content.extractTitle(img, null), "Black Oversized T-Shirt");
});

check("extractTitle falls back to Product", function () {
  const img = fakeImg({ src: "https://cdn.example.com/hash-97443721-d8ea-474b-8e2a.jpg" });
  assert.strictEqual(content.extractTitle(img, null), "Product");
});

// ---------- classifyCategory still works ----------

check("classifyCategory upper_body", function () {
  assert.strictEqual(content.classifyCategory("Black Oversized T-Shirt"), "upper_body");
});
check("classifyCategory dresses", function () {
  assert.strictEqual(content.classifyCategory("Red Cotton Dress"), "dresses");
});

// ---------- Structured metadata (JSON-LD) ----------

// document.querySelectorAll is used by extractStructured; the stub
// below is replaced per test.
function fakeScript(obj) {
  return { textContent: JSON.stringify(obj) };
}

function withJsonLd(nodes, fn) {

  const previous = global.document.querySelectorAll;

  global.document.querySelectorAll = function (sel) {
    if (sel.indexOf("ld+json") !== -1) return nodes;
    return [];
  };

  try {
    return fn();
  } finally {
    if (previous) {
      global.document.querySelectorAll = previous;
    } else {
      delete global.document.querySelectorAll;
    }
  }
}

check("productNodeFields maps JSON-LD fields to labels", function () {
  const out = content.productNodeFields({
    color: "Navy Blue",
    pattern: "Solid",
    fit: "Regular Fit"
  });
  assert.ok(out.indexOf("Colour: Navy Blue") !== -1, out);
  assert.ok(out.indexOf("Pattern: Solid") !== -1, out);
  assert.ok(out.indexOf("Fit: Regular Fit") !== -1, out);
});

check("productNodeFields handles array colour", function () {
  const out = content.productNodeFields({ color: ["Navy Blue", "White"] });
  assert.ok(out.indexOf("Navy Blue") !== -1, out);
});

check("collectProductNodes finds nested Product nodes", function () {
  const found = [];
  content.collectProductNodes(
    { "@graph": [{ "@type": "WebPage" }, { "@type": "Product", color: "Red" }] },
    found
  );
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].color, "Red");
});

check("extractStructured reads single product JSON-LD", function () {
  const out = withJsonLd(
    [fakeScript({ "@type": "Product", color: "Grey", pattern: "Floral", fit: "Relaxed Fit" })],
    function () { return content.extractStructured(null); }
  );
  assert.ok(out.indexOf("Colour: Grey") !== -1, out);
  assert.ok(out.indexOf("Pattern: Floral") !== -1, out);
  assert.ok(out.indexOf("Fit: Relaxed Fit") !== -1, out);
});

check("extractStructured ignores a grid of many products", function () {
  // Two products on one page: page level data is ambiguous and must
  // not be used, so a neighbouring colour cannot leak in.
  const out = withJsonLd(
    [
      fakeScript({ "@type": "Product", color: "Red" }),
      fakeScript({ "@type": "Product", color: "Blue" })
    ],
    function () { return content.extractStructured(null); }
  );
  assert.strictEqual(out, "", "ambiguous JSON-LD must be ignored");
});

check("extractStructured survives malformed JSON", function () {
  const out = withJsonLd(
    [{ textContent: "{not json" }],
    function () { return content.extractStructured(null); }
  );
  assert.strictEqual(out, "");
});

check("extractMeta keeps labelled style fields, drops noise", function () {
  const text = "Roadster Solid Regular Fit Shirt Colour: Navy Blue Rs. 1399 52% OFF";
  const out = content.extractMeta(fakeContainer(text));
  assert.ok(out.indexOf("Colour: Navy Blue") !== -1, out);
  // Price / discount must not become attribute evidence.
  assert.ok(out.indexOf("1399") === -1, out);
  assert.ok(out.indexOf("52%") === -1, out);
});

check("extractVariants reads a colour swatch attribute", function () {
  const swatch = {
    getAttribute: function (n) {
      return n === "data-color" ? "Navy Blue" : null;
    },
    textContent: ""
  };
  const container = {
    querySelectorAll: function () { return [swatch]; }
  };
  const out = content.extractVariants(container);
  assert.ok(out.indexOf("Navy Blue") !== -1, out);
});

module.exports = { check: check, done: function () {
  console.log("\n" + (checks - failures) + "/" + checks + " checks passed.");
  if (failures > 0) process.exit(1);
} };
