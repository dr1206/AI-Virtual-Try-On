const detectButton =
  document.getElementById("detectProducts");

const status =
  document.getElementById("status");

const productsContainer =
  document.getElementById("products");

const profileInput =
  document.getElementById("profileImage");

const profilePreview =
  document.getElementById("profilePreview");

const profileStatus =
  document.getElementById("profileStatus");

const resultSection =
  document.getElementById("resultSection");

const resultContainer =
  document.getElementById("result");

const progressContainer =
  document.getElementById("progress");

const comparePanel =
  document.getElementById("comparePanel");

const historyList =
  document.getElementById("historyList");

const wardrobeList =
  document.getElementById("wardrobeList");

const styleSelect =
  document.getElementById("stylePreference");

const fitSelect =
  document.getElementById("fitPreference");

const colorSelect =
  document.getElementById("colorPreference");

const heightInput =
  document.getElementById("heightInput");

const topSizeInput =
  document.getElementById("topSizeInput");

const bottomSizeInput =
  document.getElementById("bottomSizeInput");

const deleteProfileButton =
  document.getElementById("deleteProfile");

const clearHistoryButton =
  document.getElementById("clearHistory");

const privacyClearHistoryButton =
  document.getElementById("privacyClearHistory");

const clearWardrobeButton =
  document.getElementById("clearWardrobe");

const privacyClearWardrobeButton =
  document.getElementById("privacyClearWardrobe");


