// ============================================================
// AI VIRTUAL TRY-ON - PAGE PRODUCT DETECTION
//
// Deterministic DOM scan, triggered by the popup.
// No external APIs and no site-specific rules.
// ============================================================

// An image must be at least this large to count as a product image.
const MIN_IMAGE_SIZE = 150;

// Never return more than this many products.
const MAX_PRODUCTS = 20;

// Words that mean "decoration", not a product.
const NON_PRODUCT_WORDS = [
  "sprite", "logo", "icon", "placeholder", "spacer", "blank", "pixel",
  "loading", "spinner", "avatar", "banner", "payment", "badge", "swatch"
];

// Words that mean "action / control", not a product. Only words that
// never appear inside a real product name are listed here, so a title
// such as "Nike Air Zoom Pegasus" is not filtered out. Generic labels
// (Zoom, Close, Menu, View, Next) are handled by ACTION_TEXT_PATTERN,
// which only matches when the whole text is that label.
const ACTION_WORDS = [
  "compare", "wishlist", "share", "quick view", "view similar",
  "similar products", "notify me", "size chart"
];

// An action/control whose whole text is an action label.
const ACTION_TEXT_PATTERN =
  /^(compare|add to compare|wishlist|add to wishlist|share|zoom|zoom in|view|view similar|view more|quick view|similar products|close|menu|next|prev|previous|swipe)$/i;

// A container that only holds an icon or a control.
const ICON_CONTAINER_SELECTOR =
  "[class*='icon'], [class*='Icon'], [class*='compare'], " +
  "[class*='wishlist'], [class*='sprite'], [class*='action'], " +
  "[class*='control']";

// alt values that carry no product information.
const GENERIC_TITLE_PATTERN =
  /^(product|product image|image|img|photo|picture|thumbnail|untitled|no image|default|shop now|buy now)$/i;

// A price is a currency marker next to a number.
const PRICE_PATTERN =
  /(?:₹|\$|€|£|¥|rs\.?|inr|usd|eur|gbp|aed)\s?\d[\d.,]*|\b\d[\d.,]*\s?(?:₹|rs\.?|inr|usd|eur|gbp|aed)\b/i;

// ============================================================
// CATEGORY KEYWORDS
//
// Rules are checked top to bottom and the first match wins, so
// the more specific categories come first. Words are written in
// singular form - a plural "s" / "es" is allowed automatically.
// ============================================================

// ============================================================
// CATEGORY KEYWORDS
//
// Rules are checked top to bottom and the first match wins. Words
// are written in singular form - a plural "s" / "es" is allowed
// automatically.
//
// Order matters: garment categories are checked before accessories,
// so titles such as "Tie Dye Shirt" or "Cap Sleeve Top" stay
// garments while "Leather Bag" and "Baseball Cap" stay accessories.
// ============================================================

const CATEGORY_RULES = [
  {
    category: "dresses",
    words: [
      "dress", "gown", "saree", "sari", "jumpsuit", "kaftan", "frock",
      "romper"
    ]
  },
  {
    category: "lower_body",
    words: [
      "jeans", "trouser", "pant", "chino", "shorts", "skirt",
      "legging", "jogger", "palazzo", "cargo", "sweatpants"
    ]
  },
  {
    category: "footwear",
    words: [
      "shoe", "sneaker", "sandal", "slipper", "heel", "boot",
      "loafer", "footwear", "flip flop", "flip-flop", "flats"
    ]
  },
  {
    category: "upper_body",
    words: [
      "shirt", "t-shirt", "tshirt", "tee", "top", "blouse", "kurta",
      "kurti", "sweater", "sweatshirt", "hoodie", "jacket", "coat",
      "blazer", "vest", "cardigan", "polo", "tunic", "pullover",
      "bra", "sports bra", "bralette", "camisole", "crop top",
      "sports top", "tank top", "shrug", "bolero", "cape"
    ]
  },
  {
    category: "accessories",
    words: [
      "bag", "handbag", "backpack", "wallet", "watch", "belt", "cap",
      "hat", "scarf", "sunglass", "eyewear", "jewellery", "jewelry",
      "necklace", "earring", "ring", "bracelet", "glove", "purse",
      "tie"
    ]
  }
];

// One pre-compiled pattern per rule.
const CATEGORY_PATTERNS = CATEGORY_RULES.map(
  function (rule) {
    return {
      category: rule.category,
      pattern: new RegExp(
        "\\b(?:" + rule.words.join("|") + ")(?:es|s)?\\b",
        "i"
      )
    };
  }
);

// ============================================================
// IMAGE HELPERS
// ============================================================

// currentSrc -> src -> data-src -> data-original.
// Returns an absolute URL, or "" when nothing usable is found.
function resolveImageUrl(img) {

  const candidates = [
    img.currentSrc,
    img.getAttribute("src"),
    img.getAttribute("data-src"),
    img.getAttribute("data-original")
  ];

  // Pages often serve several sizes through srcset. When the image
  // that loaded is small, try the largest candidate instead.
  if (img.naturalWidth && img.naturalWidth < 500) {

    const larger = largestFromSrcset(img);

    if (larger) candidates.unshift(larger);

  }

  for (let i = 0; i < candidates.length; i++) {

    const raw = (candidates[i] || "").trim();

    if (!raw) continue;

    // Inline images are only useful when they are real photos,
    // not a 1x1 loading placeholder.
    if (raw.indexOf("data:") === 0) {

      if (raw.indexOf("data:image") === 0 && raw.length > 1000) {
        return raw;
      }

      continue;
    }

    try {
      return new URL(raw, document.baseURI).href;
    } catch (error) {
      // Not parsable, try the next candidate.
    }
  }

  return "";
}

// Natural size once loaded, rendered size otherwise. The rendered
// size is also used to score which image is the main product image.
function imageSize(img) {

  const box = img.getBoundingClientRect();

  const renderedWidth = Math.round(box.width) || img.width || 0;
  const renderedHeight = Math.round(box.height) || img.height || 0;

  const width = img.naturalWidth || renderedWidth;
  const height = img.naturalHeight || renderedHeight;

  return {
    width: width,
    height: height,
    renderedWidth: renderedWidth,
    renderedHeight: renderedHeight
  };
}

