// ============================================================
// TEMPORARY VALIDATION HARNESS - popup.js logic tests
// Run: node harness_logic_tests.js
// ============================================================

const assert = require("assert");
const popup = require("./harness_logic.js");

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

// ---------- normalizeProduct ----------

check("normalizeProduct full object", function () {
  const p = popup.normalizeProduct({
    id: 0,
    image: "https://cdn.example.com/1.jpg",
    alt: "Black Oversized T-Shirt",
    title: "Black Oversized T-Shirt",
    price: "Rs. 799",
    category: "upper_body",
    productUrl: "https://myntra.com/1"
  });
  assert.strictEqual(p.image, "https://cdn.example.com/1.jpg");
  assert.strictEqual(p.title, "Black Oversized T-Shirt");
  assert.strictEqual(p.price, "₹799");
  assert.strictEqual(p.category, "upper_body");
  assert.strictEqual(p.color, "black");
  assert.strictEqual(p.style, "");          // "oversized" is a fit, not a style
  assert.strictEqual(p.fit, "oversized");
  assert.strictEqual(p.url, "https://myntra.com/1");
  assert.strictEqual(p.productUrl, "https://myntra.com/1");
  assert.strictEqual(p.retailer, "myntra.com");
});

check("normalizeProduct defaults", function () {
  const p = popup.normalizeProduct({});
  assert.strictEqual(p.title, "Product");
  assert.strictEqual(p.price, "");
  assert.strictEqual(p.category, "unknown");
  assert.strictEqual(p.url, "");
  assert.strictEqual(p.color, "");
});

check("normalizeProduct prefers url alias", function () {
  const p = popup.normalizeProduct({ url: "https://shop.example.com/x" });
  assert.strictEqual(p.url, "https://shop.example.com/x");
  assert.strictEqual(p.productUrl, "https://shop.example.com/x");
  assert.strictEqual(p.retailer, "shop.example.com");
});

check("normalizeProduct null input", function () {
  const p = popup.normalizeProduct(null);
  assert.strictEqual(p.title, "Product");
});

// ---------- productIntelligence ----------

check("productIntelligence precomputed", function () {
  const i = popup.productIntelligence({
    title: "White Formal Shirt",
    category: "upper_body",
    color: "white",
    style: "formal",
    fit: ""
  });
  assert.strictEqual(i.color, "white");
  assert.strictEqual(i.style, "formal");
  assert.strictEqual(i.fit, "");
  assert.strictEqual(i.category, "upper_body");
});

check("productIntelligence fallback for legacy shape", function () {
  const i = popup.productIntelligence({
    title: "Red Slim Fit Jeans",
    alt: "",
    category: "lower_body"
  });
  assert.strictEqual(i.color, "red");
  assert.strictEqual(i.fit, "slim");
});

// ---------- Not detected fallbacks ----------

check("detected fallback", function () {
  assert.strictEqual(popup.detected(""), "Not detected");
  assert.strictEqual(popup.detected("black"), "Black");
});
check("formatCategory fallback", function () {
  assert.strictEqual(popup.formatCategory("unknown"), "Not detected");
  assert.strictEqual(popup.formatCategory("upper_body"), "Upper body");
});
check("isTryOnSupported only garments", function () {
  assert.strictEqual(popup.isTryOnSupported("upper_body"), true);
  assert.strictEqual(popup.isTryOnSupported("dresses"), true);
  assert.strictEqual(popup.isTryOnSupported("accessories"), false);
});

// ---------- buildRecord ----------

check("buildRecord uses normalized fields", function () {
  const p = popup.normalizeProduct({
    id: 0,
    image: "https://cdn.example.com/1.jpg",
    title: "Black Oversized T-Shirt",
    price: "Rs. 799",
    category: "upper_body",
    productUrl: "https://myntra.com/1"
  });
  const r = popup.buildRecord(p, "https://results.example.com/r.png");
  assert.strictEqual(r.title, "Black Oversized T-Shirt");
  assert.strictEqual(r.price, "₹799");
  assert.strictEqual(r.category, "upper_body");
  assert.strictEqual(r.retailer, "myntra.com");
  assert.strictEqual(r.productUrl, "https://myntra.com/1");
  assert.ok(r.key);
  assert.ok(r.timestamp > 0);
});

// ---------- Garment description ----------

check("getGarmentDescription uses normalized color", function () {
  const d = popup.getGarmentDescription({
    title: "Fancy Blazer",
    alt: "",
    category: "upper_body",
    color: "navy"
  });
  assert.strictEqual(d, "navy blazer");
});