// Resolves the generated-image URL from a /tryon response.
//
// The backend returns the file under "result", "result_url" and
// "full_result_url" ("image_url" was never emitted by the current
// backend). The value is a PATH such as "/results/tryon_1.png": in an
// extension popup a leading-slash path would resolve against
// chrome-extension://<id>/ and 404, so it is made absolute against the
// FastAPI base URL here. The backend keeps serving /results/*.
function resultImageUrl(
  data
) {

  if (!data) return "";

  const raw =
    data.full_result_url ||
    data.result_url ||
    data.result ||
    data.image_url ||
    "";

  const value = String(raw).trim();

  if (!value) return "";

  if (/^https?:\/\//i.test(value)) return value;

  if (value.charAt(0) === "/") {

    return BACKEND_URL + value;

  }

  return BACKEND_URL + "/" + value;

}

const BACKEND_URL =
  "http://127.0.0.1:8000";


let profileImageData = null;

// URL of the page the products were detected on.
let currentPageUrl = "";

// Last detected products, so the cards can be re-rendered when a
// preference changes without scanning the page again.
let lastProducts = [];

// Product keys selected for the side-by-side comparison (max two).
let selectedKeys = [];

// True while a try-on request is running.
let generating = false;

// Tab currently shown. Terminal try-on statuses (completed / failed)
// are only displayed while the shop tab is active, so a stale result
// never floats above the other tabs.
let activeTab = "profile";

// Status messages that belong to the try-on flow: progress while a
// try-on runs, and completion / failure results.
const TRY_ON_STATUS_PATTERN =
  /^(Preparing images|Downloading product image|Sending to AI try-on model|Note: the model is optimized|Please upload your profile photo first|This product has no usable image|Try-on completed successfully|✓ Try-on completed successfully|Try-on failed|Try-on complete|Select another product|Showing a previously generated IDM-VTON result)/;

function isTryOnStatus(text) {

  return TRY_ON_STATUS_PATTERN.test(
    String(text || "").trim()
  );

}

// Writes a try-on status message. onlyShop marks terminal messages
// (completed / failed): they are only shown while the shop tab is
// visible, so a result never floats above History or Wardrobe.
function setTryOnStatus(message, onlyShop) {

  if (onlyShop && activeTab !== "shop") {

    status.textContent = "";

    return;
  }

  status.textContent = message;
}

// Try-on progress state.
let currentStage = 0;
let elapsedSeconds = 0;
let timerHandle = null;
let stageRow = null;
let timerRow = null;

// Saved collections. Both live in chrome.storage.local, and only
// small URLs and text are stored - never image data.
let tryonHistory = [];
let wardrobe = [];

const HISTORY_LIMIT = 20;
const WARDROBE_LIMIT = 30;


// Digital fashion profile, restored from storage.

const profilePreferences = {

  style: "",

  fit: "",

  color: "",

  height: "",

  topSize: "",

  bottomSize: ""

};


// ============================================================
// LOAD SAVED PROFILE
// ============================================================

chrome.storage.local.get(
  [
    "profileImage", "style", "fit", "color",
    "height", "topSize", "bottomSize",
    "tryonHistory", "wardrobe"
  ],
  function (data) {

    if (data.profileImage) {

      profileImageData =
        data.profileImage;

      showProfilePreview(
        profileImageData
      );

    }


    profilePreferences.style =
      data.style || "";

    profilePreferences.fit =
      data.fit || "";

    profilePreferences.color =
      data.color || "";

    profilePreferences.height =
      data.height || "";

    profilePreferences.topSize =
      data.topSize || "";

    profilePreferences.bottomSize =
      data.bottomSize || "";


    styleSelect.value =
      profilePreferences.style;

    fitSelect.value =
      profilePreferences.fit;

    colorSelect.value =
      profilePreferences.color;

    heightInput.value =
      profilePreferences.height;

    topSizeInput.value =
      profilePreferences.topSize;

    bottomSizeInput.value =
      profilePreferences.bottomSize;


    // Legacy records are cleaned once when loaded, so old polluted
    // titles/prices display clean without clearing history.
    tryonHistory = (
      Array.isArray(data.tryonHistory) ? data.tryonHistory : []
    ).map(sanitizeStoredRecord);

    wardrobe = (
      Array.isArray(data.wardrobe) ? data.wardrobe : []
    ).map(sanitizeStoredRecord);


    renderHistory();

    renderWardrobe();

    updateProfilePhotoStatus();

  }
);


// ============================================================
// PROFILE UPLOAD
// ============================================================

profileInput.addEventListener(
  "change",
  function () {

    const file =
      profileInput.files[0];

    if (!file) {
      return;
    }


    const reader =
      new FileReader();


    reader.onload =
      function () {

        profileImageData =
          reader.result;


        chrome.storage.local.set({

          profileImage:
            profileImageData

        });


        showProfilePreview(
          profileImageData
        );


        updateProfilePhotoStatus();


        status.textContent =
          "Profile photo saved.";

      };


    reader.readAsDataURL(
      file
    );

  }
);


// ============================================================
// PROFILE PREFERENCES
//
// Saved automatically and reused on every shopping website,
// because they are kept in chrome.storage.local.
// ============================================================

function savePreferences() {

  profilePreferences.style = styleSelect.value;
  profilePreferences.fit = fitSelect.value;
  profilePreferences.color = colorSelect.value;
  profilePreferences.height = heightInput.value.trim();
  profilePreferences.topSize = topSizeInput.value;
  profilePreferences.bottomSize = bottomSizeInput.value;


  chrome.storage.local.set({

    style: profilePreferences.style,
    fit: profilePreferences.fit,
    color: profilePreferences.color,
    height: profilePreferences.height,
    topSize: profilePreferences.topSize,
    bottomSize: profilePreferences.bottomSize

  });


  // Refresh the Profile Match lines with the new preferences.
  if (lastProducts.length > 0) {

    renderProducts();

  }

}

styleSelect.addEventListener(
  "change",
  savePreferences
);

fitSelect.addEventListener(
  "change",
  savePreferences
);

colorSelect.addEventListener(
  "change",
  savePreferences
);

topSizeInput.addEventListener(
  "change",
  savePreferences
);

bottomSizeInput.addEventListener(
  "change",
  savePreferences
);

heightInput.addEventListener(
  "input",
  savePreferences
);

heightInput.addEventListener(
  "change",
  savePreferences
);


// ============================================================
// DELETE PROFILE
//
// Removes the profile photo and the profile data. Try-on history
// and the wardrobe are kept unless the user clears them.
// ============================================================

function deleteProfile() {

  if (!window.confirm("Delete your saved profile photo and preferences?")) {

    return;

  }


  profileImageData = null;

  profilePreferences.style = "";
  profilePreferences.fit = "";
  profilePreferences.color = "";
  profilePreferences.height = "";
  profilePreferences.topSize = "";
  profilePreferences.bottomSize = "";


  styleSelect.value = "";
  fitSelect.value = "";
  colorSelect.value = "";
  heightInput.value = "";
  topSizeInput.value = "";
  bottomSizeInput.value = "";


  profilePreview.innerHTML = "";


  updateProfilePhotoStatus();


  chrome.storage.local.remove([
    "profileImage",
    "style",
    "fit",
    "color",
    "height",
    "topSize",
    "bottomSize"
  ]);


  status.textContent =
    "Profile deleted.";

}

deleteProfileButton.addEventListener(
  "click",
  deleteProfile
);


// ============================================================
// PROFILE PREVIEW
// ============================================================

function showProfilePreview(
  imageData
) {

  profilePreview.innerHTML = "";


  const image =
    document.createElement("img");


  image.src =
    imageData;


  profilePreview.appendChild(
    image
  );

}


// Shows whether a profile photo is currently saved. The file input
// itself is never set programmatically - only this label reflects
// the saved state.
function updateProfilePhotoStatus() {

  if (!profileStatus) return;


  // A saved profile is confirmed with a check mark; the pending
  // state stays visually quiet.
  profileStatus.textContent = profileImageData
    ? "✓ Profile photo saved"
    : "Upload a profile photo";

  profileStatus.className =
    profileImageData
      ? "hint"
      : "hint pending";

}


// ============================================================
// DETECT PRODUCTS
// ============================================================

detectButton.addEventListener(
  "click",
  async function () {

    status.textContent =
      "Scanning this page...";


    productsContainer.innerHTML =
      "";


    resultSection.style.display =
      "none";


    resultContainer.innerHTML =
      "";


    try {

      const [tab] =
        await chrome.tabs.query({

          active: true,

          currentWindow: true

        });


      currentPageUrl =
        tab.url || "";


      chrome.tabs.sendMessage(

        tab.id,

        {
          action:
            "detectProducts"
        },

        function (response) {

          if (
            chrome.runtime.lastError
          ) {

            status.textContent =
              "Unable to scan this page.";

            return;

          }


          if (
            !response ||
            !response.success
          ) {

            status.textContent =
              "No products detected.";

            return;

          }


          const products =
            response.products;


          if (
            !products ||
            products.length === 0
          ) {

            status.textContent =
              "No products detected.";

            return;

          }


          lastProducts =
            products.map(normalizeProduct);


          status.textContent =
            `${products.length} products detected`;


          renderProducts();

        }

      );

    }

    catch (error) {

      console.error(error);

      status.textContent =
        "Unable to scan this page.";

    }

  }
);


// ============================================================
// RENDER PRODUCTS
// ============================================================

function renderProducts() {

  productsContainer.innerHTML = "";


  lastProducts.forEach(
    function (product) {

      createProductCard(
        product
      );

    }
  );

}


// ============================================================
// PRODUCT CARD
// ============================================================

function createProductCard(
  product
) {

  const card =
    document.createElement("div");


  // Cards selected for comparison are highlighted.
  card.className =
    isSelected(product) ? "product selected" : "product";


  // ----------------------------------------------------------
  // IMAGE AND TITLE
  // ----------------------------------------------------------

  const image =
    document.createElement("img");


  image.src =
    product.image;


  image.alt =
    product.title ||
    product.alt ||
    "Product";


  // Brand sits above the title, smaller and quieter, so the product
  // name stays the main line.
  if (product.brand) {

    const brand =
      document.createElement("div");

    brand.className =
      "product-brand";

    brand.textContent =
      product.brand;

    card.appendChild(
      brand
    );

  }


  const title =
    document.createElement("div");


  title.className =
    "product-title";


  title.textContent =
    product.title ||
    product.alt ||
    "Product";


  card.appendChild(
    image
  );


  // Category badge sits above the title for a clearer hierarchy.
  if (product.category && product.category !== "unknown") {

    card.appendChild(
      makeRow(
        "product-badge",
        formatCategory(product.category)
      )
    );

  }


  card.appendChild(
    title
  );


  // ----------------------------------------------------------
  // PRICE
  //
  // Current price is emphasised, the original price is secondary
  // and struck through, and the discount is visually distinct.
  // ----------------------------------------------------------

  if (product.price) {

    const priceRow =
      document.createElement("div");

    priceRow.className =
      "product-price-row";


    const current =
      document.createElement("span");

    current.className =
      "product-price";

    current.textContent =
      product.price;


    priceRow.appendChild(
      current
    );


    const original =
      product.originalPrice || product.mrp;

    if (original && original !== product.price) {

      const was =
        document.createElement("span");

      was.className =
        "product-price-original";

      was.textContent =
        original;

      priceRow.appendChild(
        was
      );

    }


    if (product.discount) {

      const off =
        document.createElement("span");

      off.className =
        "product-discount";

      off.textContent =
        product.discount;

      priceRow.appendChild(
        off
      );

    }


    card.appendChild(
      priceRow
    );

  }


  const domain =
    product.retailer ||
    domainFrom(
      product.productUrl ||
      currentPageUrl
    );


  if (domain) {

    card.appendChild(
      makeRow(
        "product-domain",
        "Website: " + domain
      )
    );

  }


  if (product.productUrl) {

    const link =
      document.createElement("a");


    link.className =
      "product-url";


    link.href =
      product.productUrl;


    link.target =
      "_blank";


    link.rel =
      "noopener noreferrer";


    link.textContent =
      shortUrl(
        product.productUrl
      );


    // The full URL stays in href and the tooltip, never as long
    // visible text.
    link.title =
      product.productUrl;


    card.appendChild(
      link
    );

  }


  // ----------------------------------------------------------
  // PRODUCT INTELLIGENCE / PROFILE MATCH
  // ----------------------------------------------------------

  const intelligence =
    productIntelligence(
      product
    );


  card.appendChild(
    intelligenceBlock(
      intelligence,
      product.category
    )
  );


  card.appendChild(
    matchBlock(
      intelligence
    )
  );


  // ----------------------------------------------------------
  // CATEGORY SAFETY
  // ----------------------------------------------------------

  if (
    !isTryOnSupported(
      product.category
    )
  ) {

    card.appendChild(
      makeRow(
        "notice",
        "Current try-on model is optimized for clothing garments."
      )
    );

  }


  // ----------------------------------------------------------
  // COMPARE SELECTION
  // ----------------------------------------------------------

  const selectButton =
    document.createElement("button");


  selectButton.className =
    "select-btn";


  selectButton.textContent =
    selectionLabel(product);


  selectButton.addEventListener(
    "click",
    function () {

      toggleCompare(
        product
      );

    }
  );


  card.appendChild(
    selectButton
  );


  // ----------------------------------------------------------
  // TRY ON
  // ----------------------------------------------------------

  const tryButton =
    document.createElement("button");


  tryButton.className =
    "tryon";


  tryButton.textContent =
    "Try On";


  tryButton.addEventListener(
    "click",
    function () {

      performTryOn(
        product,
        tryButton
      );

    }
  );


  card.appendChild(
    tryButton
  );


  productsContainer.appendChild(
    card
  );

}


// ============================================================
// PERFORM TRY-ON
// ============================================================

async function performTryOn(
  product,
  button
) {

  if (generating) {

    return;

  }

  // A new try-on starts from a clean slate: the previous status
  // (for example an old failure) is cleared first.
  status.textContent = "";


  // ----------------------------------------------------------
  // CHECK PROFILE
  // ----------------------------------------------------------

  if (!profileImageData) {

    showTab("profile");

    setTryOnStatus("Please upload your profile photo first.");

    return;

  }


  if (!product || !product.image) {

    setTryOnStatus("This product has no usable image. Please try another product.");

    return;

  }


  setTryOnBusy(true, button);


  try {

    resultSection.style.display =
      "block";


    resultContainer.innerHTML =
      "";


    progressContainer.style.display =
      "block";


    setStage(1);

    startTimer();


    setTryOnStatus(
      "Preparing images..."
    );


    // --------------------------------------------------------
    // PERSON IMAGE
    // --------------------------------------------------------

    const profileBlob =
      dataURLToBlob(
        profileImageData
      );


    // --------------------------------------------------------
    // PRODUCT IMAGE
    // --------------------------------------------------------

    setStage(2);


    setTryOnStatus(
      "Downloading product image..."
    );


    let productResponse = null;


    // The product image is fetched as a normal image, but AVIF is
    // deliberately not advertised. Some retail CDNs choose the
    // response format from this header: AJIO answers with AVIF
    // whenever the caller offers AVIF support, even for a URL that
    // ends in .jpg, and the try-on model cannot decode AVIF. Myntra
    // answers with JPEG either way, so this is safe for it.
    const productImageHeaders = {

      "Accept":
        "image/jpeg,image/png,image/webp,image/*;q=0.8,*/*;q=0.5"

    };


    try {

      productResponse =
        await fetch(

          product.image,

          {
            headers:
              productImageHeaders
          }

        );

    }

    catch (error) {

      // A network failure here is about the product image, not about
      // the try-on service.
      throw new Error(
        "Unable to download product image"
      );

    }


    if (
      !productResponse.ok
    ) {

      throw new Error(
        "Unable to download product image"
      );

    }


    const productBlob =
      await productResponse.blob();


    // --------------------------------------------------------
    // PRODUCT IMAGE NETWORK METADATA
    //
    // Safe metadata only, so a site that fails can be compared
    // directly against one that works. No cookies, no tokens and no
    // image contents are ever logged.
    // --------------------------------------------------------

    console.log(
      "garment_image source:",
      {

        urlExtension:
          urlFileExtension(product.image),

        hostname:
          urlHostname(product.image),

        httpStatus:
          productResponse.status,

        contentType:
          productResponse.headers.get("content-type") || "unknown",

        sizeBytes:
          productBlob.size

      }
    );


    // --------------------------------------------------------
    // FORM DATA
    // --------------------------------------------------------

    // Safe metadata only. The console now always shows exactly
    // which person and which product image are being sent.
    await describeImageBlob(
      "human_image",
      "profile." + blobExtension(profileBlob),
      profileBlob
    );

    const garmentInfo =
      await describeImageBlob(
        "garment_image",
        "garment." + blobExtension(productBlob),
        productBlob
      );


    // Anything that cannot be decoded is not a product image at all -
    // an error page, an empty body and so on. It is stopped here so
    // that no unusable file is ever handed to the model.
    if (
      !productBlob.size ||
      (
        garmentInfo &&
        garmentInfo.dimensions === "unavailable"
      )
    ) {

      throw new Error(
        "Unable to process the selected product image."
      );

    }


    const formData =
      new FormData();


    formData.append(
      "human_image",
      profileBlob,
      "profile." + blobExtension(profileBlob)
    );


    formData.append(
      "garment_image",
      productBlob,
      "garment." + blobExtension(productBlob)
    );


    const garmentDescription =
      getGarmentDescription(
        product
      );


    formData.append(
      "garment_description",
      garmentDescription
    );


    // Category is our own application-level field. IDM-VTON only
    // supports three categories, so anything else falls back.
    formData.append(
      "category",
      tryOnCategory(
        product.category
      )
    );


    console.log(
      "Garment:",
      garmentDescription
    );


    // --------------------------------------------------------
    // SEND TO BACKEND
    // --------------------------------------------------------

    setStage(3);


    setTryOnStatus(
      "Sending to AI try-on model..."
    );


    // The request is still sent for unsupported categories, but the
    // user is told what the current model is tuned for.
    if (!isTryOnSupported(product.category)) {

      setTryOnStatus(
        "Note: the model is optimized for clothing garments."
      );

    }


    const response =
      await fetch(

        `${BACKEND_URL}/tryon`,

        {

          method:
            "POST",

          body:
            formData

        }

      );


    if (
      !response.ok
    ) {

      throw new Error(
        `Backend error: ${response.status}`
      );

    }


    const data =
      await response.json();


    // --------------------------------------------------------
    // RESULT
    // --------------------------------------------------------

    if (
      !data.success
    ) {

      // Technical detail stays in the console; the user sees a
      // readable message instead. When the backend already provides
      // a short readable message it is passed through unchanged -
      // no stack trace ever reaches the interface.
      console.error(
        "Try-on failed on the backend:",
        data.error
      );

      // DEMO MODE: the backend could not generate now because the
      // free GPU quota is exhausted, and it returned a previously
      // generated IDM-VTON result. It is shown with a clear label
      // and is NOT stored as a new try-on.
      if (data.demo && resultImageUrl(data)) {

        showDemoResult(
          product,
          data
        );

        return;

      }


      const backendFailure =
        new Error(
          "model failed"
        );

      if (
        typeof data.message === "string" &&
        data.message &&
        data.message.length <= 200
      ) {

        backendFailure.friendlyMessage =
          data.message;

      }

      throw backendFailure;

    }


    setStage(5);


    // Saved so results survive closing the popup. Only URLs and text
    // are stored, never image data.
    const record =
      buildRecord(
        product,
        resultImageUrl(
          data
        )
      );


    addHistoryRecord(
      record
    );


    showResult(
      record,
      product
    );


    setTryOnStatus(
      "✓ Try-on completed successfully",
      true
    );

  }

  catch (error) {

    // Raw details go to the console, never to the user interface.
    console.error(
      "Try-on error:",
      error
    );


    progressContainer.style.display =
      "none";


    setTryOnStatus(
      "Try-on failed",
      true
    );


    resultSection.style.display =
      "block";


    resultContainer.innerHTML =
      "";


    resultContainer.appendChild(
      makeRow(
        "error",
        friendlyError(error)
      )
    );

  }

  finally {

    stopTimer();

    setTryOnBusy(false);

  }

}


// ============================================================
// GARMENT DESCRIPTION
// ============================================================

function getGarmentDescription(
  product
) {

  // Deterministic description built from the product title, in the
  // form "black cotton t-shirt". Nothing is invented: a part is only
  // added when its keyword is actually present in the title.

  const text =
    (
      (product.title || "") +
      " " +
      (product.alt || "")
    ).toLowerCase();


  const parts = [];


  // Colour comes from the normalized product object when available;
  // only material and noun still need a keyword scan.
  const color =
    product.color !== undefined
      ? product.color
      : detectColor(
          {
            meta: "",
            text: text
          }
        );


  if (color) {

    parts.push(
      color
    );

  }


  const material =
    findKeyword(
      text,
      MATERIAL_KEYWORDS
    );


  if (material) {

    parts.push(
      material
    );

  }


  // The noun is required, so fall back to the product category.
  const noun =
    findKeyword(
      text,
      GARMENT_NOUNS
    ) ||
    defaultNoun(
      product.category
    );


  parts.push(
    noun
  );


  return parts.join(" ");

}


// Used when the title contains no garment noun.
function defaultNoun(
  category
) {

  if (category === "lower_body") {

    return "pants";

  }


  if (category === "dresses") {

    return "dress";

  }


  if (category === "footwear") {

    return "shoes";

  }


  if (category === "accessories") {

    return "accessory";

  }


  return "shirt";

}


// ============================================================
// DATA URL TO BLOB
// ============================================================

function dataURLToBlob(
  dataURL
) {

  const parts =
    dataURL.split(",");


  if (parts.length < 2) {

    throw new Error(
      "Invalid profile image data"
    );

  }


  const mimeMatch =
    parts[0].match(
      /:(.*?);/
    );


  const mime =
    mimeMatch
      ? mimeMatch[1]
      : "image/png";


  // Remove line breaks / spaces before decoding.
  const base64 =
    parts.slice(1)
      .join(",")
      .replace(/\s+/g, "");


  const binary =
    atob(base64);


  const length =
    binary.length;


  const bytes =
    new Uint8Array(
      length
    );


  for (
    let i = 0;
    i < length;
    i++
  ) {

    bytes[i] =
      binary.charCodeAt(i);

  }


  return new Blob(

    [bytes],

    {
      type: mime
    }

  );

}


// ============================================================
// BLOB FILE EXTENSION
//
// Keeps the uploaded file name consistent with the real MIME type,
// so the backend writes the temp file with a matching suffix.
// ============================================================

function blobExtension(
  blob
) {

  const type =
    ((blob && blob.type) || "").toLowerCase();


  if (type.indexOf("jpeg") !== -1 || type.indexOf("jpg") !== -1) {

    return "jpg";

  }


  if (type.indexOf("webp") !== -1) {

    return "webp";

  }


  if (type.indexOf("png") !== -1) {

    return "png";

  }


  // AVIF must be named honestly rather than falling through to the
  // PNG default: the bytes really are AVIF, and the backend decides
  // what to do with them by reading the file, not by its name.
  if (type.indexOf("avif") !== -1) {

    return "avif";

  }


  if (type.indexOf("gif") !== -1) {

    return "gif";

  }


  if (type.indexOf("bmp") !== -1) {

    return "bmp";

  }


  return "png";

}


// ============================================================
// URL INSPECTION HELPERS
//
// Read-only helpers used by the product image diagnostics.
// ============================================================

function urlHostname(
  url
) {

  try {

    return new URL(url).hostname;

  }

  catch (error) {

    return "unparsable";

  }

}


// The extension the URL itself advertises, if any. This is only what
// the address claims: the response Content-Type is the authority,
// which is exactly why both are reported.
function urlFileExtension(
  url
) {

  try {

    const path =
      new URL(url).pathname;

    const match =
      path.match(/\.([a-z0-9]{2,5})$/i);

    return match
      ? match[1].toLowerCase()
      : "none";

  }

  catch (error) {

    return "none";

  }

}


// ============================================================
// SAFE IMAGE METADATA
//
// Logs only the file name, extension, byte size, MIME type and
// pixel dimensions of an outgoing image. Image contents are never
// logged. This exists so the console always shows exactly which
// human and garment image is sent to the backend.
// ============================================================

async function describeImageBlob(
  label,
  fileName,
  blob
) {

  if (!blob) {

    console.warn(
      label + ": no image data"
    );

    return;

  }


  const info = {

    filename: fileName,
    extension: blobExtension(blob),
    mimeType: blob.type || "unknown",
    sizeBytes: blob.size

  };


  try {

    const objectUrl =
      URL.createObjectURL(blob);

    info.dimensions =
      await new Promise(function (resolve) {

        const probe =
          new Image();

        probe.onload = function () {

          resolve(
            probe.naturalWidth +
            "x" +
            probe.naturalHeight
          );

        };

        probe.onerror = function () {

          resolve(
            "unavailable"
          );

        };

        probe.src = objectUrl;

      });

    URL.revokeObjectURL(objectUrl);

  } catch (error) {

    info.dimensions =
      "unavailable";

  }


  console.log(
    label + ":",
    info
  );


  // Returned so callers can act on the result: dimensions of
  // "unavailable" means the bytes are not a decodable image.
  return info;

}


// Development aid: set to true to print the detected category, colour,
// style and fit of every product together with the evidence each one
// came from. It only writes to the console and changes no behaviour,
// so it can be left on while tuning and switched off afterwards.
const DEBUG_ATTRIBUTES = true;

// ============================================================
// ESCAPE HTML
// ============================================================

function escapeHtml(
  text
) {

  const div =
    document.createElement(
      "div"
    );


  div.textContent =
    text;


  return div.innerHTML;

}


// ============================================================
// KEYWORD TABLES
//
// Simple deterministic word matching. A field is only reported
// when one of these words actually appears in the product text.
// ============================================================

// Colour phrases are checked before single words, so "Navy Blue"
// wins over the bare word "blue" and "Olive Green" over "green".
const COLOR_PHRASES = [
  "navy blue", "midnight blue", "sky blue", "light blue",
  "dark blue", "royal blue", "powder blue", "baby blue",
  "off white", "off-white", "charcoal grey", "charcoal gray",
  "olive green", "forest green", "dark green", "light green",
  "dark brown", "light brown", "light grey", "light gray",
  "dark grey", "dark gray", "acid green", "bottle green",
  "baby pink", "light pink", "dark pink", "dusty pink",
  "wine red", "burgundy", "maroon", "mustard",
  "charcoal", "crimson", "coral", "magenta", "lavender",
  "violet", "turquoise", "khaki", "olive", "rust",
  "peach", "ivory", "cream", "beige", "navy", "teal",
  "black", "white", "blue", "red", "green", "yellow",
  "orange", "pink", "purple", "brown", "grey", "gray", "wine"
];

// Style descriptors. Order does not matter (all are single words),
// but these are checked against structured metadata and the title.
const STYLE_KEYWORDS = [
  "casual", "formal", "streetwear", "sport", "sports", "traditional",
  "party", "denim", "printed", "solid", "striped", "floral", "checked",
  "checkered", "graphic", "textured", "embroidered", "embellished",
  "lace", "ribbed", "knitted", "ethnic", "sporty", "western",
  "basic", "minimal"
];

// Fit phrases are checked first ("Slim Fit"), then standalone fit
// words, so an explicit phrase always wins over a weak keyword.
const FIT_PHRASES = [
  "slim fit", "slim-fit", "regular fit", "regular-fit",
  "relaxed fit", "relaxed-fit", "loose fit", "loose-fit",
  "oversized fit", "oversize fit", "skinny fit", "skinny-fit",
  "straight fit", "straight-fit", "tailored fit", "tailored-fit",
  "comfort fit", "comfort-fit", "skin fit", "body fit",
  "fitted fit", "boxy fit"
];

const FIT_KEYWORDS = [
  "oversized", "oversize", "tailored", "relaxed", "regular",
  "slim", "loose", "boxy", "skinny", "straight", "comfort",
  "skin", "fitted", "baggy"
];

const MATERIAL_KEYWORDS = [
  "cotton", "denim", "linen", "silk", "wool", "leather", "polyester",
  "rayon", "fleece", "velvet", "satin", "georgette", "chiffon",
  "knit", "corduroy", "tweed", "suede", "nylon", "spandex",
  "cashmere", "modal", "lycra"
];

const GARMENT_NOUNS = [
  "t-shirt", "tshirt", "shirt", "tee", "top", "blouse", "kurta",
  "kurti", "sweater", "sweatshirt", "hoodie", "jacket", "coat",
  "blazer", "vest", "cardigan", "polo", "tunic", "pullover",
  "dress", "gown", "saree", "sari", "jumpsuit", "kaftan", "frock",
  "jeans", "trouser", "pants", "chino", "shorts", "skirt",
  "leggings", "joggers", "palazzo",
  "shoes", "sneakers", "sandals", "heels", "boots", "loafers",
  "bag", "handbag", "wallet", "watch", "belt", "cap", "hat", "scarf",
  "bra", "bralette", "camisole", "crop top", "shrug", "bolero", "cape"
];

// "Neutral" is a colour family, so it covers these colours.
const NEUTRAL_COLORS = [
  "black", "white", "grey", "gray", "beige", "brown"
];


// ============================================================
// COMPARE (SIDE BY SIDE)
//
// Up to two detected products can be compared. This is a product
// comparison; try-on still runs one product at a time.
// ============================================================

function isSelected(product) {

  return selectedKeys.indexOf(productKey(product)) !== -1;

}

function selectionLabel(product) {

  const index = selectedKeys.indexOf(productKey(product));

  if (index === -1) {

    return "Add to Compare";

  }

  return index === 0
    ? "Selected as A - remove"
    : "Selected as B - remove";

}

function toggleCompare(product) {

  const key = productKey(product);
  const index = selectedKeys.indexOf(key);


  if (index !== -1) {

    selectedKeys.splice(index, 1);

  }

  else if (selectedKeys.length < 2) {

    selectedKeys.push(key);

  }

  else {

    status.textContent =
      "Only two products can be compared. Remove one first.";

    return;

  }


  renderProducts();
  renderCompare();

}

function findProduct(key) {

  for (let i = 0; i < lastProducts.length; i++) {

    if (productKey(lastProducts[i]) === key) {

      return lastProducts[i];

    }

  }

  return null;

}

function compareRow(label, value) {

  const row = document.createElement("div");
  row.className = "compare-row";


  const name = document.createElement("span");
  name.className = "compare-label";
  name.textContent = label + ": ";


  row.appendChild(name);
  row.appendChild(document.createTextNode(value));

  return row;

}

function compareColumn(product, label) {

  const intelligence = productIntelligence(product);

  const column = document.createElement("div");
  column.className = "compare-col";


  column.appendChild(makeRow("compare-head", label));


  const image = document.createElement("img");
  image.src = product.image;
  image.alt = product.title || "Product";
  column.appendChild(image);


  column.appendChild(
    compareRow("Title", product.title || product.alt || "Product")
  );

  column.appendChild(
    compareRow("Price", product.price || "Not detected")
  );

  column.appendChild(
    compareRow("Category", formatCategory(product.category))
  );

  column.appendChild(
    compareRow("Color", detected(intelligence.color))
  );

  column.appendChild(
    compareRow("Style", detected(intelligence.style))
  );

  column.appendChild(
    compareRow("Fit", detected(intelligence.fit))
  );


  return column;

}

function resultColumn(label, url) {

  const column = document.createElement("div");
  column.className = "compare-col";


  column.appendChild(makeRow("compare-head", label));


  const image = document.createElement("img");
  image.src = url;
  image.alt = "Try-on result";
  column.appendChild(image);


  return column;

}

function renderCompare() {

  if (!comparePanel) {

    return;

  }


  comparePanel.innerHTML = "";


  if (selectedKeys.length === 0) {

    comparePanel.appendChild(
      makeRow(
        "compare-hint",
        "Select two products to compare them side by side."
      )
    );

    return;

  }


  const first = findProduct(selectedKeys[0]);


  if (!first) {

    // The selection points at products from an earlier scan.
    selectedKeys = [];

    comparePanel.appendChild(
      makeRow(
        "compare-hint",
        "Select two products to compare them side by side."
      )
    );

    return;

  }


  const second =
    selectedKeys.length > 1 ? findProduct(selectedKeys[1]) : null;


  const box = document.createElement("div");
  box.className = "compare";

  box.appendChild(compareColumn(first, "Product A"));

  if (second) {

    box.appendChild(compareColumn(second, "Product B"));

  }

  comparePanel.appendChild(box);


  if (!second) {

    comparePanel.appendChild(
      makeRow("compare-hint", "Select one more product to compare.")
    );

  }


  // Try-on is started for one product at a time.
  comparePanel.appendChild(
    itemButton(
      second ? "Try On Product A" : "Try On Selected",
      function () {
        performTryOn(first);
      }
    )
  );


  if (second) {

    comparePanel.appendChild(
      itemButton("Try On Product B", function () {
        performTryOn(second);
      })
    );

  }


  // Results already generated are shown side by side.
  const firstRecord = findHistoryRecord(selectedKeys[0]);

  const secondRecord =
    second ? findHistoryRecord(selectedKeys[1]) : null;


  if (
    (firstRecord && firstRecord.result) ||
    (secondRecord && secondRecord.result)
  ) {

    comparePanel.appendChild(
      makeRow("compare-head", "Try-on results")
    );


    const results = document.createElement("div");
    results.className = "compare";


    if (firstRecord && firstRecord.result) {

      results.appendChild(
        resultColumn("Product A", firstRecord.result)
      );

    }


    if (secondRecord && secondRecord.result) {

      results.appendChild(
        resultColumn("Product B", secondRecord.result)
      );

    }


    comparePanel.appendChild(results);

  }


  if (
    second &&
    (!firstRecord || !secondRecord)
  ) {

    comparePanel.appendChild(
      makeRow(
        "compare-result",
        "Try on both products to compare their generated results."
      )
    );

  }

}


// ============================================================
// SMALL HELPERS
// ============================================================

function makeRow(
  className,
  text
) {

  const row =
    document.createElement("div");


  row.className =
    className;


  row.textContent =
    text;


  return row;

}

// Whole-word match, so "vest" does not match "harvest".
function findKeyword(
  text,
  keywords
) {

  for (
    let i = 0;
    i < keywords.length;
    i++
  ) {

    const pattern =
      new RegExp(
        "\\b" +
        keywords[i] +
        "(?:es|s)?\\b",
        "i"
      );


    if (pattern.test(text)) {

      return keywords[i];

    }

  }


  return "";

}

// Multi-word phrase match, e.g. "navy blue". Longer phrases are
// tested first, so the most specific match always wins regardless
// of table order ("Regular Fit" beats a lone "Slim Fit" elsewhere in
// the text). Returns the phrase as written in the table, or "".
function findPhrase(
  text,
  phrases
) {

  // Longest first: "off white" before "white".
  const ordered =
    phrases
      .slice()
      .sort(function (a, b) {

        return b.length - a.length;

      });


  for (
    let i = 0;
    i < ordered.length;
    i++
  ) {

    const pattern =
      new RegExp(
        "\\b" +
        ordered[i].replace(
          /[-\s]+/g,
          "[-\\s]+"
        ) +
        "\\b",
        "i"
      );


    if (pattern.test(text)) {

      return ordered[i];

    }

  }


  return "";
}

// Reads an explicit attribute field such as "Colour: Navy Blue" or
// "Fit Type: Slim Fit" from product metadata. Retailers use many
// spellings, so the label list is intentionally broad. Returns the
// value text, or "".
function explicitField(
  text,
  labels
) {

  for (
    let i = 0;
    i < labels.length;
    i++
  ) {

    const pattern =
      new RegExp(
        "\\b" +
        labels[i] +
        "\\s*[:\\-]\\s*([^,;|\\n]{1,40})",
        "i"
      );

    const match = text.match(pattern);

    if (match) {

      return match[1];

    }

  }


  return "";
}

// Text of one explicit colour field, already cleaned.
const COLOR_LABELS = [
  "colou?r", "color", "colour name", "shade", "fabric colour"
];

const FIT_LABELS = [
  "fit type", "fit", "fitting", "silhouette", "cut", "style fit"
];

// Style may also be given as an explicit labelled field, for
// example "Pattern: Floral" or "Design: Printed".
const STYLE_LABELS = [
  "style", "pattern", "print", "print type", "design", "weave",
  "finish"
];

// Normalized display name, e.g. "off-white" -> "Off White" and
// "navy blue" -> "Navy Blue".
function displayAttribute(
  value
) {

  if (!value) return "";


  const spaced =
    value.replace(
      /[-\s]+/g,
      " "
    ).trim();

  if (!spaced) return "";


  return spaced
    .split(" ")
    .map(function (word) {

      if (!word) return "";

      return (
        word.charAt(0).toUpperCase() +
        word.slice(1)
      );

    })
    .join(" ");

}

// Colour detection. An explicit colour field always wins over words
// in the title, so a generic "white" inside unrelated metadata can
// never override a real "Colour: Navy Blue". No image analysis is
// used and nothing is invented.
function detectColor(
  parts
) {

  // 1. Explicit colour field.
  const field =
    explicitField(
      parts.meta,
      COLOR_LABELS
    );

  if (field) {

    const value =
      findPhrase(
        field.toLowerCase(),
        COLOR_PHRASES
      );

    if (value) return value;

  }


  // 2. Phrases in the product text (longest / most specific first).
  const named =
    findPhrase(
      parts.text,
      COLOR_PHRASES
    );

  if (named) return named;


  // 3. Last resort: the dominant colour sampled from the product
  // image itself. This is only reached when no structured or textual
  // colour exists at all, and the sampler refuses to answer when the
  // picture is ambiguous, so it can never overwrite real evidence.
  if (parts.imageColor) return parts.imageColor;

  return "";
}

// Style detection. Uses the same evidence priority as colour: an
// explicit labelled field ("Pattern: Floral") wins, then the title
// and alt text. Nothing is invented.
function detectStyle(
  parts
) {

  // 1. Explicit style / pattern field.
  const field =
    explicitField(
      parts.meta,
      STYLE_LABELS
    );

  if (field) {

    const value =
      findKeyword(
        field.toLowerCase(),
        STYLE_KEYWORDS
      );

    if (value) return value;

  }


  // 2. Title / alt text.
  return findKeyword(
    parts.text,
    STYLE_KEYWORDS
  );

}

// Fit detection. Explicit "Slim Fit" style phrases beat standalone
// fit words, so an unrelated brand phrase containing "slim" is not
// enough on its own.
function detectFit(
  parts
) {

  // 1. Explicit fit field.
  const field =
    explicitField(
      parts.meta,
      FIT_LABELS
    );

  if (field) {

    const value =
      fitValue(
        field
      );

    if (value) return value;

  }


  // 2. Explicit fit phrases in the product text.
  const phrase =
    findPhrase(
      parts.text,
      FIT_PHRASES
    );

  if (phrase) return fitValue(phrase);


  // 3. Standalone fit words.
  const word = fitValue(parts.text);

  if (word) return word;

  // 4. Nothing textual. Fit is never inferred from the image - a
  // silhouette cannot be read reliably from a product photo, so
  // "Not detected" is the honest answer here.
  return "";

}

// Which evidence level produced the colour. Mirrors the priority
// inside detectColor, so it never disagrees with the value.
function colorSourceOf(
  parts,
  value
) {

  if (!value) return "none";

  if (explicitField(parts.meta, COLOR_LABELS)) return "metadata";

  if (findPhrase(parts.title, COLOR_PHRASES)) return "title";

  if (findPhrase(parts.text, COLOR_PHRASES)) return "card text";

  if (parts.imageColor) return "image";

  return "none";

}

function fitSourceOf(
  parts,
  value
) {

  if (!value) return "none";

  if (explicitField(parts.meta, FIT_LABELS)) return "metadata";

  if (findPhrase(parts.title, FIT_PHRASES)) return "title";

  if (findPhrase(parts.text, FIT_PHRASES)) return "card text";

  if (fitValue(parts.text)) return "card text";

  return "none";

}

function styleSourceOf(
  parts,
  value
) {

  if (!value) return "none";

  if (explicitField(parts.meta, STYLE_LABELS)) return "metadata";

  if (findKeyword(parts.title, STYLE_KEYWORDS)) return "title";

  if (findKeyword(parts.text, STYLE_KEYWORDS)) return "card text";

  return "none";

}

// Normalizes any fit source (field, phrase or free text) to a
// single canonical fit value.
function fitValue(
  value
) {

  const text =
    String(value || "").toLowerCase();

  if (!text) return "";


  const phrase =
    findPhrase(
      text,
      FIT_PHRASES
    );

  if (phrase) {

    return phrase
      .replace(
        /[-\s]+fit$/,
        ""
      );

  }


  for (
    let i = 0;
    i < FIT_KEYWORDS.length;
    i++
  ) {

    if (
      new RegExp(
        "\\b" +
        FIT_KEYWORDS[i] +
        "\\b",
        "i"
      ).test(text)
    ) {

      return FIT_KEYWORDS[i];

    }

  }


  return "";
}

function titleCase(
  value
) {

  if (!value) {

    return "";

  }


  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );

}