// Largest candidate offered by a srcset attribute.
function largestFromSrcset(img) {

  const srcset = img.getAttribute("srcset");

  if (!srcset) return "";

  const parts = srcset.split(",");

  let bestUrl = "";
  let bestWidth = 0;

  for (let i = 0; i < parts.length; i++) {

    const bits = parts[i].trim().split(/\s+/);

    const width = parseInt(bits[1], 10) || 0;

    if (bits[0] && width > bestWidth) {

      bestWidth = width;
      bestUrl = bits[0];

    }
  }

  return bestUrl;

}

// Deterministic score used to choose the best try-on image for a
// product. Larger and clearer images score higher; thumbnails and
// unusual crops score lower. No image analysis is involved.
function imageScore(img, imageUrl, size) {

  const url = imageUrl.toLowerCase();

  let score = 0;

  // Bigger natural image means better detail for the model.
  score += Math.min(size.width * size.height / 100000, 24);

  // The main product image is usually displayed larger than a thumbnail.
  score += Math.min(
    size.renderedWidth * size.renderedHeight / 40000,
    12
  );

  // A useful resolution helps the model.
  score += Math.min(Math.min(size.width, size.height) / 100, 12);

  if (/(thumb|small|swatch|mini|_ss\d+_)/.test(url)) score -= 14;

  if (/(large|main|zoom|original|_sl\d+_|_ul\d+_)/.test(url)) score += 8;

  // Extremely wide or tall images are usually banners or crops.
  const ratio = size.width / Math.max(size.height, 1);

  if (ratio > 2.2 || ratio < 0.45) score -= 12;

  return score;

}

// Images of the same product are grouped with this key.
function groupKey(productUrl, title, imageUrl) {

  if (productUrl) {

    return productUrl.split("?")[0].split("#")[0];

  }

  if (title && title !== "Product") {

    return title.toLowerCase();

  }

  return "img:" + imageUrl;

}

// Nearest product-like ancestor, used for title / price lookups.
function findContainer(img) {

  return img.closest(
    "article, li, [class*='product'], [class*='Product'], " +
    "[class*='card'], [class*='Card'], [class*='item'], [class*='Item']"
  ) || img.parentElement;
}