check("getGarmentDescription invents nothing", function () {
  const d = popup.getGarmentDescription({
    title: "Totally Abstract Name",
    alt: "",
    category: "lower_body"
  });
  assert.strictEqual(d, "pants");
});

check("tryOnCategory maps unsupported to upper_body", function () {
  assert.strictEqual(popup.tryOnCategory("upper_body"), "upper_body");
  assert.strictEqual(popup.tryOnCategory("lower_body"), "lower_body");
  assert.strictEqual(popup.tryOnCategory("dresses"), "dresses");
  assert.strictEqual(popup.tryOnCategory("accessories"), "upper_body");
});

check("preferenceMatches neutral colours", function () {
  assert.strictEqual(popup.preferenceMatches("Color", "white", "neutral"), true);
  assert.strictEqual(popup.preferenceMatches("Color", "red", "neutral"), false);
});

// ---------- Extra regression assertions ----------

check("normalizeProduct keeps id and alt", function () {
  const p = popup.normalizeProduct({ id: 7, image: "i.jpg", alt: "Alt Name" });
  assert.strictEqual(p.id, 7);
  assert.strictEqual(p.alt, "Alt Name");
  assert.strictEqual(p.title, "Alt Name");
  assert.strictEqual(p.image, "i.jpg");
});

check("normalizeProduct title fallback beats empty alt", function () {
  const p = popup.normalizeProduct({ title: "", alt: "" });
  assert.strictEqual(p.title, "Product");
  assert.strictEqual(p.alt, "Product");
});

check("normalizeProduct keeps given retailer", function () {
  const p = popup.normalizeProduct({ retailer: "keep.me", url: "https://other.com/x" });
  assert.strictEqual(p.retailer, "keep.me");
});

check("normalizeProduct detects material colour via title", function () {
  const p = popup.normalizeProduct({ title: "Blue Cotton Shirt" });
  assert.strictEqual(p.color, "blue");
  assert.strictEqual(p.category, "unknown");
});

check("normalizeProduct is idempotent", function () {
  const once = popup.normalizeProduct({ title: "Red Dress", price: "Rs. 999", category: "dresses" });
  const twice = popup.normalizeProduct(once);
  assert.deepStrictEqual(twice, once);
});

check("productIntelligence never invents values", function () {
  const i = popup.productIntelligence({ title: "Abstract Object 123", category: "unknown" });
  assert.strictEqual(i.color, "");
  assert.strictEqual(i.style, "");
  assert.strictEqual(i.fit, "");
  assert.strictEqual(popup.detected(i.color), "Not detected");
  assert.strictEqual(popup.detected(i.style), "Not detected");
  assert.strictEqual(popup.detected(i.fit), "Not detected");
});

check("buildRecord fallback retailer from page url", function () {
  const r = popup.buildRecord({ title: "X", category: "upper_body" }, "");
  assert.strictEqual(r.title, "X");
  assert.strictEqual(r.result, "");
  assert.strictEqual(r.price, "");
  assert.ok(typeof r.retailer === "string");
});

check("buildRecord keeps retailer from record-shaped input", function () {
  const r = popup.buildRecord({
    title: "Y", image: "i.jpg", category: "dresses",
    price: "Rs. 500", retailer: "shop.com", productUrl: "https://shop.com/y"
  }, "https://res/z.png");
  assert.strictEqual(r.retailer, "shop.com");
  assert.strictEqual(r.productUrl, "https://shop.com/y");
  assert.strictEqual(r.result, "https://res/z.png");
});

check("getGarmentDescription material from title", function () {
  const d = popup.getGarmentDescription({ title: "Denim Jeans", alt: "", category: "lower_body" });
  assert.strictEqual(d, "denim jeans");
});

check("getGarmentDescription colour from normalized only", function () {
  const d = popup.getGarmentDescription({ title: "Plain Shirt", alt: "", category: "upper_body", color: "" });
  assert.strictEqual(d, "shirt");
});

check("tryOnCategory unknown maps to upper_body", function () {
  assert.strictEqual(popup.tryOnCategory("unknown"), "upper_body");
  assert.strictEqual(popup.tryOnCategory(undefined), "upper_body");
  assert.strictEqual(popup.tryOnCategory("footwear"), "upper_body");
});