// Shows the detected keyword, or "Not detected".
function detected(
  value
) {

  return value
    ? titleCase(value)
    : "Not detected";

}

function formatCategory(
  category
) {

  if (
    !category ||
    category === "unknown"
  ) {

    return "Not detected";

  }


  return titleCase(
    category.replace(
      "_",
      " "
    )
  );

}


// ============================================================
// TRY-ON CATEGORY
//
// Our own application-level field. IDM-VTON only supports
// upper_body / lower_body / dresses, so anything else falls
// back to upper_body. The model call itself is unchanged.
// ============================================================

function tryOnCategory(
  category
) {

  if (
    category === "upper_body" ||
    category === "lower_body" ||
    category === "dresses"
  ) {

    return category;

  }


  return "upper_body";

}


// ============================================================
// TABS
// ============================================================

const tabButtons =
  document.querySelectorAll(".tab");

function showTab(name) {

  activeTab = name;

  tabButtons.forEach(function (button) {

    button.className =
      button.getAttribute("data-tab") === name ? "tab active" : "tab";

  });


  document.querySelectorAll(".tab-panel").forEach(function (panel) {

    panel.className =
      panel.id === "panel-" + name ? "tab-panel active" : "tab-panel";

  });


  // A finished try-on status (completed / failed / progress) only
  // belongs to the shop context. Switching tabs must not leave it
  // floating above unrelated content; while a try-on is actually
  // running its progress message is kept.
  if (!generating && isTryOnStatus(status.textContent)) {

    status.textContent = "";

  }

}