function tidy(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

// Whole-word match, so "compare" is found in "compare-icon.png"
// while "close" is not found in "closet".
function containsWord(value, words) {

  const text = (value || "").toLowerCase();

  if (!text) return false;

  for (let i = 0; i < words.length; i++) {

    const pattern = new RegExp(
      "(?:^|[^a-z0-9])" + words[i] + "(?:[^a-z0-9]|$)",
      "i"
    );

    if (pattern.test(text)) return true;
  }

  return false;
}

// Logos, icons, placeholders and UI graphics.
function isDecoration(img, imageUrl, alt) {

  if (containsWord(imageUrl, NON_PRODUCT_WORDS)) return true;

  if (containsWord(alt, NON_PRODUCT_WORDS)) return true;

  if (containsWord(imageUrl, ACTION_WORDS)) return true;

  if (containsWord(alt, ACTION_WORDS)) return true;

  if (containsWord(img.getAttribute("title"), ACTION_WORDS)) return true;

  // Icons are almost always SVG.
  if (/\.svg(\?|$)/i.test(imageUrl)) return true;

  // The image sits inside an icon / control wrapper.
  if (img.closest(ICON_CONTAINER_SELECTOR)) return true;

  return false;
}

// Images that belong to a control such as Compare or Wishlist
// instead of to a product.
function isActionControl(img, container) {

  const link = img.closest("a");

  if (link) {

    if (ACTION_TEXT_PATTERN.test(tidy(link.textContent))) return true;

    if (
      ACTION_TEXT_PATTERN.test(
        tidy(link.getAttribute("aria-label"))
      )
    ) {
      return true;
    }
  }


  const control = img.closest("button, [role='button']");

  if (control) {

    const label = tidy(
      control.getAttribute("aria-label") ||
      control.getAttribute("title") ||
      control.textContent
    );

    if (label.length <= 40 && ACTION_TEXT_PATTERN.test(label)) {
      return true;
    }

    if (
      containsWord(
        String(control.className),
        ACTION_WORDS
      )
    ) {
      return true;
    }
  }


  // A card whose entire text is only an action label.
  const text = container ? tidy(container.textContent) : "";

  if (text.length <= 40 && ACTION_TEXT_PATTERN.test(text)) return true;

  return false;
}

// ============================================================
// TITLE
//
// Priority:
//   1. product name element inside the card
//   2. heading inside the card
//   3. anchor / title text
//   4. image alt text
//   5. image file name (only when it reads like real words)
//
// Anything that looks like a hash, UUID or raw file name is
// rejected, and "Product" is used when nothing usable is found.
// ============================================================

// Elements that usually hold the real product name.
const NAME_SELECTOR =
  "[itemprop='name'], [class*='productName'], [class*='product-name'], " +
  "[class*='productTitle'], [class*='product-title'], [class*='itemName'], " +
  "[class*='item-name'], [class*='itemTitle'], [class*='item-title'], " +
  "[data-testid*='title']";

// Shop metadata (sizes, prices, discounts) that retailers append to
// the product name inside the card. The title is cut at the first
// occurrence so only the real product name is kept; the price is
// extracted separately from the card text.
const TITLE_METADATA_PATTERN =
  /(?:sizes?\s*:|mrp\b|price\s*:|\b(?:rs\.?|inr|usd|eur|gbp)\s*\d|[₹$€£]\s*\d|\d+(?:\.\d+)?\s*%\s*off\b|\(\s*\d+(?:\.\d+)?\s*%\s*off\s*\))/i;

function cleanTitle(raw) {

  if (!raw) return "";

  let text = tidy(raw);

  // Cut at the first metadata marker.
  const cutoff = text.search(TITLE_METADATA_PATTERN);

  if (cutoff > 0) {
    text = text.slice(0, cutoff);
  }

  // Residual metadata when a marker was glued to the name, e.g.
  // "ShrugSizes: XLRs. 468Rs. 2499(81% OFF)".
  text = text.replace(/\b(?:sizes?|size)\s*:\s*[A-Za-z0-9,\s\/-]+/gi, "");
  text = text.replace(/(?:(?:rs\.?|inr|usd|eur|gbp|[₹$€£])\s*[\d.,]+)+/gi, "");
  text = text.replace(/\(\s*\d+(?:\.\d+)?\s*%\s*off\s*\)/gi, "");
  text = text.replace(/\b\d+(?:\.\d+)?\s*%\s*off\b/gi, "");

  // Retailers often glue the brand to the product name, for example
  // "RouteWomen" or "QuotientWomen". Split at the boundary between a
  // lowercase (or digit) and an uppercase letter so the words read
  // naturally. Whole words are never split.
  text = text.replace(/([a-z0-9])([A-Z])/g, "$1 $2");

  return text.replace(/[\s\-_,:;|·•]+$/, "").trim();
}

function extractTitle(img, container) {

  const heading = container
    ? container.querySelector("h1, h2, h3, h4, h5, h6")
    : null;

  const nameElement = container
    ? container.querySelector(NAME_SELECTOR)
    : null;

  const link = img.closest("a");

  const candidates = [
    nameElement ? nameElement.textContent : "",
    heading ? heading.textContent : "",
    link ? (link.textContent || link.getAttribute("title")) : "",
    link ? link.getAttribute("aria-label") : "",
    img.getAttribute("alt"),
    img.getAttribute("title"),
    fileName(img)
  ];

  for (let i = 0; i < candidates.length; i++) {

    const value = cleanTitle(candidates[i]);

    if (!isUsableTitle(value)) continue;

    // A candidate that still carries pricing / size metadata, or is a
    // huge surrounding text block, is not a product name: fall back
    // to a cleaner source instead.
    if (TITLE_METADATA_PATTERN.test(value)) continue;

    if (value.length > 120) continue;

    return value.slice(0, 200);
  }

  return "Product";
}

function isUsableTitle(value) {

  if (!value || value.length < 3) return false;

  if (GENERIC_TITLE_PATTERN.test(value)) return false;

  if (looksTechnical(value)) return false;

  return true;
}

// Hashes, UUIDs and raw file names are not product titles.
function looksTechnical(value) {

  const text = value.trim();

  if (/\.(jpe?g|png|webp|avif|gif|bmp|svg)$/i.test(text)) return true;

  // UUID style chunks, e.g. "97443721 d8ea 474b 8e2a".
  if (/[0-9a-f]{8}[-\s][0-9a-f]{4}[-\s][0-9a-f]{4}[-\s][0-9a-f]{4}/i.test(text)) return true;

  if (/^[0-9a-f]{8}[-\s][0-9a-f]{4}/i.test(text)) return true;

  const joined = text.replace(/[\s-]+/g, "");

  if (/^[0-9a-f]{16,}$/i.test(joined)) return true;

  if (/^[0-9]+$/.test(joined)) return true;

  // One very long word with no spaces.
  if (text.indexOf(" ") === -1 && text.length > 24) return true;

  // CamelCase concatenation, e.g. "StyleQuotientWomenWhite".
  if (
    text.indexOf(" ") === -1 &&
    text.length >= 16 &&
    /[a-z]/.test(text) &&
    text.replace(/[^A-Z]/g, "").length >= 3
  ) {
    return true;
  }

  return false;
}

function fileName(img) {

  const url = img.currentSrc || img.getAttribute("src") || "";

  const last = url.split("?")[0].split("/").pop() || "";

  return last.replace(/\.[a-z0-9]+$/i, "").replace(/[-_+]+/g, " ");
}

// ============================================================
// PRICE
//
// The price is read from the card's own visible text, completely
// independently of the title. The image is often wrapped in a
// container that holds only the image, while the price lives in a
// sibling subtree, so the card root is resolved first and the
// closest product anchor is used as a fallback.
// ============================================================

// Walks up from the image to the smallest ancestor that still
// belongs to a single product (an image container is skipped).
function findPriceRoot(img, container) {

  if (!container) return img.closest("a");

  return container;
}

function priceText(node) {

  if (!node) return "";

  return tidy(
    node.innerText || node.textContent || ""
  );
}

// ============================================================
// BRAND
//
// Retail cards show the brand and the product name as two separate
// pieces of text. The brand is kept in its own field and removed from
// the title, so the card can render "Style Quotient" above
// "Women Short sleeves shrug" instead of one run-on line.
// ============================================================

const BRAND_SELECTOR = [
  "[class*='product-brand']",
  "[class*='productBrand']",
  "[class*='p-brand']",
  "[class*='brand-name']",
  "h3",
  "[itemprop='brand']"
].join(", ");

// Brand for one card. The embedded state is authoritative; the card's
// own brand element is the fallback. Both are read from inside the
// product container, so a neighbouring brand can never be used.
function extractBrand(container, url) {

  const fromState = stateBrand(url);

  if (fromState) return fromState;

  if (!container) return "";

  const node = safeQuery(container, BRAND_SELECTOR);

  if (!node) return "";

  return cleanBrandValue(node.textContent, container);

}

function safeQuery(
  root,
  selector
) {

  try {

    return root.querySelector(selector);

  }

  catch (error) {

    return null;

  }

}

// A brand element holds only the brand, but a heading may be the
// product name instead, in which case a name-shaped value is rejected.
function cleanBrandValue(
  value,
  container
) {

  const text = tidy(value);

  if (!text || text.length > 40) return "";

  if (looksTechnical(text)) return "";

  if (GENERIC_TITLE_PATTERN.test(text)) return "";

  // Reject anything that is really the product name: it must not
  // contain a garment noun.
  const hasGarment = /shirt|top|dress|jeans|pants|skirt|saree|suit|shrug|tshirt|t-shirt|kurti|co-?ord/i
    .test(text);

  if (hasGarment) return "";

  return text;

}

// Brand from the embedded product record, looked up by product id.
function stateBrand(url) {

  const index = readEmbeddedState();

  const idMatch = /\/product\/(\d+)/.exec(url || "");

  if (!idMatch) return "";

  const record = index.rawById[idMatch[1]];

  return record ? tidy(record.brand || "") : "";

}

function extractPrice(container) {

  if (!container) return "";

  const text = priceText(container);

  if (!text) return "";

  // The first match is the selling price; the MRP usually follows
  // it. Covers ₹, Rs., INR, $ and the other symbols already
  // accepted by PRICE_PATTERN.
  const match = text.match(PRICE_PATTERN);

  return match ? tidy(match[0]) : "";
}

// The MRP is the second price shown next to the selling price.
// Returns "" when the card shows only one price.
function extractMrp(container) {

  if (!container) return "";

  const text = tidy(
    container.innerText || container.textContent || ""
  );

  if (!text) return "";

  const pattern = new RegExp(PRICE_PATTERN.source, "gi");
  const matches = text.match(pattern) || [];

  if (matches.length < 2) return "";

  const first = tidy(matches[0]);
  const second = tidy(matches[1]);

  return second.toLowerCase() === first.toLowerCase() ? "" : second;
}

// Walks a parsed JSON-LD value and collects every Product node,
// including nodes nested in arrays or under "@graph".
function collectProductNodes(
  node,
  found
) {

  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {

    node.forEach(function (item) {

      collectProductNodes(
        item,
        found
      );

    });

    return;

  }


  const type = node["@type"];

  if (
    type === "Product" ||
    (
      Array.isArray(type) &&
      type.indexOf("Product") !== -1
    )
  ) {

    found.push(node);

  }


  if (node["@graph"]) {

    collectProductNodes(
      node["@graph"],
      found
    );

  }

  if (node.mainEntity) {

    collectProductNodes(
      node.mainEntity,
      found
    );

  }

  if (node.itemListElement) {

    collectProductNodes(
      node.itemListElement,
      found
    );

  }

}

// Turns one JSON-LD Product node into labelled attribute fields.
function productNodeFields(
  node
) {

  const out = [];

  const add = function (label, value) {

    if (typeof value !== "string") return;

    const clean =
      tidy(value);

    if (clean) out.push(label + ": " + clean);

  };


  add("Colour", node.color);
  add("Pattern", node.pattern);
  add("Style", node.style);
  add("Material", node.material);
  add("Fit", node.fit || node.silhouette || node.size);
  add("Category", node.category);


  if (Array.isArray(node.color)) {

    add("Colour", node.color.join(" "));

  }


  if (Array.isArray(node.material)) {

    add("Material", node.material.join(" "));

  }


  return out.join(" | ");

}

// Structured product metadata (schema.org JSON-LD).
//
// This is product-specific evidence and is preferred over any free
// text. It is read inside the product container first; a page level
// fallback is only used when the page describes exactly one product,
// so a neighbouring product's colour can never leak in.
function extractStructured(root) {

  const parts = [];

  const scripts = document.querySelectorAll(
    'script[type="application/ld+json"]'
  );

  const pageNodes = [];

  for (
    let i = 0;
    i < scripts.length;
    i++
  ) {

    const script =
      root && root.querySelector
        ? root.querySelector(
            'script[type="application/ld+json"]'
          )
        : null;

    if (root && !script) continue;

    const source =
      root && script ? script : scripts[i];

    let parsed = null;

    try {

      parsed =
        JSON.parse(
          source.textContent || "null"
        );

    }

    catch (error) {

      continue;

    }


    const found = [];

    collectProductNodes(
      parsed,
      found
    );

    if (!found.length) continue;

    // A node inside this product's own container is product
    // specific and safe to use.
    if (root && source !== scripts[i]) {

      parts.push(
        productNodeFields(
          found[0]
        )
      );

    }

    pageNodes.push.apply(
      pageNodes,
      found
    );

  }


  if (!parts.length) {

    // Only trust page level JSON-LD when it describes this one
    // product, never a grid of many.
    if (pageNodes.length === 1) {

      parts.push(
        productNodeFields(
          pageNodes[0]
        )
      );

    }

  }


  return parts
    .filter(function (part) {

      return part;

    })
    .join(" | ")
    .slice(0, 300);

}

// All text that belongs to THIS product, gathered from inside the
// product container only: card text, aria-labels, title attributes
// and data-* attributes. Nothing outside the container is read, so
// navigation, footers, recommendations and neighbouring products can
// never contribute.
function extractCardText(container) {

  if (!container) return "";

  const found = [];

  const text =
    priceText(container);

  if (text) found.push(text);


  // Data attributes carry the real variant values on many shops.
  const attributes = [
    "data-color", "data-colour", "data-fit", "data-pattern",
    "data-style", "data-silhouette", "data-brand", "data-size",
    "data-variant", "data-name", "data-title", "data-description",
    "data-category"
  ];

  for (
    let a = 0;
    a < attributes.length;
    a++
  ) {

    let value = "";

    try {

      value =
        container.getAttribute(attributes[a]) || "";

    }

    catch (error) {

      value = "";

    }


    if (value && value.length <= 60) {

      found.push(attributes[a] + ": " + value);

    }

  }


  // aria-label / title on this product's own link and image.
  const labelled = [
    "a[aria-label]",
    "a[title]",
    "h1[aria-label]",
    "h2[aria-label]",
    "h3[aria-label]",
    "h4[aria-label]",
    "h5[aria-label]",
    "h6[aria-label]",
    "[role='link'][aria-label]",
    "[class*='desc'][aria-label]",
    "[class*='title'][aria-label]"
  ];

  for (
    let s = 0;
    s < labelled.length;
    s++
  ) {

    let nodes = [];

    try {

      nodes =
        container.querySelectorAll(labelled[s]);

    }

    catch (error) {

      nodes = [];

    }


    for (
      let i = 0;
      i < nodes.length && i < 6;
      i++
    ) {

      const value =
        tidy(
          nodes[i].getAttribute("aria-label") ||
          nodes[i].getAttribute("title")
        );

      if (value && value.length <= 60) found.push(value);

    }

  }


  return found
    .join(" ")
    .slice(0, 600);

}

// Product variant / colour fields on the card, for example a colour
// swatch or a "data-color" attribute. Scoped to the product
// container, so surrounding page text is never used.
function extractVariants(container) {

  if (!container || !container.querySelectorAll) return "";

  const selectors = [
    "[data-color]",
    "[data-colour]",
    "[data-color-name]",
    "[class*='colorName']",
    "[class*='colourName']",
    "[class*='color-name']"
  ];

  const found = [];

  for (
    let s = 0;
    s < selectors.length;
    s++
  ) {

    let nodes = [];

    try {

      nodes =
        container.querySelectorAll(
          selectors[s]
        );

    }

    catch (error) {

      nodes = [];

    }


    for (
      let i = 0;
      i < nodes.length;
      i++
    ) {

      const value =
        tidy(
          nodes[i].getAttribute("data-color") ||
          nodes[i].getAttribute("data-colour") ||
          nodes[i].getAttribute("data-color-name") ||
          nodes[i].getAttribute("title") ||
          nodes[i].textContent
        );

      if (!value || value.length > 40) continue;

      found.push("Colour: " + value);

    }

  }


  return found
    .join(" | ")
    .slice(0, 200);

}

// Card metadata (for example "Colour: Navy Blue  Fit: Regular").
//
// Only the labelled attribute fields are kept - sizes, prices and
// discounts are dropped - so this text can be used for attribute
// detection without ever leaking into the displayed title.
function extractMeta(container) {

  if (!container) return "";

  const text =
    priceText(container);

  if (!text) return "";


  const found = [];

  // The value stops at a separator, at the next labelled field, or
  // at a price / discount marker, so "Colour: Navy Blue Rs. 1399
  // 52% OFF" yields only the colour and never leaks price text into
  // the attribute evidence.
  const pattern =
    /\b(?:colou?r|color|shade|pattern|print|design|style|fit(?:\s*type)?|silhouette|cut|weave|finish)\s*[:\-]\s*[^,;|\n]{1,40}?(?=\s+(?:rs\.?|inr|₹|\$|€|£|¥)\s*[\d.,]|\s*\d+\s*%|\s+\b(?:colou?r|color|shade|pattern|print|design|style|fit|silhouette|cut|weave|finish)\b|[,;|\n]|$)/gi;

  let match = pattern.exec(text);

  while (match) {

    found.push(
      tidy(match[0])
    );

    match = pattern.exec(text);

  }


  return found
    .join(" ")
    .slice(0, 200);

}

// Discount as displayed on the card, e.g. "52% OFF".
function extractDiscount(container) {

  if (!container) return "";

  const text = tidy(
    container.innerText || container.textContent || ""
  );

  if (!text) return "";

  const match = text.match(/\d+(?:\.\d+)?\s*%\s*off/i);

  return match ? tidy(match[0]).toUpperCase() : "";
}

// ============================================================
// PRODUCT LINK
// ============================================================

function extractProductUrl(img) {

  const link = img.closest("a[href]");

  if (!link) return "";

  try {
    return new URL(link.getAttribute("href"), document.baseURI).href;
  } catch (error) {
    return "";
  }
}

// ============================================================
// CATEGORY
// ============================================================

function classifyCategory(text) {

  const value = (text || "").toLowerCase();

  for (let i = 0; i < CATEGORY_PATTERNS.length; i++) {

    if (CATEGORY_PATTERNS[i].pattern.test(value)) {
      return CATEGORY_PATTERNS[i].category;
    }
  }

  return "unknown";
}

// ============================================================
// MAIN SCAN
// ============================================================

function getProductImages() {

  const images = Array.from(document.images);

  const products = [];
  const seen = new Set();
  const bestScore = {};
  const indexByKey = {};

  for (let i = 0; i < images.length; i++) {

    if (products.length >= MAX_PRODUCTS) break;

    const img = images[i];

    const imageUrl = resolveImageUrl(img);

    if (!imageUrl) continue;

    // Duplicate image URLs are skipped.
    if (seen.has(imageUrl)) continue;

    const alt = tidy(img.getAttribute("alt"));

    // Obvious logos, icons, placeholders and UI graphics.
    if (isDecoration(img, imageUrl, alt)) continue;

    const size = imageSize(img);

    if (size.width < MIN_IMAGE_SIZE || size.height < MIN_IMAGE_SIZE) continue;

    const container = findContainer(img);

    // Compare / wishlist / view controls are not products.
    if (isActionControl(img, container)) continue;

    const title = extractTitle(img, container);

    // Price / MRP / discount are read from the product card text
    // (never from the title). The image wrapper often contains only
    // the image, so the card root and the product anchor are both
    // used as sources.
    const priceRoot =
      findPriceRoot(img, container) ||
      container;

    const anchor = img.closest("a");

    const productUrl = extractProductUrl(img);

    seen.add(imageUrl);

    // One product is often shown as several images (main image plus
    // thumbnails or colour variants). They are grouped, and only the
    // image with the best score for try-on is kept.
    const key = groupKey(productUrl, title, imageUrl);

    const score = imageScore(img, imageUrl, size);

    if (indexByKey[key] !== undefined) {

      if (score > bestScore[key]) {

        bestScore[key] = score;

        products[indexByKey[key]].image = imageUrl;

      }

      continue;

    }

    indexByKey[key] = products.length;
    bestScore[key] = score;

    // Attribute evidence, strongest first: structured JSON-LD for
    // this product, then its colour variants, then the card text.
    // Only the labelled fields are collected, so this never changes
    // the displayed title.
    const metaParts = [
      extractState(productUrl, title),
      extractStructured(container),
      extractStructured(anchor),
      extractVariants(container),
      extractMeta(priceRoot),
      extractMeta(anchor)
    ].filter(function (part) {

      return part;

    });


    // Raw product-card text, used for attribute detection only. It
    // is never displayed and never becomes the title.
    const details = [
      extractCardText(container),
      extractCardText(anchor)
    ].filter(function (part) {

      return part;

    }).join(" ").slice(0, 800);


    products.push({
      id: products.length,
      image: imageUrl,
      alt: alt || "Product",
      title: title,
      brand: extractBrand(container, productUrl) || extractBrand(anchor, productUrl),
      price: extractPrice(priceRoot) || extractPrice(anchor),
      mrp: extractMrp(priceRoot) || extractMrp(anchor),
      discount: extractDiscount(priceRoot) || extractDiscount(anchor),
      meta: metaParts.join(" | ").slice(0, 400),
      details: details,
      productUrl: productUrl,
      category: classifyCategory(title + " " + alt)
    });
  }

  return products;
}

// ============================================================
// PAGE EMBEDDED STATE  (Level 1 structured data)
//
// Retail pages usually embed the full product record in the HTML,
// e.g. Myntra ships window.__myx with per-product fields:
//   primaryColour   "Red"
//   colourVariants  [ { baseColourHex: "#f1a9c4", ... } ]
//   additionalInfo  "Printed Lounge Shirt"
//   category        "Shirts"
//   sizes, price, mrp, productId
//
// That is authoritative, unlike anything read from pixels. The
// content script runs in an isolated world, so page globals are not
// reachable; the JSON is read from its <script> tag instead, and a
// card is matched to its record by the product id in its own URL, so
// one product can never inherit a neighbour's colour.
// ============================================================

let STATE_INDEX = null;

function readEmbeddedState() {

  if (STATE_INDEX) return STATE_INDEX;

  STATE_INDEX = { byId: {}, byName: {}, rawById: {} };

  if (typeof document === "undefined") return STATE_INDEX;

  const scripts = document.getElementsByTagName("script");

  for (let s = 0; s < scripts.length; s++) {

    const text = scripts[s].textContent || "";

    if (text.length < 2000) continue;

    if (text.indexOf("primaryColour") === -1) continue;

    const start = text.indexOf("{");

    const end = text.lastIndexOf("}");

    if (start === -1 || end <= start) continue;

    let data;

    try {

      data = JSON.parse(text.slice(start, end + 1));

    }

    catch (error) {

      continue;

    }

    collectStateProducts(data, STATE_INDEX);

    // One state blob is enough.
    if (Object.keys(STATE_INDEX.byId).length) break;

  }

  return STATE_INDEX;

}

// Walks the state tree once and indexes every product-shaped object.
function collectStateProducts(node, index) {

  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {

    for (let i = 0; i < node.length; i++) {

      collectStateProducts(node[i], index);

    }

    return;

  }

  if (node.productId && (node.primaryColour || node.colourVariants)) {

    const record = stateProductFields(node);

    if (node.productId) index.byId[String(node.productId)] = record;

    // The raw record is kept so the brand can be read from it.
    if (node.productId) index.rawById[String(node.productId)] = node;

    if (node.product) {

      index.byName[normalizeKey(node.product)] = record;

    }

  }

  for (const key in node) {

    const value = node[key];

    if (value && typeof value === "object") {

      collectStateProducts(value, index);

    }

  }

}

function normalizeKey(value) {

  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

}

function stateProductFields(node) {

  const parts = [];

  if (node.primaryColour) {

    parts.push("Colour: " + node.primaryColour);

  }

  // Swatch hexes, converted to names so the textual matcher can use them.
  const variants = node.colourVariants;

  if (Array.isArray(variants)) {

    for (let i = 0; i < variants.length && i < 6; i++) {

      const variant = variants[i];

      if (!variant) continue;

      const hex = variant.baseColourHex || variant.colour1Hex;

      if (!hex) continue;

      const name = colorNameFromHex(hex);

      if (name) parts.push("Colour: " + name);

    }

  }

  if (node.additionalInfo) parts.push("Description: " + node.additionalInfo);

  if (node.category) parts.push("Category: " + node.category);

  if (node.brand) parts.push("Brand: " + node.brand);

  if (node.sizes) parts.push("Sizes: " + node.sizes);

  // Retailers do publish fit occasionally, under several spellings.
  [
    "fit", "fitType", "fit_type", "silhouette", "cut", "fitName"
  ].forEach(function (key) {

    if (node[key] && typeof node[key] === "string") {

      parts.push("Fit: " + node[key]);

    }

  });

  return parts.join(" | ");

}

// Structured evidence for one detected card, matched by product id
// from its own link, then by product name. Returns "" when the page
// has no matching record.
function extractState(url, title) {

  const index = readEmbeddedState();

  const idMatch = /\/product\/(\d+)/.exec(url || "");

  if (idMatch && index.byId[idMatch[1]]) {

    return index.byId[idMatch[1]];

  }

  if (!idMatch && title) {

    const key = normalizeKey(title);

    if (index.byName[key]) return index.byName[key];

  }

  return "";

}

// ============================================================
// COLOUR FROM IMAGE PIXELS
//
// Used ONLY as the last fallback, after every structured and
// textual source has failed. The sampling itself is a pure
// function (dominantColorFromPixels) so it can be unit tested
// without a browser; the canvas part is a thin wrapper.
//
// Deliberately avoided:
//   * page / studio background - flat near-white pixels dropped
//   * skin tone               - warm mid-lightness dropped
//   * hair and deep shadow    - dropped
//   * image borders           - outer frame ignored, because
//     retail photos are shot on white that reaches the edge
//
// The central band is preferred: on a garment photo that is the
// torso / garment area.
// ============================================================

// rgb -> hsv. h in 0..360, s and v in 0..1
function rgbToHsv(r, g, b) {

  r = r / 255;
  g = g / 255;
  b = b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;

  if (delta !== 0) {

    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);

  }

  if (h < 0) h += 360;

  return { h: h, s: max === 0 ? 0 : delta / max, v: max };

}