check("formatCategory known categories", function () {
  assert.strictEqual(popup.formatCategory("lower_body"), "Lower body");
  assert.strictEqual(popup.formatCategory("dresses"), "Dresses");
  assert.strictEqual(popup.formatCategory(""), "Not detected");
});

check("findKeyword whole word matching", function () {
  assert.strictEqual(popup.findKeyword("harvest festival", ["vest"]), "");
  assert.strictEqual(popup.findKeyword("slim fit", ["slim"]), "slim");
  assert.strictEqual(popup.findKeyword("shirts", ["shirt"]), "shirt");
});

check("detected title-cases values", function () {
  assert.strictEqual(popup.detected("oversized"), "Oversized");
  assert.strictEqual(popup.detected("denim"), "Denim");
});

check("isTryOnSupported rejects unknown", function () {
  assert.strictEqual(popup.isTryOnSupported("unknown"), false);
  assert.strictEqual(popup.isTryOnSupported(""), false);
  assert.strictEqual(popup.isTryOnSupported(undefined), false);
});

check("productIntelligence category default", function () {
  const i = popup.productIntelligence({ title: "x", color: "", style: "", fit: "" });
  assert.strictEqual(i.category, "unknown");
});

check("normalizeProduct lowercases only for matching", function () {
  const p = popup.normalizeProduct({ title: "Green Party Dress" });
  assert.strictEqual(p.title, "Green Party Dress");
  assert.strictEqual(p.color, "green");
  assert.strictEqual(p.style, "party");
});

// ---------- SPEC 16: exact Myntra verification examples ----------

check("SPEC16 Style Quotient Women Formal Shirt", function () {
  const p = popup.normalizeProduct({
    id: 0,
    image: "https://cdn.example.com/1.jpg",
    alt: "Style QuotientWomen Formal ShirtSizes: XLRs. 674Rs. 1399(52% OFF)",
    title: "Style QuotientWomen Formal ShirtSizes: XLRs. 674Rs. 1399(52% OFF)",
    price: "Rs. 674",
    mrp: "Rs. 1399",
    discount: "52% OFF",
    category: "upper_body",
    productUrl: "https://myntra.com/style-quotient-shirt"
  });
  assert.strictEqual(p.title, "Style Quotient Women Formal Shirt");
  assert.strictEqual(p.price, "₹674");
  assert.strictEqual(p.mrp, "₹1,399");
  assert.strictEqual(p.discount, "52% OFF");
  assert.strictEqual(p.category, "upper_body");
  assert.strictEqual(p.style, "formal");
});

check("SPEC16 Route Women Cotton Shrug", function () {
  const p = popup.normalizeProduct({
    id: 1,
    image: "https://cdn.example.com/2.jpg",
    alt: "RouteWomen Cotton ShrugSizes: XLRs. 468Rs. 2499(81% OFF)",
    title: "RouteWomen Cotton ShrugSizes: XLRs. 468Rs. 2499(81% OFF)",
    price: "Rs. 468",
    mrp: "Rs. 2499",
    discount: "81% OFF",
    category: "upper_body",
    productUrl: "https://myntra.com/route-shrug"
  });
  assert.strictEqual(p.title, "Route Women Cotton Shrug");
  assert.strictEqual(p.price, "₹468");
  assert.strictEqual(p.mrp, "₹2,499");
  assert.strictEqual(p.discount, "81% OFF");
  assert.strictEqual(p.category, "upper_body");
});

// ---------- cleanProductTitle safety ----------

check("cleanProductTitle never splits real words", function () {
  ["Style", "Small", "Women", "Shirt", "Nike Air Zoom Pegasus 40",
   "H&M Loose Fit Hoodie", "Levi's 501 Original Fit Jeans"].forEach(function (t) {
    assert.strictEqual(popup.cleanProductTitle(t), t);
  });
});

check("cleanProductTitle removes size letters only as metadata", function () {
  // Single letters inside real names are untouched.
  assert.strictEqual(popup.cleanProductTitle("M S Dhoni Cricket Tee"), "M S Dhoni Cricket Tee");
  // Metadata pattern still cuts glued sizes.
  assert.strictEqual(
    popup.cleanProductTitle("RouteWomen Cotton ShrugSizes: XLRs. 468Rs. 2499(81% OFF)"),
    "Route Women Cotton Shrug"
  );
});

check("cleanProductTitle handles plain-colon titles", function () {
  assert.strictEqual(popup.cleanProductTitle("Top: Casual Wear"), "Top: Casual Wear");
});

// ---------- normalizePrice ----------