// ============================================================
// TRY-ON PROGRESS
//
// The backend does not report real progress, so only the real
// stages are shown, together with an elapsed timer. No percentage
// is invented.
// ============================================================

const STAGES = [
  "Preparing profile",
  "Preparing product image",
  "Sending to AI model",
  "Generating result (this can take a few minutes)",
  "Finalizing result"
];

function formatElapsed(seconds) {

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return (
    (minutes < 10 ? "0" : "") + minutes + ":" +
    (rest < 10 ? "0" : "") + rest
  );

}

function buildProgress() {

  progressContainer.innerHTML = "";

  stageRow = makeRow("stage", "");
  timerRow = makeRow("timer", "00:00");

  progressContainer.appendChild(stageRow);
  progressContainer.appendChild(makeRow("timer-label", "Generating..."));
  progressContainer.appendChild(timerRow);

}

function setStage(number) {

  currentStage = number;

  if (stageRow) {

    stageRow.textContent =
      "Stage " + number + " of " + STAGES.length + ": " +
      STAGES[number - 1];

  }

}

function startTimer() {

  elapsedSeconds = 0;

  buildProgress();
  setStage(1);

  timerHandle = setInterval(function () {

    elapsedSeconds++;

    if (timerRow) {

      timerRow.textContent = formatElapsed(elapsedSeconds);

    }

    // The model reports no progress, so stage 4 is shown once the
    // request has been in flight for a few seconds.
    if (currentStage === 3 && elapsedSeconds >= 5) {

      setStage(4);

    }

  }, 1000);

}