// Human skin: warm hue, medium saturation, red-dominant. Excluding
// this stops a bare arm or neck from being read as the garment.
function looksLikeSkin(r, g, b) {

  const c = rgbToHsv(r, g, b);

  if (c.h < 5 || c.h > 55) return false;

  if (c.s < 0.12 || c.s > 0.72) return false;

  if (c.v < 0.28 || c.v > 0.97) return false;

  if (r <= g || r <= b) return false;

  return true;

}

// Coarse colour family used for voting. Shades and lighting variants
// of one garment land in the same family, so a photographed navy top
// does not split across several buckets.
function colorFamily(r, g, b) {

  const c = rgbToHsv(r, g, b);
  const h = c.h;
  const s = c.s;
  const v = c.v;
  const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 510;

  if (s < 0.12) {

    if (v < 0.14) return "black";

    if (v > 0.88) return "white";

    return "grey";

  }

  if (v < 0.15) return "black";

  if (h >= 15 && h < 45) return (l < 0.46) ? "brown" : "orange";

  if (h >= 45 && h < 70) return (l < 0.37) ? "olive" : "yellow";

  if (h >= 70 && h < 100) return (l < 0.45) ? "olive" : "green";

  if (h >= 100 && h < 170) return "green";

  if (h >= 170 && h < 200) return "teal";

  if (h >= 200 && h < 260) return (l < 0.40) ? "navy" : "blue";

  if (h >= 260 && h < 330) return "purple";

  return "red";

}