check("normalizePrice converts Rs/INR to rupee", function () {
  assert.strictEqual(popup.normalizePrice("Rs. 674"), "₹674");
  assert.strictEqual(popup.normalizePrice("Rs 674"), "₹674");
  assert.strictEqual(popup.normalizePrice("Rs.1,399"), "₹1,399");
  assert.strictEqual(popup.normalizePrice("INR 799"), "₹799");
  assert.strictEqual(popup.normalizePrice("₹ 674"), "₹674");
  assert.strictEqual(popup.normalizePrice("₹674"), "₹674");
});

check("normalizePrice leaves other currencies alone", function () {
  assert.strictEqual(popup.normalizePrice("$49.99"), "$49.99");
  assert.strictEqual(popup.normalizePrice(""), "");
  assert.strictEqual(popup.normalizePrice(undefined), "");
});

// ---------- sanitizeStoredRecord (old history/wardrobe) ----------

check("sanitizeStoredRecord cleans legacy polluted title", function () {
  const r = popup.sanitizeStoredRecord({
    key: "k1",
    title: "Style QuotientWomen Formal ShirtSizes: XLRs. 674Rs. 1399(52% OFF)",
    price: "Rs. 674",
    category: "upper_body",
    retailer: "myntra.com",
    productUrl: "https://myntra.com/1"
  });
  assert.strictEqual(r.title, "Style Quotient Women Formal Shirt");
  assert.strictEqual(r.price, "₹674");
  assert.strictEqual(r.key, "k1");
  assert.strictEqual(r.retailer, "myntra.com");
});

check("sanitizeStoredRecord keeps clean records identical", function () {
  const rec = { key: "k2", title: "Black Oversized T-Shirt", price: "₹799" };
  const r = popup.sanitizeStoredRecord(rec);
  assert.strictEqual(r.title, "Black Oversized T-Shirt");
  assert.strictEqual(r.price, "₹799");
  assert.notStrictEqual(r, rec); // copy, original untouched
});

check("sanitizeStoredRecord null-safe", function () {
  assert.strictEqual(popup.sanitizeStoredRecord(null), null);
  assert.strictEqual(popup.sanitizeStoredRecord(undefined), undefined);
});

// ---------- stale try-on status ----------

check("isTryOnStatus recognizes try-on messages only", function () {
  assert.strictEqual(popup.isTryOnStatus("Try-on failed"), true);
  assert.strictEqual(popup.isTryOnStatus("✓ Try-on completed successfully"), true);
  assert.strictEqual(popup.isTryOnStatus("Sending to AI try-on model..."), true);
  assert.strictEqual(popup.isTryOnStatus("5 products detected"), false);
  assert.strictEqual(popup.isTryOnStatus("History item removed."), false);
  assert.strictEqual(popup.isTryOnStatus("Profile photo saved."), false);
  assert.strictEqual(popup.isTryOnStatus(""), false);
});

// ---------- PART 12: colour and fit test cases ----------

// Each case is (raw product, expected category, color, style, fit).
const attributeCases = [
  [
    { title: "Women Blue Regular Fit Casual Shirt", category: "upper_body" },
    "upper_body", "blue", "casual", "regular"
  ],
  [
    { title: "Black Slim Fit Formal Shirt", category: "upper_body" },
    "upper_body", "black", "formal", "slim"
  ],
  [
    { title: "Navy Blue Oversized T-Shirt", category: "upper_body" },
    "upper_body", "navy blue", "", "oversized"
  ],
  [
    { title: "White Regular Fit Shirt", category: "upper_body" },
    "upper_body", "white", "", "regular"
  ],
  [
    { title: "Olive Green Relaxed Fit Cargo Pants", category: "lower_body" },
    "lower_body", "olive green", "", "relaxed"
  ],
  [
    { title: "Maroon Slim Fit Dress", category: "dresses" },
    "dresses", "maroon", "", "slim"
  ]
];

attributeCases.forEach(function (row, i) {

  const raw = row[0];

  check("PART12 case #" + (i + 1) + " " + raw.title, function () {

    const p = popup.normalizeProduct(raw);

    assert.strictEqual(p.category, row[1], "category");
    assert.strictEqual(p.color, row[2], "color");
    assert.strictEqual(p.style, row[3], "style");
    assert.strictEqual(p.fit, row[4], "fit");

  });

});

// ---------- Explicit metadata beats generic title words ----------