function stopTimer() {

  if (timerHandle !== null) {

    clearInterval(timerHandle);

    timerHandle = null;

  }

}


// ============================================================
// TRY-ON BUTTON STATE
// ============================================================

function setTryOnBusy(busy, button) {

  generating = busy;

  document.querySelectorAll(".tryon").forEach(function (item) {

    item.disabled = busy;

    item.textContent =
      busy && item === button ? "Generating..." : "Try On";

  });

  document.querySelectorAll(".select-btn").forEach(function (item) {

    item.disabled = busy;

  });

}


// ============================================================
// READABLE ERRORS
//
// Raw technical details stay in the console; the user only sees a
// readable sentence.
// ============================================================

function friendlyError(error) {

  // The backend already returned a short readable message - it is
  // shown as-is (never a stack trace).
  if (error && error.friendlyMessage) {

    return error.friendlyMessage;

  }

  const text = String((error && error.message) || error || "");


  if (text.indexOf("product image") !== -1) {

    return "The product image could not be downloaded. Try another product or open the product page.";

  }


  if (text === "model failed") {

    return "The AI model could not generate a result. Please try again in a moment.";

  }


  if (text.indexOf("Backend error") !== -1) {

    return "The try-on backend returned an error. Check the backend logs for details.";

  }


  if (
    text.indexOf("Failed to fetch") !== -1 ||
    text.indexOf("NetworkError") !== -1
  ) {

    return "The try-on service is not reachable. Start the backend (uvicorn main:app) and try again.";

  }


  if (text.indexOf("Invalid profile image") !== -1) {

    return "Your saved profile photo could not be read. Please upload it again.";

  }


  return "Something went wrong during try-on. Please try again.";

}