// Names an rgb triple using the SAME vocabulary as the textual
// detector, so an image result and a title result read alike.
function colorNameFromRgb(r, g, b) {

  const c = rgbToHsv(r, g, b);
  const h = c.h;
  const s = c.s;
  const v = c.v;
  const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 510;

  // Slightly tinted near-whites are beige / lavender, not plain white.
  if (s < 0.22 && v > 0.78) {

    if (h >= 25 && h < 70) return "beige";

    if (h >= 70 && h < 200) return "off white";

    if (h >= 225 && h < 300) return "lavender";

  }

  // Neutrals are decided on saturation, not hue.
  if (s < 0.12) {

    if (v < 0.10) return "black";

    if (l < 0.22) return "charcoal";

    if (v > 0.88 && l > 0.92) return "white";

    if (l > 0.88) return "off white";

    return "grey";

  }

  if (v < 0.16) return "black";

  if (h >= 5 && h < 20) {

    if (h >= 12 && s > 0.40 && l < 0.48) return "brown";

    if (s > 0.50 && v < 0.55) return "rust";

    if (l > 0.58 && s > 0.35 && s < 0.72) return "coral";

    return "red";

  }

  if (h >= 20 && h < 40) {

    if (s < 0.30 && v > 0.80) return "cream";

    if (s >= 0.45 && v < 0.55 && l < 0.40) return "brown";

    if (s > 0.50 && l < 0.48) return "brown";

    if (s < 0.50 && l > 0.60) return "coral";

    if (s < 0.35) return "beige";

    return "orange";

  }

  if (h >= 40 && h < 68) {

    if (s < 0.22 && v > 0.85) return "off white";

    if (l > 0.78) return "yellow";

    if (l < 0.35) return "olive";

    if (l < 0.47) return "mustard";

    if (s < 0.50 && l > 0.60) return "khaki";

    if (s < 0.32) return "beige";

    return "yellow";

  }

  if (h >= 68 && h < 165) {

    if (s < 0.22) return (l > 0.72 ? "off white" : "grey");

    if (h < 95 && l < 0.45) return "olive";

    return "green";

  }

  if (h >= 165 && h < 200) return (s < 0.25 ? "grey" : "teal");

  if (h >= 200 && h < 255) {

    if (s < 0.18) return (l > 0.75 ? "off white" : "grey");

    // Muted, mid-light blue-grey reads as grey, not as a colour.
    if (s < 0.28 && l >= 0.40) return "grey";

    // Dark, desaturated blue reads as navy, not plain blue.
    if (l < 0.32) return "navy blue";

    if (h < 215 && s < 0.35 && l < 0.55) return "navy blue";

    return "blue";

  }

  if (h >= 255 && h < 290) {

    if (l > 0.78) return "lavender";

    if (l < 0.32) return "purple";

    if (s < 0.30 && l > 0.70) return "lavender";

    return "violet";

  }

  if (h >= 290 && h < 345) {

    if (l < 0.40) return "purple";

    if (h >= 320 && l > 0.60) return "pink";

    if (l > 0.60 && s < 0.60) return "violet";

    if (l > 0.82 && s < 0.35) return "pink";

    if (s < 0.35) return "purple";

    return "magenta";

  }

  // Reds and pinks.
  if (l > 0.70) return "pink";

  if (s >= 0.45 && l <= 0.40) return "maroon";

  return "red";

}

