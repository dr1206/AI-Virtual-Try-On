import hashlib
import os
import glob
import shutil
import sys
import tempfile
import traceback
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from gradio_client import Client, handle_file
from huggingface_hub import get_token


# ============================================================
# CONFIGURATION
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
RESULTS_DIR = BASE_DIR / "results"

RESULTS_DIR.mkdir(parents=True, exist_ok=True)

HF_SPACE = "yisol/IDM-VTON"


# ============================================================
# INPUT IMAGE PREPARATION
#
# The validator/normaliser lives in its own module. This file is
# guarded against performing any image decoding of its own, and it
# must stay that way, so the endpoint only calls into it.
#
# It validates that the uploaded bytes really are an image and
# re-encodes anything the upstream model cannot decode (for example
# AVIF, which some retail CDNs return for a .jpg URL when the request
# advertises AVIF support).
# ============================================================

sys.path.insert(0, str(BASE_DIR))

from image_input_prep import (  # noqa: E402
    ImageNotUsable,
    prepare_input_image
)


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(
    title="AI Virtual Try-On API",
    description="FastAPI backend for AI Virtual Try-On using IDM-VTON",
    version="1.0.0",
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# STATIC RESULT FILES
# ============================================================

app.mount(
    "/results",
    StaticFiles(directory=str(RESULTS_DIR)),
    name="results",
)


# ============================================================
# HUGGING FACE CLIENT
# ============================================================

HF_TOKEN = get_token()

if not HF_TOKEN:
    raise RuntimeError(
        "Hugging Face token not found. "
        "Please authenticate using `hf auth login`."
    )

print("=" * 60)
print("Connecting to IDM-VTON Hugging Face Space...")
print("=" * 60)

client = Client(
    HF_SPACE,
    token=HF_TOKEN
)

print("IDM-VTON client loaded successfully.")
print("=" * 60)


# ============================================================
# BASIC ROUTES
# ============================================================

@app.get("/")
async def root():
    return {
        "success": True,
        "message": "AI Virtual Try-On API is running",
        "model": "IDM-VTON",
        "space": HF_SPACE
    }


@app.get("/health")
async def health():
    return {
        "success": True,
        "status": "healthy",
        "model": "IDM-VTON"
    }


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def is_quota_exhausted(exception: Exception) -> bool:
    """
    Detect Hugging Face ZeroGPU/free inference quota errors.
    """

    text = str(exception).lower()

    keywords = [
        "zerogpu",
        "quota",
        "exceeded your free",
        "free zerogpu quota",
        "gpu quota",
    ]

    return any(keyword in text for keyword in keywords)


def friendly_error(exception: Exception) -> str:
    """
    Convert technical errors into a readable message.
    """

    text = str(exception)

    if is_quota_exhausted(exception):
        return (
            "Live IDM-VTON inference is temporarily unavailable "
            "because the Hugging Face ZeroGPU inference quota has "
            "been exhausted. Please try again later."
        )

    # Checked on the exception TYPE, not on the message text.
    # str(AppError("...")) is the message only, so the old
    # `"AppError" in text` test could never match and this branch was
    # unreachable.
    if type(exception).__name__ == "AppError":

        return (
            "The IDM-VTON hosted inference service returned an error. "
            "The service may be temporarily unavailable."
        )

    if "timeout" in text.lower():
        return (
            "The IDM-VTON inference request timed out. "
            "Please try again."
        )

    return (
        "The virtual try-on request could not be completed. "
        "Please try again."
    )


def latest_stored_result():
    """
    Return the most recently generated result from the results folder.

    This is only used as a demonstration fallback when live
    IDM-VTON inference is unavailable.
    """

    files = []

    for pattern in ["*.png", "*.jpg", "*.jpeg", "*.webp"]:
        files.extend(
            glob.glob(str(RESULTS_DIR / pattern))
        )

    if not files:
        return None

    files.sort(
        key=lambda x: os.path.getmtime(x),
        reverse=True
    )

    return files[0]


def save_generated_result(
    generated_image,
    filename: str
):
    """
    Copy the generated IDM-VTON output into the backend results folder.
    """

    if not generated_image:
        raise RuntimeError(
            "IDM-VTON returned an empty image result."
        )

    source_path = Path(str(generated_image))

    if not source_path.exists():
        raise RuntimeError(
            f"Generated image was not found: {source_path}"
        )

    destination = RESULTS_DIR / filename

    shutil.copy2(
        source_path,
        destination
    )

    return destination


def get_file_extension(filename: str, default=".jpg"):
    """
    Safely determine an uploaded file extension.
    """

    if not filename:
        return default

    extension = Path(filename).suffix.lower()

    allowed = [
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".avif",
        ".gif"
    ]

    if extension in allowed:
        return extension

    return default


async def save_upload_to_temp(
    upload: UploadFile,
    prefix: str
):
    """
    Save an uploaded FastAPI file to a temporary file.
    """

    extension = get_file_extension(
        upload.filename
    )

    temp_file = tempfile.NamedTemporaryFile(
        delete=False,
        suffix=extension,
        prefix=prefix
    )

    temp_path = temp_file.name

    try:
        content = await upload.read()
        temp_file.write(content)
        temp_file.close()

        return temp_path

    except Exception:
        temp_file.close()

        if os.path.exists(temp_path):
            os.remove(temp_path)

        raise


def cleanup_file(path):
    """
    Safely delete temporary files.
    """

    if not path:
        return

    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        pass


# ============================================================
# DIAGNOSTIC HELPERS
#
# Safe metadata only: file name, extension, byte size, MIME
# type, pixel dimensions and a SHA-256 fingerprint.
# No image contents and no tokens are ever printed.
# ============================================================

def sha256_of_bytes(data: bytes) -> str:
    """
    SHA-256 fingerprint of raw bytes.
    """

    return hashlib.sha256(data).hexdigest()[:16]


def sha256_of_file(path) -> str:
    """
    SHA-256 fingerprint of a file on disk.
    """

    hasher = hashlib.sha256()

    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            hasher.update(chunk)

    return hasher.hexdigest()[:16]


def image_dimensions(path):
    """
    Read pixel dimensions straight from the file header.

    Nothing is decoded, resized or modified, and no image library
    is used: only the leading bytes are inspected to report the
    image size. Returns (width, height) or None when the format
    is unknown. Diagnostics must never break a try-on request, so
    every failure returns None.
    """

    try:
        with open(path, "rb") as handle:

            header = handle.read(32)

            # PNG: 8 byte signature, then the IHDR width/height.
            if header[:8] == b"\x89PNG\r\n\x1a\n":

                return (
                    int.from_bytes(
                        header[16:20], "big"
                    ),
                    int.from_bytes(
                        header[20:24], "big"
                    )
                )

            # GIF87a / GIF89a.
            if header[:6] in (b"GIF87a", b"GIF89a"):

                return (
                    int.from_bytes(
                        header[6:8], "little"
                    ),
                    int.from_bytes(
                        header[8:10], "little"
                    )
                )

            # BMP: the DIB header carries the size.
            if header[:2] == b"BM":

                return (
                    int.from_bytes(
                        header[18:22], "little"
                    ),
                    int.from_bytes(
                        header[22:26], "little"
                    )
                )

            # WEBP: the size lives in the VP8 chunk header.
            if (
                header[:4] == b"RIFF" and
                header[8:12] == b"WEBP"
            ):

                chunk = header[12:16]

                if chunk == b"VP8 ":

                    return (
                        int.from_bytes(
                            header[26:28], "little"
                        ) & 0x3FFF,
                        int.from_bytes(
                            header[28:30], "little"
                        ) & 0x3FFF
                    )

                if chunk == b"VP8L":

                    bits = int.from_bytes(
                        header[21:25], "little"
                    )

                    return (
                        (bits & 0x3FFF) + 1,
                        ((bits >> 14) & 0x3FFF) + 1
                    )

                if chunk == b"VP8X":

                    return (
                        int.from_bytes(
                            header[24:27], "little"
                        ) + 1,
                        int.from_bytes(
                            header[27:30], "little"
                        ) + 1
                    )

            # JPEG: walk the markers to the start-of-frame header.
            if header[:2] == b"\xff\xd8":

                handle.seek(2)

                start_of_frame = (
                    0xC0, 0xC1, 0xC2, 0xC3,
                    0xC5, 0xC6, 0xC7,
                    0xC9, 0xCA, 0xCB,
                    0xCD, 0xCE, 0xCF
                )

                while True:

                    marker = handle.read(2)

                    if (
                        len(marker) < 2 or
                        marker[0] != 0xFF
                    ):

                        return None

                    code = marker[1]

                    if (
                        code == 0xD8 or
                        code == 0xD9 or
                        0xD0 <= code <= 0xD7
                    ):

                        continue

                    size_bytes = handle.read(2)

                    if len(size_bytes) < 2:

                        return None

                    length = int.from_bytes(
                        size_bytes, "big"
                    )

                    if code in start_of_frame:

                        frame = handle.read(5)

                        if len(frame) < 5:

                            return None

                        return (
                            int.from_bytes(
                                frame[3:5], "big"
                            ),
                            int.from_bytes(
                                frame[1:3], "big"
                            )
                        )

                    handle.seek(length - 2, 1)

    except Exception:

        return None

    return None


async def describe_upload(upload, label: str):
    """
    Log safe metadata for an incoming FastAPI upload.
    """

    if upload is None:
        print(f"[{label}] MISSING")
        return

    content = await upload.read()

    # Put the stream back so the normal save path still works.
    await upload.seek(0)

    print(f"[{label}] filename     : {upload.filename}")
    print(
        f"[{label}] extension    : "
        f"{get_file_extension(upload.filename)}"
    )
    print(f"[{label}] mime type    : {upload.content_type}")
    print(f"[{label}] size (bytes) : {len(content)}")
    print(f"[{label}] sha256[:16]  : {sha256_of_bytes(content)}")

    return content


def describe_file(path, label: str):
    """
    Log safe metadata for a file on disk.
    """

    if not path or not os.path.exists(path):
        print(f"[{label}] MISSING: {path}")
        return

    print(f"[{label}] path         : {path}")
    print(
        f"[{label}] size (bytes) : "
        f"{os.path.getsize(path)}"
    )
    print(
        f"[{label}] sha256[:16]  : "
        f"{sha256_of_file(path)}"
    )
    print(
        f"[{label}] dimensions   : "
        f"{image_dimensions(path)}"
    )


# ============================================================
# TRY-ON ENDPOINT
# ============================================================

@app.post("/tryon")
async def try_on(
    request: Request,
    human_image: UploadFile = File(...),
    garment_image: UploadFile = File(...),
    garment_description: str = Form("shirt"),
    category: str = Form("upper_body")
):

    human_temp = None
    garment_temp = None

    # Every temporary file created for this request. An uploaded image
    # that has to be re-encoded adds a second file, so cleanup is done
    # from this list rather than from the two variables.
    cleanup_paths = []

    print()
    print("=" * 60)
    print("TRY-ON REQUEST")
    print("=" * 60)

    try:

        # ----------------------------------------------------
        # Validate category
        # ----------------------------------------------------

        valid_categories = [
            "upper_body",
            "lower_body",
            "dresses"
        ]

        if category not in valid_categories:
            category = "upper_body"

        # ----------------------------------------------------
        # Validate garment description
        # ----------------------------------------------------

        if not garment_description:
            garment_description = "shirt"

        garment_description = garment_description.strip()

        if not garment_description:
            garment_description = "shirt"

        # ----------------------------------------------------
        # Validate uploaded files
        # ----------------------------------------------------

        if human_image is None:
            return {
                "success": False,
                "error": "Human/profile image is required."
            }

        if garment_image is None:
            return {
                "success": False,
                "error": "Garment/product image is required."
            }

        print()
        print("INCOMING UPLOAD DIAGNOSTICS")
        print("-" * 60)

        await describe_upload(
            human_image,
            "human_image"
        )

        await describe_upload(
            garment_image,
            "garment_image"
        )

        print()
        print(
            f"Garment description: {garment_description}"
        )

        print(
            f"Category: {category}"
        )

        # ----------------------------------------------------
        # Save uploaded images
        # ----------------------------------------------------

        human_temp = await save_upload_to_temp(
            human_image,
            "tryon_human_"
        )

        cleanup_paths.append(
            human_temp
        )

        garment_temp = await save_upload_to_temp(
            garment_image,
            "tryon_garment_"
        )

        cleanup_paths.append(
            garment_temp
        )

        print()
        print("Temporary files created:")
        print(human_temp)
        print(garment_temp)

        print()
        print("-" * 60)
        print("TEMP FILE FINGERPRINTS")

        describe_file(
            human_temp,
            "human_temp"
        )

        describe_file(
            garment_temp,
            "garment_temp"
        )

        print("-" * 60)

        # ----------------------------------------------------
        # VALIDATE AND NORMALISE THE INPUT IMAGES
        #
        # The model is never handed bytes it cannot decode. Each
        # upload is opened and fully decoded first; anything that is
        # not a plain PNG or JPEG (AVIF and similar containers are
        # returned by some retail CDNs) is re-encoded as PNG, and a
        # file that is not a real image at all is rejected here with
        # a clear message instead of reaching the Space.
        #
        # The role of each file is logged explicitly so it is always
        # visible which image is the person and which is the garment.
        # ----------------------------------------------------

        print()
        print("INPUT IMAGE VALIDATION")
        print("-" * 60)

        print(
            "human_image   -> the user's saved profile photo "
            "(person)"
        )

        print(
            "garment_image -> the selected product photo "
            "(garment)"
        )

        try:

            human_temp = prepare_input_image(
                human_temp,
                "human_image (profile)"
            )

            cleanup_paths.append(
                human_temp
            )

        except ImageNotUsable as invalid:

            print(
                f"[human_image] REJECTED: {invalid}"
            )

            return {
                "success": False,
                "demo": False,
                "fallback": False,
                "error": "invalid_human_image",
                "message": (
                    "Unable to process your saved profile photo. "
                    "Please upload it again."
                ),
                "category": category,
                "garment_description": garment_description
            }

        try:

            garment_temp = prepare_input_image(
                garment_temp,
                "garment_image (product)"
            )

            cleanup_paths.append(
                garment_temp
            )

        except ImageNotUsable as invalid:

            print(
                f"[garment_image] REJECTED: {invalid}"
            )

            return {
                "success": False,
                "demo": False,
                "fallback": False,
                "error": "invalid_garment_image",
                "message": (
                    "Unable to process the selected product image."
                ),
                "category": category,
                "garment_description": garment_description
            }

        print()
        print(
            "Both images decoded successfully. "
            "Sending to IDM-VTON:"
        )

        print(
            "  human_image   =",
            human_temp
        )

        print(
            "  garment_image =",
            garment_temp
        )

        print("-" * 60)

        # ----------------------------------------------------
        # IDM-VTON INFERENCE
        # ----------------------------------------------------

        print()
        print("Sending request to IDM-VTON...")
        print("-" * 60)

        # IMPORTANT:
        #
        # Current IDM-VTON API:
        #
        # predict(
        #     dict,
        #     garm_img,
        #     garment_des,
        #     is_checked,
        #     is_checked_crop,
        #     denoise_steps,
        #     seed
        # )
        #
        # Auto mask  = True
        # Auto crop  = False
        #
        # DO NOT add category as an additional API argument.
        # Category is used by our application but is not a
        # parameter exposed by the current IDM-VTON Space.

        result = client.predict(
            dict(
                background=handle_file(human_temp),
                layers=[],
                composite=None
            ),
            handle_file(garment_temp),
            garment_description,
            True,
            False,
            30,
            42,
            api_name="/tryon"
        )

        print()
        print("IDM-VTON response received.")
        print("Result type:", type(result))

        # ----------------------------------------------------
        # VALIDATE RESPONSE
        # ----------------------------------------------------

        if not result:
            raise RuntimeError(
                "IDM-VTON returned an empty response."
            )

        if len(result) < 1:
            raise RuntimeError(
                "IDM-VTON did not return an output image."
            )

        generated_image = result[0]

        masked_image = None

        if len(result) > 1:
            masked_image = result[1]

        print(
            "Generated image:",
            generated_image
        )

        print(
            "Masked image:",
            masked_image
        )

        # ----------------------------------------------------
        # SAVE GENERATED IMAGE
        # ----------------------------------------------------

        if not generated_image:
            raise RuntimeError(
                "IDM-VTON generated image is empty."
            )

        timestamp = int(
            __import__("time").time()
        )

        output_filename = (
            f"tryon_{timestamp}.png"
        )

        output_path = save_generated_result(
            generated_image,
            output_filename
        )

        print()
        print("Generated result saved:")
        print(output_path)

        # ---- RESULT FILE DIAGNOSTICS ----------------------------
        print()
        print("-" * 60)
        print("RESULT FILE DIAGNOSTICS")
        print("-" * 60)
        print("Filename     :", output_filename)
        print("Saved path   :", output_path)
        print("File exists  :", Path(output_path).exists())
        print("File size    :",
              Path(output_path).stat().st_size
              if Path(output_path).exists() else 0)
        print("Results dir  :", RESULTS_DIR)
        print("Results dir mounted at: /results")

        describe_file(
            str(generated_image),
            "idm_result_0"
        )

        describe_file(
            output_path,
            "saved_output"
        )

        # ----------------------------------------------------
        # SAVE MASKED IMAGE IF AVAILABLE
        # ----------------------------------------------------

        masked_filename = None
        masked_url = None

        if masked_image:

            try:

                masked_source = Path(
                    str(masked_image)
                )

                if masked_source.exists():

                    masked_filename = (
                        f"masked_{timestamp}.png"
                    )

                    masked_destination = (
                        RESULTS_DIR / masked_filename
                    )

                    shutil.copy2(
                        masked_source,
                        masked_destination
                    )

                    masked_url = (
                        f"/results/{masked_filename}"
                    )

            except Exception as mask_error:

                print(
                    "Could not save masked image:",
                    mask_error
                )

        # ----------------------------------------------------
        # BUILD RESPONSE
        # ----------------------------------------------------

        result_url = (
            f"/results/{output_filename}"
        )

        base_url = str(
            request.base_url
        ).rstrip("/")

        full_result_url = (
            f"{base_url}{result_url}"
        )

        print()
        print("=" * 60)
        print("TRY-ON SUCCESS")
        print("=" * 60)
        print("Result URL (relative):", result_url)
        print("Result URL (absolute):", full_result_url)
        print("=" * 60)

        return {
            "success": True,
            "demo": False,
            "message": "Virtual try-on generated successfully.",
            "result": result_url,
            "result_url": result_url,
            "full_result_url": full_result_url,
            "masked_image": masked_url,
            "category": category,
            "garment_description": garment_description
        }

    # ========================================================
    # QUOTA ERROR
    # ========================================================

    except Exception as e:

        print()
        print("=" * 60)
        print("TRY-ON ERROR")
        print("=" * 60)

        print(
            "Exception:",
            str(e)
        )

        print()
        print("Traceback:")
        traceback.print_exc()

        print("=" * 60)

        # ----------------------------------------------------
        # ZERO GPU / QUOTA FALLBACK
        # ----------------------------------------------------

        if is_quota_exhausted(e):

            stored = latest_stored_result()

            if stored:

                stored_filename = Path(
                    stored
                ).name

                result_url = (
                    f"/results/{stored_filename}"
                )

                base_url = str(
                    request.base_url
                ).rstrip("/")

                full_result_url = (
                    f"{base_url}{result_url}"
                )

                print()
                print(
                    "Live IDM-VTON quota unavailable."
                )

                print(
                    "Using previously generated genuine "
                    "IDM-VTON result for demonstration."
                )

                print(
                    "Previous result:",
                    stored
                )

                return {
                    "success": False,
                    "demo": True,
                    "fallback": True,
                    "message": (
                        "Live IDM-VTON generation is temporarily "
                        "unavailable because the Hugging Face "
                        "ZeroGPU inference quota is exhausted."
                    ),
                    "error": friendly_error(e),
                    "result": result_url,
                    "result_url": result_url,
                    "full_result_url": full_result_url,
                    "label": (
                        "Previously generated IDM-VTON result"
                    ),
                    "live": False,
                    "category": category,
                    "garment_description": garment_description
                }

            # No previous result available

            return {
                "success": False,
                "demo": False,
                "fallback": False,
                "error": friendly_error(e),
                "message": (
                    "Live IDM-VTON inference is unavailable "
                    "because the Hugging Face ZeroGPU quota "
                    "has been exhausted, and no previous "
                    "generated result is available."
                ),
                "category": category,
                "garment_description": garment_description
            }

        # ----------------------------------------------------
        # GENERAL ERROR
        # ----------------------------------------------------

        return {
            "success": False,
            "demo": False,
            "fallback": False,
            "error": friendly_error(e),
            "message": str(e),
            "category": category,
            "garment_description": garment_description
        }

    # ========================================================
    # CLEANUP
    # ========================================================

    finally:

        # Remove every temporary file this request created, including
        # any re-encoded replacement written during validation.
        for temp_path in cleanup_paths:

            cleanup_file(
                temp_path
            )


# ============================================================
# APPLICATION STARTUP
# ============================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True
    )