// ============================================================
// RECORDS
//
// Only URLs and short text are stored. The profile photo is never
// copied into history or the wardrobe.
// ============================================================

function productKey(product) {

  return (
    product.productUrl ||
    product.image ||
    product.title ||
    "product"
  );

}

function formatDate(timestamp) {

  try {

    return new Date(timestamp).toLocaleString(
      undefined,
      {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      }
    );

  }

  catch (error) {

    return "";

  }

}

// ============================================================
// NORMALIZED PRODUCT
//
// One product object feeds every component: Product Intelligence,
// Profile Match, Compare, History, Wardrobe and try-on. colour,
// style and fit are extracted once here, so no component
// re-extracts them from the title.
// ============================================================

// Shopping metadata markers shared with the content script. The
// title is cut at the first marker so only the product name is kept.
const TITLE_METADATA_PATTERN =
  /(?:sizes?\s*:|mrp\b|price\s*:|\b(?:rs\.?|inr|usd|eur|gbp)\s*\d|[₹$€£]\s*\d|\d+(?:\.\d+)?\s*%\s*off\b|\(\s*\d+(?:\.\d+)?\s*%\s*off\s*\))/i;

// Removes size/price/discount metadata from a stored or incoming
// title and splits words the retailer glued together, e.g.
// "RouteWomen Cotton ShrugSizes: XLRs. 468" -> "Route Women Cotton
// Shrug". Only recognizable shopping patterns are removed - single
// letters inside real names are never stripped.
function cleanProductTitle(raw) {

  if (!raw) return "";

  let text = String(raw).replace(/\s+/g, " ").trim();

  const cutoff = text.search(TITLE_METADATA_PATTERN);

  if (cutoff > 0) {
    text = text.slice(0, cutoff);
  }

  text = text.replace(/\b(?:sizes?|size)\s*:\s*[A-Za-z0-9,\s\/-]+/gi, "");
  text = text.replace(/(?:(?:rs\.?|inr|usd|eur|gbp|[₹$€£])\s*[\d.,]+)+/gi, "");
  text = text.replace(/\(\s*\d+(?:\.\d+)?\s*%\s*off\s*\)/gi, "");
  text = text.replace(/\b\d+(?:\.\d+)?\s*%\s*off\b/gi, "");

  // Glued brand/name words: "QuotientWomen" -> "Quotient Women".
  text = text.replace(/([a-z0-9])([A-Z])/g, "$1 $2");

  return text.replace(/[\s\-_,:;|·•]+$/, "").trim();
}

// Trims a brand value to something displayable. Returns "" when the
// value is missing or is really a piece of the product name.
function cleanBrand(
  value
) {

  const text = String(value || "").trim();

  if (!text) return "";

  if (text.length > 40) return "";

  // A garment noun means this is the product name, not the brand.
  if (/shirt|tshirt|t-?shirt|top|dress|jeans|pants|skirt|shrug|saree|suit|coat|lehenga|salwar|kurti|palazzo|jacket/i
    .test(text)) {

    return "";

  }

  return text;

}

// Removes a leading brand from a product name so the two are not
// displayed twice. "Style Quotient Women Short sleeves shrug" with the
// brand "Style Quotient" becomes "Women Short sleeves shrug".
function splitBrand(
  value,
  brand
) {

  const text = String(value || "").trim();

  if (!text || !brand) return text;

  const lowerText = text.toLowerCase();
  const lowerBrand = brand.toLowerCase();

  if (lowerText === lowerBrand) return "";

  if (lowerText.indexOf(lowerBrand) === 0) {

    const rest = text.slice(brand.length).replace(/^[\s\-_,:;|·•]+/, "");

    // Only strip when something meaningful is left.
    return rest.length >= 3 ? rest : text;

  }

  return text;

}

// "Rs. 674" / "Rs.1,399" / "INR 799" / "₹ 674" -> "₹674".
// Any other currency format is left untouched. Idempotent.
function normalizePrice(value) {

  const text = String(value || "").trim();

  if (!text) return "";

  const match = text.match(/(?:rs\.?|inr|₹)\s*([\d.,]+)/i);

  return match ? "₹" + groupDigits(match[1]) : text;
}
// Indian digit grouping, as used on Indian storefronts:
// "1199" -> "1,199" and "1234567" -> "12,34,567". Digits only, so it
// is safe to re-run on an already grouped value.
function groupDigits(value) {

  const raw = String(value || "").replace(/[^\d]/g, "");

  if (!raw) return "";

  if (raw.length <= 3) return raw;

  // Last three digits, then pairs.
  const last = raw.slice(-3);
  let rest = raw.slice(0, -3);

  if (rest.length > 2) {

    rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");

  }

  return rest + "," + last;

}

// "48% off" -> "48% OFF". Idempotent.
function normalizeDiscount(value) {

  const text = String(value || "").trim();

  if (!text) return "";

  const match = text.match(/(\d+(?:\.\d+)?)\s*%?\s*off/i);

  return match ? match[1] + "% OFF" : text;

}



// Cleans a record loaded from storage (history / wardrobe) so old
// polluted titles display clean without clearing stored data.
function sanitizeStoredRecord(record) {

  if (!record || typeof record !== "object") return record;

  const clean = Object.assign({}, record);

  const title = cleanProductTitle(clean.title);

  if (title) clean.title = title;

  clean.price = normalizePrice(clean.price);

  if (clean.mrp !== undefined) clean.mrp = normalizePrice(clean.mrp);

  if (clean.originalPrice !== undefined) {

    clean.originalPrice = normalizePrice(clean.originalPrice);

  }

  if (clean.brand !== undefined) clean.brand = cleanBrand(clean.brand);

  return clean;
}

function normalizeProduct(raw) {

  const source = raw || {};

  // Brand is its own field. Retail cards put it in front of the
  // product name, so it is lifted out here and never shown as part of
  // the title.
  const brand =
    cleanBrand(
      source.brand
    );


  const title =
    cleanProductTitle(
      splitBrand(
        source.title || source.alt,
        brand
      ) || source.title || source.alt
    ) || "Product";


  const alt =
    cleanProductTitle(source.alt) || title;


  // Text used for attribute detection only - the displayed title is
  // never changed. Priority: explicit card metadata, then title,
  // then the product-card text (description, variant, aria-labels,
  // data attributes), then a last-resort image sample.
  const details =
    String(source.details || "").toLowerCase();

  // The original, un-stripped title is still used as evidence, so a
  // brand that contains a colour or fit word ("Blue Island Shirt")
  // is not lost when it is split out of the displayed title.
  const rawTitle =
    String(source.title || source.alt || "");

  const parts = {

    meta: String(source.meta || "").toLowerCase(),

    // Title and alt alone, so a source can be attributed correctly.
    title: (
      rawTitle + " " + alt
    ).toLowerCase(),

    // Everything product-specific, in priority order.
    text: (
      rawTitle + " " + alt + " " + details
    ).toLowerCase(),

    imageColor: String(source.imageColor || "")

  };


  const url =
    source.productUrl || source.url || "";


  const color = detectColor(parts);
  const style = detectStyle(parts);
  const fit = detectFit(parts);

  const price = normalizePrice(source.price);
  const originalPrice = normalizePrice(source.mrp);
  const discount = normalizeDiscount(source.discount);

  // One development aid: the evidence behind every attribute, so a
  // surprising result can be traced without guessing.
  if (DEBUG_ATTRIBUTES) {

    console.log(
      "Product: " + (brand ? brand + " - " : "") + title +
      "\nBrand: " + (brand || "Not detected") +
      "\nColor: " + (color || "Not detected") +
      "\nColor source: " + colorSourceOf(parts, color) +
      "\nStyle: " + (style || "Not detected") +
      "\nStyle source: " + styleSourceOf(parts, style) +
      "\nFit: " + (fit || "Not detected") +
      "\nFit source: " + fitSourceOf(parts, fit) +
      "\nCategory: " + (source.category || "unknown") +
      "\nPrice: " + (price || "Not detected") +
      "\nOriginal price: " + (originalPrice || "Not detected") +
      "\nDiscount: " + (discount || "Not detected")
    );

  }


  return {

    id: source.id,

    image: source.image || "",

    alt: alt,

    brand: brand,

    title: title,

    price: price,

    originalPrice: originalPrice,

    mrp: originalPrice,

    discount: discount,

    category: source.category || "unknown",

    color: color,

    colorSource: colorSourceOf(parts, color),

    style: style,

    styleSource: styleSourceOf(parts, style),

    fit: fit,

    fitSource: fitSourceOf(parts, fit),

    url: url,

    productUrl: url,

    retailer:
      source.retailer ||
      domainFrom(url || currentPageUrl)

  };

}