check("explicit Colour field wins over title word", function () {
  const p = popup.normalizeProduct({
    title: "Women Casual Shirt",
    alt: "Women Casual Shirt",
    meta: "Colour: Navy Blue Fit Type: Regular Fit"
  });
  assert.strictEqual(p.color, "navy blue");
  assert.strictEqual(p.fit, "regular");
});

check("generic white in metadata loses to explicit colour", function () {
  const p = popup.normalizeProduct({
    title: "Women Casual Shirt",
    alt: "",
    meta: "White background Colour: Maroon"
  });
  assert.strictEqual(p.color, "maroon");
});

check("colour phrases beat bare colour words", function () {
  assert.strictEqual(popup.detectColor({ meta: "", text: "olive green shirt" }), "olive green");
  assert.strictEqual(popup.detectColor({ meta: "", text: "sky blue dress" }), "sky blue");
  assert.strictEqual(popup.detectColor({ meta: "", text: "off-white tee" }), "off white");
  assert.strictEqual(popup.detectColor({ meta: "", text: "charcoal grey hoodie" }), "charcoal grey");
  assert.strictEqual(popup.detectColor({ meta: "", text: "midnight blue shirt" }), "midnight blue");
});

check("no colour invented when nothing matches", function () {
  assert.strictEqual(popup.detectColor({ meta: "", text: "cotton kurta" }), "");
  assert.strictEqual(popup.detectColor({ meta: "", text: "" }), "");
});

check("image colour is a last resort, never an override", function () {
  // Structured / textual evidence always wins over the pixel sample.
  const meta = popup.normalizeProduct({
    title: "Women Casual Shirt",
    meta: "Colour: Navy Blue",
    imageColor: "red"
  });
  assert.strictEqual(meta.color, "navy blue");
  assert.strictEqual(meta.colorSource, "metadata");

  // A colour word in the title also outranks the sample.
  const titled = popup.normalizeProduct({
    title: "Women Blue Casual Shirt",
    alt: "Women Blue Casual Shirt",
    imageColor: "red"
  });
  assert.strictEqual(titled.color, "blue");
  assert.strictEqual(titled.colorSource, "title");

  // With no colour word anywhere, the sample is the only evidence.
  const sampled = popup.normalizeProduct({
    title: "Women Casual Shirt",
    alt: "",
    imageColor: "red"
  });
  assert.strictEqual(sampled.color, "red");
  assert.strictEqual(sampled.colorSource, "image");
});

check("image fallback is never used for fit", function () {
  // A silhouette cannot be read from a photo, so fit stays undetected
  // even when an image colour is available.
  const p = popup.normalizeProduct({
    title: "Women Casual Shirt",
    alt: "",
    imageColor: "red"
  });
  assert.strictEqual(p.fit, "");
  assert.strictEqual(p.fitSource, "none");
});

check("fit is searched in product-card text, not only the title", function () {
  const p = popup.normalizeProduct({
    title: "Women Casual Shirt",
    alt: "",
    details: "data-fit: Baggy cotton"
  });
  assert.strictEqual(p.fit, "baggy");
  assert.strictEqual(p.fitSource, "card text");

  // The title alone would have given nothing.
  const bare = popup.normalizeProduct({
    title: "Women Casual Shirt",
    alt: ""
  });
  assert.strictEqual(bare.fit, "");
});

check("sources are reported for every attribute", function () {
  const p = popup.normalizeProduct({
    title: "Navy Blue Relaxed Fit Casual Shirt",
    category: "upper_body"
  });
  assert.strictEqual(p.color, "navy blue");
  assert.strictEqual(p.colorSource, "title");
  assert.strictEqual(p.fit, "relaxed");
  assert.strictEqual(p.fitSource, "title");
  assert.strictEqual(p.style, "casual");
  assert.strictEqual(p.styleSource, "title");

  const none = popup.normalizeProduct({ title: "Plain Thing" });
  assert.strictEqual(none.colorSource, "none");
  assert.strictEqual(none.fitSource, "none");
  assert.strictEqual(none.styleSource, "none");
});

// ---------- Fit phrases beat weak standalone words ----------

check("explicit fit phrase wins over brand phrase", function () {
  assert.strictEqual(
    popup.detectFit({ meta: "", text: "Slim-fit Denim Slim jeans Regular Fit" }),
    "regular"
  );
  assert.strictEqual(popup.detectFit({ meta: "", text: "Regular Fit Cotton Shirt" }), "regular");
  assert.strictEqual(popup.detectFit({ meta: "", text: "Tailored Fit Blazer" }), "tailored");
  assert.strictEqual(popup.detectFit({ meta: "", text: "Boxy fit overshirt" }), "boxy");
  assert.strictEqual(popup.detectFit({ meta: "", text: "Skin Fit Dress" }), "skin");
});