// Nearest named colour for a hex swatch such as "#ee5f73", used for
// the data-color / baseColourHex values shops expose.
function colorNameFromHex(hex) {

  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());

  if (!match) return "";

  const value = parseInt(match[1], 16);

  return colorNameFromRgb(
    (value >> 16) & 255,
    (value >> 8) & 255,
    value & 255
  );

}

// Pure function: dominant garment colour from an ImageData-like
// object ({ data, width, height }). Returns
// { color, share, samples } or null when the image is too uniform,
// too washed out or too multi-coloured to trust.
//
// `share` is the winning bucket's share of usable pixels and
// doubles as a confidence measure.
function dominantColorFromPixels(imageData) {

  if (!imageData || !imageData.data || !imageData.width) return null;

  const width = imageData.width;
  const height = imageData.height;
  const pixels = imageData.data;

  // The outer border of a retail photo is the studio background, so
  // its mean colour is measured first and used to reject the backdrop.
  // That is what lets a black or navy garment on a white background
  // be told apart from the background itself.
  let br = 0, bg = 0, bb = 0, bn = 0;

  function edge(x, y) {

    const i = (y * width + x) * 4;

    if (i + 2 >= pixels.length) return;

    br += pixels[i];
    bg += pixels[i + 1];
    bb += pixels[i + 2];
    bn++;

  }

  for (let x = 0; x < width; x += 2) {

    edge(x, 0);
    edge(x, height - 1);

  }

  for (let y = 0; y < height; y += 2) {

    edge(0, y);
    edge(width - 1, y);

  }

  const backR = bn ? br / bn : 255;
  const backG = bn ? bg / bn : 255;
  const backB = bn ? bb / bn : 255;

  // A pale backdrop needs different handling: when the studio
  // background is itself white or off-white, a white garment is the
  // same colour as the background and cannot be separated by colour
  // distance. In that case the backdrop is identified by position
  // (the outer frame) instead, so a white shrug still reads white.
  const backHsv = rgbToHsv(backR, backG, backB);
  const backIsPale = backHsv.s < 0.10 && backHsv.v > 0.80;

  // Central band only, so the backdrop is not counted twice.
  const x0 = Math.floor(width * 0.20);
  const x1 = Math.ceil(width * 0.80);
  const y0 = Math.floor(height * 0.16);
  const y1 = Math.ceil(height * 0.72);

  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const spanX = Math.max(1, (x1 - x0) / 2);
  const spanY = Math.max(1, (y1 - y0) / 2);

  const families = {};
  const names = {};
  const bright = {};
  let usable = 0;

  const stepX = Math.max(1, Math.floor((x1 - x0) / 40));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 40));

  for (let y = y0; y < y1; y += stepY) {

    for (let x = x0; x < x1; x += stepX) {

      const index = (y * width + x) * 4;

      if (index + 2 >= pixels.length) continue;

      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const a = pixels.length > (index + 3) ? pixels[index + 3] : 255;

      if (a < 200) continue;

      // Same colour as the backdrop: not the garment. With a pale
      // backdrop the outer frame is background and the centre may be
      // a white garment, so only the frame is dropped.
      const distance =
        Math.abs(r - backR) +
        Math.abs(g - backG) +
        Math.abs(b - backB);

      const offset = Math.max(
        Math.abs(x - cx) / spanX,
        Math.abs(y - cy) / spanY
      );

      if (backIsPale) {

        if (distance < 55 && offset > 0.45) continue;

      }

      else if (distance < 55) {

        continue;

      }

      // Skin, hair and warm unrelated objects.
      if (looksLikeSkin(r, g, b)) continue;

      // Pixels nearer the centre of the frame are more likely to be
      // the garment, so they carry a larger vote.
      const weight = 1.6 - 0.6 * offset;

      const family = colorFamily(r, g, b);

      families[family] = (families[family] || 0) + weight;

      if (!names[family]) names[family] = {};

      const fine = colorNameFromRgb(r, g, b);

      names[family][fine] = (names[family][fine] || 0) + weight;

      // Brightest sample of the family. Shadows darken a garment
      // towards brown or maroon, so the lit pixels are the ones that
      // carry the true colour.
      if (!bright[family] || rgbToHsv(r, g, b).v > bright[family].v) {

        bright[family] = { r: r, g: g, b: b, v: rgbToHsv(r, g, b).v };

      }

      usable += weight;

    }

  }

  // Too little usable signal: refuse to guess.
  if (usable < 24) return null;

  let best = "";
  let bestCount = 0;
  let secondCount = 0;

  for (const name in families) {

    if (families[name] > bestCount) {

      secondCount = bestCount;
      bestCount = families[name];
      best = name;

    } else if (families[name] > secondCount) {

      secondCount = families[name];

    }

  }

  if (!best) return null;

  const share = bestCount / usable;

  // A near-tie means the product is genuinely multi-coloured, and any
  // single answer would be a guess.
  if (share < 0.28) return null;

  if (secondCount > bestCount * 0.85) return null;

  // Most common specific name inside the winning family.
  const votes = names[best];
  let label = "";
  let labelCount = 0;

  for (const name in votes) {

    if (votes[name] > labelCount) {

      labelCount = votes[name];
      label = name;

    }

  }

  // A neutral family is resolved by how bright the garment actually
  // is, which is what separates a white shrug from a grey one when
  // both sit against a pale backdrop. Tinted neutrals such as beige or
  // lavender are left alone, because those are already correct.
  //
  // Saturated families deliberately keep the plain mode: naming them
  // from the single brightest pixel was measurably worse, because that
  // pixel is usually a specular highlight rather than the fabric.
  const lit = bright[best];

  if (lit && (best === "white" || best === "grey" || best === "black")) {

    // Bright fabric is white even when the mode of the family called
    // it beige or grey: a white shirt is usually photographed with
    // enough shadow to make its plain mode wrong.
    if (lit.v > 0.86) label = "white";

    else if (lit.v > 0.72) label = "off white";

    else if (lit.v < 0.18) label = "black";

    else if (lit.v < 0.30) label = "charcoal";

  }

  return {
    color: label,
    share: Math.round(share * 100) / 100,
    samples: Math.round(usable)
  };

}