function buildRecord(product, resultUrl) {

  return {

    key: productKey(product),
    brand: product.brand || "",
    title: product.title || product.alt || "Product",
    image: product.image || "",
    result: resultUrl || "",
    category: product.category || "unknown",
    price: product.price || "",
    mrp: product.mrp || "",
    originalPrice: product.originalPrice || product.mrp || "",
    discount: product.discount || "",
    retailer: product.retailer || domainFrom(product.productUrl || currentPageUrl),
    productUrl: product.productUrl || product.url || "",
    timestamp: Date.now()

  };

}

function itemButton(label, handler) {

  const button = document.createElement("button");

  button.className = "secondary";
  button.textContent = label;

  button.addEventListener("click", handler);

  return button;

}


// ============================================================
// PRODUCT INTELLIGENCE
//
// Reports only keywords found in the product title.
// ============================================================

function productIntelligence(
  product
) {

  // The normalized product object already carries the extracted
  // colour / style / fit, so nothing is re-read from the title
  // here. The keyword scan only runs as a fallback for product
  // shapes that bypassed normalization.
  if (
    product &&
    product.color !== undefined &&
    product.style !== undefined &&
    product.fit !== undefined
  ) {

    return {

      category:
        product.category || "unknown",

      color:
        product.color || "",

      style:
        product.style || "",

      fit:
        product.fit || ""

    };

  }


  const text =
    (
      (product.title || "") +
      " " +
      (product.alt || "")
    ).toLowerCase();


  // Legacy product shapes that bypassed normalization still get the
  // same improved detection, so every consumer behaves identically.
  const parts = {

    meta: "",

    text: text

  };


  return {

    category:
      product.category || "unknown",

    color:
      detectColor(parts),

    style:
      findKeyword(text, STYLE_KEYWORDS),

    fit:
      detectFit(parts)

  };

}

// One attribute / value line in the compact two-column panel.
function attributeRow(
  label,
  value
) {

  const row =
    document.createElement("div");

  row.className =
    "attr-row";


  const key =
    document.createElement("span");

  key.className =
    "attr-key";

  key.textContent =
    label;


  const val =
    document.createElement("span");

  val.className =
    "attr-value";

  val.textContent =
    value;


  row.appendChild(key);
  row.appendChild(val);

  return row;

}

function intelligenceBlock(
  intelligence,
  category
) {

  const box =
    document.createElement("div");


  box.className =
    "intel";


  box.appendChild(
    makeRow(
      "block-title",
      "Product Intelligence"
    )
  );


  // Compact two-column panel. Values come from the normalized
  // product object, never from a fresh title scan.
  box.appendChild(
    attributeRow(
      "Category",
      formatCategory(category)
    )
  );


  box.appendChild(
    attributeRow(
      "Color",
      displayAttribute(intelligence.color) || "Not detected"
    )
  );


  box.appendChild(
    attributeRow(
      "Style",
      displayAttribute(intelligence.style) || "Not detected"
    )
  );


  box.appendChild(
    attributeRow(
      "Fit",
      displayAttribute(intelligence.fit) || "Not detected"
    )
  );


  return box;

}


// ============================================================
// TRY-ON HISTORY
//
// The newest HISTORY_LIMIT results are kept in chrome.storage.local.
// The same product is never stored twice, and no image data is kept.
// ============================================================

function saveHistory() {

  chrome.storage.local.set({
    tryonHistory: tryonHistory
  });

}

function addHistoryRecord(record) {

  tryonHistory = tryonHistory.filter(function (item) {

    return item.key !== record.key;

  });


  tryonHistory.unshift(record);


  if (tryonHistory.length > HISTORY_LIMIT) {

    tryonHistory = tryonHistory.slice(0, HISTORY_LIMIT);

  }


  saveHistory();

  renderHistory();

}

function findHistoryRecord(key) {

  for (let i = 0; i < tryonHistory.length; i++) {

    if (tryonHistory[i].key === key) {

      return tryonHistory[i];

    }

  }

  return null;

}

function renderHistory() {

  historyList.innerHTML = "";


  if (tryonHistory.length === 0) {

    historyList.appendChild(
      makeRow("empty", "No try-ons yet.")
    );

  }


  else {

    tryonHistory.forEach(function (record) {

      historyList.appendChild(
        createHistoryItem(record)
      );

    });

  }


  renderCompare();

}

function createHistoryItem(record) {

  const item = document.createElement("div");
  item.className = "item";


  const image = document.createElement("img");
  image.className = "item-img";
  image.src = record.image;
  image.alt = record.title;


  const body = document.createElement("div");
  body.className = "item-body";


  body.appendChild(
    makeRow("item-title", record.title)
  );

  body.appendChild(
    makeRow(
      "item-meta",
      [
        record.price,
        formatCategory(record.category),
        record.retailer,
        formatDate(record.timestamp)
      ].filter(function (part) {
        return part;
      }).join(" - ")
    )
  );


  const actions = document.createElement("div");
  actions.className = "item-actions";

  actions.appendChild(
    itemButton("View", function () {
      toggleResult(item, record);
    })
  );

  actions.appendChild(
    itemButton("Try Again", function () {
      tryAgain(record);
    })
  );

  actions.appendChild(
    itemButton("Delete", function () {
      deleteHistoryRecord(record.key);
    })
  );

  body.appendChild(actions);


  item.appendChild(image);
  item.appendChild(body);

  return item;

}

// Shows or hides the generated result inside a list item.
function toggleResult(item, record) {

  const existing = item.querySelector(".item-result");

  if (existing) {

    item.removeChild(existing);

    return;

  }


  if (!record.result) {

    return;

  }


  const box = document.createElement("div");
  box.className = "item-result";


  const image = document.createElement("img");
  image.src = record.result;
  image.alt = "Try-on result";


  box.appendChild(image);

  item.appendChild(box);

}

function deleteHistoryRecord(key) {

  tryonHistory = tryonHistory.filter(function (item) {

    return item.key !== key;

  });


  saveHistory();

  renderHistory();

  status.textContent = "History item removed.";

}

function clearHistory() {

  if (tryonHistory.length === 0) {

    status.textContent = "There is no history to clear.";

    return;

  }


  if (!window.confirm("Clear all try-on history?")) {

    return;

  }


  tryonHistory = [];

  saveHistory();

  renderHistory();

  status.textContent = "Try-on history cleared.";

}

// Runs the try-on again for a saved item.
function tryAgain(record) {

  const product = normalizeProduct({

    id: -1,
    image: record.image,
    alt: record.title,
    title: record.title,
    price: record.price,
    productUrl: record.productUrl,
    category: record.category,
    retailer: record.retailer

  });


  showTab("shop");

  performTryOn(product);

}


// ============================================================
// PROFILE MATCH
//
// Transparent preference comparison. No scores and no percentages.
// ============================================================

function preferenceMatches(
  attribute,
  value,
  preference
) {

  if (
    attribute === "Color" &&
    preference === "neutral"
  ) {

    return NEUTRAL_COLORS.indexOf(value) !== -1;

  }


  return value === preference;

}

function matchRow(
  attribute,
  value,
  preference
) {

  const row =
    document.createElement("div");


  if (!value) {

    row.className =
      "match-row match-none";

    row.textContent =
      "— " + attribute + ": Not detected";

    return row;

  }


  const shown =
    displayAttribute(value);


  // "Any" means the user has no preference.
  if (
    !preference ||
    preference === "any"
  ) {

    row.className =
      "match-row match-none";

    row.textContent =
      "— " + attribute + ": " + shown +
      " (no preference set)";

    return row;

  }


  if (
    preferenceMatches(
      attribute,
      value,
      preference
    )
  ) {

    row.className =
      "match-row match-yes";

    row.textContent =
      "✓ " + attribute + ": " + shown;

    return row;

  }


  row.className =
    "match-row match-no";

  row.textContent =
    "✕ " + attribute + ": " + shown +
    " (you prefer " +
    displayAttribute(preference) + ")";

  return row;

}

function matchBlock(
  intelligence
) {

  const box =
    document.createElement("div");


  box.className =
    "intel";


  box.appendChild(
    makeRow(
      "block-title",
      "Profile Match"
    )
  );


  box.appendChild(
    matchRow(
      "Style",
      intelligence.style,
      profilePreferences.style
    )
  );


  box.appendChild(
    matchRow(
      "Color",
      intelligence.color,
      profilePreferences.color
    )
  );


  box.appendChild(
    matchRow(
      "Fit",
      intelligence.fit,
      profilePreferences.fit
    )
  );


  return box;

}


// ============================================================
// VIRTUAL WARDROBE
//
// Items saved after a successful try-on. Stored in
// chrome.storage.local as URLs and text only.
// ============================================================

function saveWardrobe() {

  chrome.storage.local.set({
    wardrobe: wardrobe
  });

}

function isInWardrobe(key) {

  return wardrobe.some(function (item) {

    return item.key === key;

  });

}