check("fit not detected without reliable evidence", function () {
  assert.strictEqual(popup.detectFit({ meta: "", text: "cotton kurta" }), "");
  assert.strictEqual(popup.detectFit({ meta: "", text: "" }), "");
});

check("fitValue normalizes variants", function () {
  assert.strictEqual(popup.fitValue("Slim Fit"), "slim");
  assert.strictEqual(popup.fitValue("slim-fit"), "slim");
  assert.strictEqual(popup.fitValue("Regular Fit"), "regular");
  assert.strictEqual(popup.fitValue("Oversize"), "oversize");
  assert.strictEqual(popup.fitValue("oversized"), "oversized");
  assert.strictEqual(popup.fitValue("Loose Fit"), "loose");
  assert.strictEqual(popup.fitValue(""), "");
});

check("displayAttribute normalizes names", function () {
  assert.strictEqual(popup.displayAttribute("navy blue"), "Navy Blue");
  assert.strictEqual(popup.displayAttribute("off-white"), "Off White");
  assert.strictEqual(popup.displayAttribute("black"), "Black");
  assert.strictEqual(popup.displayAttribute(""), "");
});

check("explicitField reads labelled values only", function () {
  assert.strictEqual(popup.explicitField("colour: navy blue", ["colou?r"]), "navy blue");
  assert.strictEqual(popup.explicitField("fit type - regular fit", ["fit type"]), "regular fit");
  assert.strictEqual(popup.explicitField("no fields here", ["colou?r"]), "");
});

// ---------- One normalized object feeds every consumer ----------

check("attributes shared by every consumer", function () {
  const p = popup.normalizeProduct({
    title: "Navy Blue Oversized T-Shirt",
    category: "upper_body",
    productUrl: "https://myntra.com/1"
  });

  const i = popup.productIntelligence(p);
  assert.strictEqual(i.color, p.color);
  assert.strictEqual(i.fit, p.fit);

  const r = popup.buildRecord(p, "https://r/x.png");
  assert.strictEqual(r.title, p.title);
  assert.strictEqual(r.price, p.price);
  assert.strictEqual(r.category, p.category);
});

check("legacy product shapes use the same detection", function () {
  const i = popup.productIntelligence({
    title: "Olive Green Relaxed Fit Cargo Pants",
    alt: "",
    category: "lower_body"
  });
  assert.strictEqual(i.color, "olive green");
  assert.strictEqual(i.fit, "relaxed");
});

check("garment description uses improved colour", function () {
  const d = popup.getGarmentDescription({
    title: "Navy Blue Oversized T-Shirt",
    alt: "",
    color: "navy blue",
    category: "upper_body",
    fit: "oversized"
  });
  assert.ok(d.indexOf("navy blue") === 0, "colour leads description: " + d);
});

check("title clean and price separate with new detection", function () {
  const p = popup.normalizeProduct({
    title: "Style QuotientWomen Formal ShirtSizes: XLRs. 674Rs. 1399(52% OFF)",
    alt: "Style QuotientWomen Formal ShirtSizes: XLRs. 674Rs. 1399(52% OFF)",
    price: "Rs. 674",
    category: "upper_body"
  });
  assert.strictEqual(p.title, "Style Quotient Women Formal Shirt");
  assert.strictEqual(p.price, "₹674");
  assert.strictEqual(p.fit, "");
});

check("detected() displays normalized attribute names", function () {
  assert.strictEqual(popup.detected("navy blue"), "Navy blue");
  assert.strictEqual(popup.detected("oversized"), "Oversized");
  assert.strictEqual(popup.detected(""), "Not detected");
});

// ---------- Real Myntra examples (issue report) ----------

// These three titles carry no colour, so the colour can only come
// from structured metadata / variant fields - which is exactly what
// the page scan now collects into "meta".
function fromPage(title, meta) {

  const p = popup.normalizeProduct({
    id: 0,
    image: "https://cdn.example.com/x.jpg",
    title: title,
    alt: title,
    price: "Rs. 1399",
    category: "upper_body",
    productUrl: "https://myntra.com/x",
    meta: meta
  });

  return {
    title: p.title,
    category: p.category,
    color: p.color,
    style: p.style,
    fit: p.fit,
    price: p.price
  };

}