// Draws a product image onto a small canvas and samples it.
// Returns null when the pixels cannot be read - a tainted canvas, a
// broken image, or a CDN without CORS headers. Colour then stays
// undetected and the structured / textual sources stay in charge.
function analyzeImageColor(imageUrl) {

  return new Promise(function (resolve) {

    let settled = false;

    function finish(value) {

      if (settled) return;

      settled = true;

      resolve(value);

    }

    // A slow CDN must never stall the whole scan.
    const guard = setTimeout(function () {

      finish(null);

    }, 6000);

    if (!imageUrl) {

      clearTimeout(guard);
      finish(null);

      return;

    }

    let image;

    try {

      image = new Image();

    }

    catch (error) {

      clearTimeout(guard);
      finish(null);

      return;

    }

    image.crossOrigin = "anonymous";

    image.onload = function () {

      try {

        const ratio =
          (image.naturalHeight || 1) / (image.naturalWidth || 1);

        const width = 64;
        const height = Math.max(1, Math.round(64 * ratio));

        const canvas = document.createElement("canvas");

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        if (!ctx) throw new Error("no 2d context");

        ctx.drawImage(image, 0, 0, width, height);

        // Throws when the canvas is tainted.
        const data = ctx.getImageData(0, 0, width, height);

        clearTimeout(guard);

        finish(dominantColorFromPixels(data));

      }

      catch (error) {

        clearTimeout(guard);
        finish(null);

      }

    };

    image.onerror = function () {

      clearTimeout(guard);
      finish(null);

    };

    image.src = imageUrl;

  });

}
// ============================================================
// MESSAGE HANDLER
// ============================================================

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {

    if (message.action === "detectProducts") {

      const products = getProductImages();

      // Last-resort image sampling: only for products whose colour
      // still has no textual or structured evidence. Runs after the
      // synchronous scan so it can never delay the result set.
      const pending = products.filter(function (product) {

        return !hasColorEvidence(product);

      });

      Promise.all(
        pending.map(function (product) {

          return analyzeImageColor(product.image).then(function (result) {

            if (result) {

              product.imageColor = result.color;
              product.imageColorShare = result.share;

            }

          });

        })
      ).then(function () {

        sendResponse({
          success: true,
          products: products
        });

      });

      return true;

    }

    return true;
  }
);

// True when the structured or textual scan already produced a colour
// word, in which case the image is never consulted.
function hasColorEvidence(product) {

  return /colou?r\s*[:=]/i.test(product.meta || "");

}