function saveToWardrobe(record) {

  const item = {

    key: record.key,
    title: record.title,
    image: record.image,
    result: record.result,
    price: record.price || "",
    category: record.category,
    retailer: record.retailer,
    productUrl: record.productUrl,
    addedAt: Date.now()

  };


  // The same item is never stored twice.
  wardrobe = wardrobe.filter(function (existing) {

    return existing.key !== item.key;

  });


  wardrobe.unshift(item);


  if (wardrobe.length > WARDROBE_LIMIT) {

    wardrobe = wardrobe.slice(0, WARDROBE_LIMIT);

  }


  saveWardrobe();

  renderWardrobe();

}

function renderWardrobe() {

  wardrobeList.innerHTML = "";


  if (wardrobe.length === 0) {

    wardrobeList.appendChild(
      makeRow("empty", "Your wardrobe is empty.")
    );

    return;

  }


  wardrobe.forEach(function (item) {

    wardrobeList.appendChild(
      createWardrobeItem(item)
    );

  });

}

function createWardrobeItem(item) {

  const box = document.createElement("div");
  box.className = "item";


  const image = document.createElement("img");
  image.className = "item-img";
  image.src = item.result || item.image;
  image.alt = item.title;


  const body = document.createElement("div");
  body.className = "item-body";


  body.appendChild(
    makeRow("item-title", item.title)
  );

  body.appendChild(
    makeRow(
      "item-meta",
      [
        item.price,
        formatCategory(item.category),
        item.retailer,
        formatDate(item.addedAt)
      ].filter(function (part) {
        return part;
      }).join(" - ")
    )
  );


  const actions = document.createElement("div");
  actions.className = "item-actions";

  actions.appendChild(
    itemButton("View", function () {
      toggleResult(box, item);
    })
  );

  if (item.productUrl) {

    actions.appendChild(
      itemButton("Open Product", function () {
        openUrl(item.productUrl);
      })
    );

  }

  actions.appendChild(
    itemButton("Remove", function () {
      removeWardrobeItem(item.key);
    })
  );

  body.appendChild(actions);


  box.appendChild(image);
  box.appendChild(body);

  return box;

}

function removeWardrobeItem(key) {

  wardrobe = wardrobe.filter(function (item) {

    return item.key !== key;

  });


  saveWardrobe();

  renderWardrobe();

  status.textContent = "Item removed from the wardrobe.";

}

function clearWardrobe() {

  if (wardrobe.length === 0) {

    status.textContent = "The wardrobe is already empty.";

    return;

  }


  if (!window.confirm("Clear all wardrobe items?")) {

    return;

  }


  wardrobe = [];

  saveWardrobe();

  renderWardrobe();

  status.textContent = "Wardrobe cleared.";

}


// ============================================================
// WEBSITE / CATEGORY HELPERS
// ============================================================

function domainFrom(
  url
) {

  if (!url) {

    return "";

  }


  try {

    return new URL(url)
      .hostname
      .replace(/^www\./i, "");

  }

  catch (error) {

    return "";

  }

}

// Short, readable form of a product URL for display, e.g.
// "myntra.com/product". The full URL is always kept internally.
function shortUrl(
  url
) {

  const host =
    domainFrom(url);

  if (!host) return "";


  try {

    const parts =
      new URL(url).pathname
        .split("/")
        .filter(function (part) {

          return part && part.length <= 40;

        });

    return (
      host +
      (parts.length ? "/" + parts[0] : "")
    );

  }

  catch (error) {

    return host;

  }

}

// Only these categories are used with the current try-on model.
function isTryOnSupported(
  category
) {

  return (
    category === "upper_body" ||
    category === "lower_body" ||
    category === "dresses"
  );

}


// ============================================================
// RESULT ACTIONS
//
// NOTE: the image is displayed exactly as IDM-VTON generated it.
// The model is a virtual try-on diffusion model and can produce
// artifacts that were not in the input photo - for example a
// duplicated hand or an extra limb near the edge of the garment.
//
// That is a generation artifact, not a rendering problem here, so
// no cleanup, cropping or filtering is applied in the frontend and
// the working inference pipeline is left untouched. A cleaner
// front-facing profile image with the arms clearly separated from
// the torso reduces these artifacts on the next live run.
// ============================================================

function showResult(record) {

  resultContainer.innerHTML = "";

  progressContainer.style.display = "none";


  const title = document.createElement("div");
  title.className = "result-title";
  // Only reached when the live IDM-VTON call actually returned a new
  // image, so this heading is always accurate.
  title.textContent = "Live AI Try-On Result";


  const image = document.createElement("img");
  image.src = record.result;
  image.alt = "Live AI virtual try-on result generated by IDM-VTON";

  // Makes a failed result image visible in the console with the
  // exact URL that could not be loaded, instead of a silent
  // broken image inside the popup.
  image.onerror = function () {

    console.error(
      "Try-on result image failed to load:",
      image.src
    );

  };


  const actions = document.createElement("div");
  actions.className = "result-actions";


  const wardrobeButton = itemButton(
    isInWardrobe(record.key) ? "Saved to Wardrobe" : "Save to Wardrobe",
    function () {

      saveToWardrobe(record);

      wardrobeButton.textContent = "Saved to Wardrobe";

      status.textContent = "Saved to your wardrobe.";

    }
  );

  actions.appendChild(wardrobeButton);


  if (record.productUrl) {

    actions.appendChild(
      itemButton("View Product", function () {
        openUrl(record.productUrl);
      })
    );

  }


  actions.appendChild(
    itemButton("Download Result", function () {
      downloadResult(record.result);
    })
  );


  actions.appendChild(
    itemButton("Try Another Product", tryAnother)
  );


  resultContainer.appendChild(title);
  resultContainer.appendChild(image);
  resultContainer.appendChild(actions);

}

// DEMO MODE RESULT
//
// Shown only when the backend reports that live generation is
// unavailable (exhausted free GPU quota) and supplies a previously
// generated IDM-VTON result. The image is clearly labelled, it is
// not written to History, and it is never presented as a new live
// generation. The live result view above is unchanged.
function showDemoResult(
  product,
  data
) {

  resultSection.style.display =
    "block";


  progressContainer.style.display =
    "none";


  resultContainer.innerHTML =
    "";


  const title =
    document.createElement("div");

  title.className =
    "result-title";

  title.textContent =
    "Virtual Try-On Result";


  // Informational, not an error. The free ZeroGPU inference quota is
  // exhausted, so no new image could be produced for this request.
  const notice =
    makeRow(
      "notice",
      "Live generation temporarily unavailable " +
      "due to inference quota."
    );


  // States plainly that the image is a genuine earlier result rather
  // than something produced by the request that just ran.
  const caption =
    makeRow(
      "result-caption",
      "Previously generated IDM-VTON result"
    );


  const note =
    makeRow(
      "notice",
      "This result was generated earlier using the " +
      "same IDM-VTON pipeline."
    );


  const image =
    document.createElement("img");

  image.src =
    resultImageUrl(
      data
    );

  image.alt =
    "Previously generated IDM-VTON result";


  const actions =
    document.createElement("div");

  actions.className =
    "result-actions";

  // Offered so the demo image can be kept, but never recorded as a
  // new try-on in History.
  actions.appendChild(
    itemButton(
      "Download Result",
      function () {

        downloadResult(
          resultImageUrl(
            data
          )
        );

      }
    )
  );

  actions.appendChild(
    itemButton(
      "Try Another Product",
      tryAnother
    )
  );


  if (product && product.productUrl) {

    actions.appendChild(
      itemButton(
        "View Product",
        function () {

          openUrl(
            product.productUrl
          );

        }
      )
    );

  }


  resultContainer.appendChild(title);
  resultContainer.appendChild(notice);
  resultContainer.appendChild(caption);
  resultContainer.appendChild(image);
  resultContainer.appendChild(note);
  resultContainer.appendChild(actions);


  setTryOnStatus(
    "Showing a previously generated IDM-VTON result",
    true
  );

}


function tryAnother() {

  resultSection.style.display = "none";

  progressContainer.style.display = "none";

  status.textContent = "Select another product to try on.";

  window.scrollTo(0, 0);

}

function downloadResult(url) {

  fetch(url)
    .then(function (response) {

      if (!response.ok) {

        throw new Error("download failed");

      }

      return response.blob();

    })
    .then(function (blob) {

      // A blob URL keeps the download local, so no extra browser
      // permission is needed.
      const objectUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "virtual-tryon-" + Date.now() + ".png";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(objectUrl);

      status.textContent = "Result downloaded.";

    })
    .catch(function (error) {

      console.error("Download failed:", error);

      status.textContent =
        "The result could not be downloaded. Opening it in a new tab.";

      openUrl(url);

    });

}

function openUrl(url) {

  if (!url) {

    status.textContent = "No product page was detected for this item.";

    return;

  }

  chrome.tabs.create({
    url: url
  });

}


// ============================================================
// CONTROL WIRING
// ============================================================

tabButtons.forEach(function (button) {

  button.addEventListener("click", function () {

    showTab(button.getAttribute("data-tab"));

  });

});

clearHistoryButton.addEventListener("click", clearHistory);
privacyClearHistoryButton.addEventListener("click", clearHistory);
clearWardrobeButton.addEventListener("click", clearWardrobe);
privacyClearWardrobeButton.addEventListener("click", clearWardrobe);