check("Roadster Solid Regular Fit Shirt", function () {
  // Title-only evidence: no colour word exists, so colour stays
  // undetected rather than being invented.
  const bare = fromPage("Roadster Solid Regular Fit Shirt", "");
  assert.strictEqual(bare.color, "", "no colour in the title");
  assert.strictEqual(bare.style, "solid");
  assert.strictEqual(bare.fit, "regular");
  assert.strictEqual(bare.category, "upper_body");

  // Same product when the page exposes the colour.
  const withMeta = fromPage(
    "Roadster Solid Regular Fit Shirt",
    "Colour: Navy Blue | Pattern: Solid | Fit: Regular Fit"
  );
  assert.strictEqual(withMeta.color, "navy blue");
  assert.strictEqual(withMeta.style, "solid");
  assert.strictEqual(withMeta.fit, "regular");
});

check("Route Plus Size Cotton Shrug", function () {
  const bare = fromPage("Route Plus Size Cotton Shrug", "");
  assert.strictEqual(bare.color, "", "no colour in the title");
  assert.strictEqual(bare.fit, "", "'Plus Size' is not a fit");

  const withMeta = fromPage(
    "Route Plus Size Cotton Shrug",
    "Colour: Navy Blue"
  );
  assert.strictEqual(withMeta.color, "navy blue");
  assert.strictEqual(withMeta.category, "upper_body");
});

check("Style Quotient Women Shrug", function () {
  const bare = fromPage("Style Quotient Women Shrug", "");
  assert.strictEqual(bare.color, "");
  assert.strictEqual(bare.style, "");
  assert.strictEqual(bare.fit, "");

  const withMeta = fromPage(
    "Style Quotient Women Shrug",
    "Colour: Grey | Pattern: Floral | Fit: Relaxed Fit"
  );
  assert.strictEqual(withMeta.color, "grey");
  assert.strictEqual(withMeta.style, "floral");
  assert.strictEqual(withMeta.fit, "relaxed");
});

check("existing detections not broken by the new sources", function () {
  // Title-only cases from the earlier pass must be unchanged.
  const blue = popup.normalizeProduct({ title: "Women Blue Regular Fit Casual Shirt", category: "upper_body" });
  assert.strictEqual(blue.color, "blue");
  assert.strictEqual(blue.style, "casual");
  assert.strictEqual(blue.fit, "regular");

  const navy = popup.normalizeProduct({ title: "Navy Blue Oversized T-Shirt", category: "upper_body" });
  assert.strictEqual(navy.color, "navy blue");
  assert.strictEqual(navy.fit, "oversized");

  const olive = popup.normalizeProduct({ title: "Olive Green Relaxed Fit Cargo Pants", category: "lower_body" });
  assert.strictEqual(olive.color, "olive green");
  assert.strictEqual(olive.fit, "relaxed");

  const maroon = popup.normalizeProduct({ title: "Maroon Slim Fit Dress", category: "dresses" });
  assert.strictEqual(maroon.color, "maroon");
  assert.strictEqual(maroon.fit, "slim");
});

check("fit is never guessed from the image", function () {
  const p = popup.normalizeProduct({
    title: "Women Casual Shirt",
    image: "data:image/png;base64,AAAA",
    category: "upper_body"
  });
  assert.strictEqual(p.fit, "");
  assert.strictEqual(p.color, "");
});

check("style descriptors are recognised", function () {
  ["floral", "checked", "checkered", "graphic", "textured",
   "embroidered", "embellished", "lace", "ribbed", "knitted",
   "ethnic", "sporty", "western", "basic", "minimal"]
    .forEach(function (word) {
      const p = popup.normalizeProduct({
        title: "Women " + word + " Top",
        category: "upper_body"
      });
      assert.strictEqual(p.style, word, "style " + word);
    });
});

check("style field beats a title style word", function () {
  const p = popup.normalizeProduct({
    title: "Women Casual Printed Shirt",
    category: "upper_body",
    meta: "Pattern: Floral"
  });
  assert.strictEqual(p.style, "floral");
});

// ---------- Brand / title / price split (screenshot case) ----------

check("Style Quotient screenshot case normalizes into separate fields", function () {
  // Exactly what the page scan produces for that card.
  const p = popup.normalizeProduct({
    id: 0,
    image: "https://cdn.example.com/x.jpg",
    title: "Style QuotientWomen Short sleeves shrug",
    alt: "Style QuotientWomen Short sleeves shrug",
    brand: "Style Quotient",
    price: "Rs. 627",
    mrp: "Rs. 1199",
    discount: "48% off",
    category: "upper_body",
    meta: "Colour: White"
  });

  assert.strictEqual(p.brand, "Style Quotient");

  // No brand, no sizes, no prices left in the title.
  assert.strictEqual(p.title, "Women Short sleeves shrug");
  assert.ok(p.title.toLowerCase().indexOf("style quotient") === -1,
    "brand must not remain in the title");
  assert.ok(!/rs\.?|₹|\d+\s*%/i.test(p.title),
    "title must not contain prices or discounts");

  assert.strictEqual(p.price, "₹627");
  assert.strictEqual(p.originalPrice, "₹1,199");
  assert.strictEqual(p.discount, "48% OFF");
  assert.strictEqual(p.color, "white");
  assert.strictEqual(p.category, "upper_body");
});

check("brand is not invented and is rejected when it is a product name", function () {
  assert.strictEqual(popup.normalizeProduct({ title: "Women Shirt" }).brand, "");

  // A "brand" containing a garment noun is really the title.
  const bad = popup.normalizeProduct({
    title: "Women Shirt",
    brand: "Women Casual Shirt"
  });
  assert.strictEqual(bad.brand, "");
  assert.strictEqual(bad.title, "Women Shirt");
});

check("price grouping is idempotent", function () {
  assert.strictEqual(popup.normalizePrice("Rs. 1199"), "₹1,199");
  assert.strictEqual(popup.normalizePrice("₹1,199"), "₹1,199");
  assert.strictEqual(popup.normalizePrice("Rs. 999"), "₹999");
  assert.strictEqual(popup.normalizePrice("Rs. 1234567"), "₹12,34,567");
  assert.strictEqual(popup.normalizePrice(""), "");
});

check("originalPrice mirrors mrp for existing consumers", function () {
  const p = popup.normalizeProduct({ title: "X", price: "Rs. 627", mrp: "Rs. 1199" });
  assert.strictEqual(p.originalPrice, "₹1,199");
  assert.strictEqual(p.mrp, p.originalPrice);
});

check("regression: Route, Style Quotient and Roadster still detect", function () {
  const route = popup.normalizeProduct({
    title: "Route Women Cotton Shrug",
    brand: "Route",
    meta: "Colour: Navy Blue"
  });
  assert.strictEqual(route.color, "navy blue");
  assert.strictEqual(route.title, "Women Cotton Shrug");
  assert.strictEqual(route.brand, "Route");

  const sq = popup.normalizeProduct({
    title: "Style Quotient Women Shrug",
    brand: "Style Quotient",
    meta: "Colour: Grey"
  });
  assert.strictEqual(sq.color, "grey");

  const roadster = popup.normalizeProduct({
    title: "Roadster Solid Regular Fit Shirt",
    brand: "Roadster"
  });
  assert.strictEqual(roadster.fit, "regular");
  assert.strictEqual(roadster.style, "solid");
  assert.strictEqual(roadster.title, "Solid Regular Fit Shirt");
});

check("white garment detected from the image when text has no colour", function () {
  const p = popup.normalizeProduct({
    title: "Style Quotient Women Short sleeves shrug",
    brand: "Style Quotient",
    alt: "",
    imageColor: "white"
  });
  assert.strictEqual(p.color, "white");
  assert.strictEqual(p.colorSource, "image");
  // Fit and style are still not invented.
  assert.strictEqual(p.fit, "");
  assert.strictEqual(p.style, "");
});

if (failures > 0) process.exit(1);

check("product title never carries price, size or discount text", function () {
  // A polluted card title must be cleaned down to the product name.
  const polluted = popup.normalizeProduct({
    brand: "Style Quotient",
    title: "Style QuotientWomen Short sleeves shrugSizes: XLRs. 674Rs. 1399(48% OFF)",
    alt: "Style QuotientWomen Short sleeves shrugSizes: XLRs. 674Rs. 1399(48% OFF)"
  });

  assert.strictEqual(polluted.brand, "Style Quotient");
  assert.ok(!/rs\.?|₹|sizes|%/i.test(polluted.title),
    "title still contains metadata: " + polluted.title);
  assert.strictEqual(polluted.title, "Women Short sleeves shrug");
});

console.log("\n" + (checks - failures) + "/" + checks + " checks passed.");

