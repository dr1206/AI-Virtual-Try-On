import os
import time
import uuid
import shutil
import tempfile
import traceback

from fastapi import FastAPI, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from gradio_client import Client, handle_file
from huggingface_hub import get_token


# ============================================================
# APP SETUP
# ============================================================

app = FastAPI(
    title="AI Virtual Try-On API",
    description="AI Virtual Try-On using IDM-VTON",
    version="1.0.0"
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
# RESULTS DIRECTORY
# ============================================================

RESULTS_DIR = "results"

os.makedirs(RESULTS_DIR, exist_ok=True)

app.mount(
    "/results",
    StaticFiles(directory=RESULTS_DIR),
    name="results"
)


# ============================================================
# CLEAN UP OLD RESULTS
# ============================================================

RESULT_MAX_AGE_DAYS = 7


def cleanup_old_results():

    limit = (
        time.time()
        - RESULT_MAX_AGE_DAYS * 24 * 60 * 60
    )

    removed = 0

    for name in os.listdir(RESULTS_DIR):

        path = os.path.join(RESULTS_DIR, name)

        try:

            if os.path.getmtime(path) < limit:

                os.remove(path)

                removed += 1

        except Exception:

            pass

    if removed:

        print(
            f"Removed {removed} old result file(s)."
        )


cleanup_old_results()


# ============================================================
# READABLE ERROR MESSAGES
#
# The technical detail is printed in the console; the API also
# returns a short readable message.
# ============================================================


def friendly_error(exception):

    text = str(exception).lower()

    if "zerogpu" in text or "quota" in text:

        return (
            "The AI model is temporarily unavailable "
            "(free GPU quota reached). Please try again later."
        )

    if "queue" in text:

        return (
            "The AI model is temporarily unavailable "
            "(busy). Please try again."
        )

    if "sleeping" in text or "runtime error" in text:

        return (
            "The AI model is temporarily unavailable "
            "(starting up). Please try again in a minute."
        )

    if "timeout" in text or "timed out" in text:

        return (
            "The AI model took too long to respond. "
            "Please try again."
        )

    if (
        "connection" in text
        or "connect" in text
        or "network" in text
        or "unreachable" in text
        or "503" in text
    ):

        return (
            "The AI model could not be reached. "
            "Check the internet connection and try again."
        )

    if (
        "cannot identify image" in text
        or "image file" in text
        or "is not a valid image" in text
        or "decompression bomb" in text
    ):

        return (
            "One of the images is not a valid image file. "
            "Please upload a different image."
        )

    return (
        "AI generation failed. Please try again in a moment."
    )


# ============================================================
# DEMO MODE (presentation fallback)
#
# When the Hugging Face Space refuses a request because the free
# ZeroGPU quota is exhausted, the try-on cannot be generated right
# now. For presentation reliability only, a previously generated
# IDM-VTON result from the results directory is returned instead,
# clearly flagged with "demo": True so the extension can label it.
#
# This never fabricates an image and never marks a demo result as
# a successful live generation. The live IDM-VTON pipeline above is
# untouched.
# ============================================================

DEMO_NOTICE = (
    "Live AI generation is temporarily unavailable. "
    "Showing a previously generated IDM-VTON result."
)


# True only when the Space reports an exhausted ZeroGPU quota.
def is_quota_exhausted(exception):

    text = str(exception).lower()

    return "zerogpu" in text or "quota" in text


# Newest previously generated result, or "" when there is none.
def latest_stored_result():

    try:

        names = [
            os.path.join(RESULTS_DIR, name)
            for name in os.listdir(RESULTS_DIR)
        ]

        files = [
            path for path in names
            if os.path.isfile(path) and path.lower().endswith(".png")
        ]

        if not files:
            return ""

        return max(files, key=os.path.getmtime)

    except Exception:

        return ""


# ============================================================
# IDM-VTON CONNECTION
# ============================================================

print("Connecting to IDM-VTON...")

HF_TOKEN = get_token()

if not HF_TOKEN:
    raise RuntimeError(
        "Hugging Face token not found. "
        "Please login using huggingface_hub."
    )

print("Hugging Face token found.")

client = Client(
    "yisol/IDM-VTON",
    token=HF_TOKEN
)

print("IDM-VTON connected successfully!")


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():

    return {
        "message": "AI Virtual Try-On API is running",
        "status": "online"
    }


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health")
def health():

    return {
        "status": "healthy",
        "service": "AI Virtual Try-On"
    }


# ============================================================
# TRY-ON
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

    try:

        print()
        print("========================================")
        print("NEW TRY-ON REQUEST")
        print("========================================")

        print(
            "Human image:",
            human_image.filename
        )

        print(
            "Garment image:",
            garment_image.filename
        )

        print(
            "Garment description:",
            garment_description
        )

        print(
            "Category:",
            category
        )


        # ====================================================
        # VALIDATE CATEGORY
        # ====================================================

        valid_categories = [
            "upper_body",
            "lower_body",
            "dresses"
        ]

        if category not in valid_categories:

            category = "upper_body"

        print(
            "Using category:",
            category
        )


        # ====================================================
        # SAVE HUMAN IMAGE
        # ====================================================

        human_suffix = (
            os.path.splitext(
                human_image.filename or ""
            )[1]
            or ".png"
        )

        human_file = tempfile.NamedTemporaryFile(
            delete=False,
            suffix=human_suffix
        )

        human_temp = human_file.name

        human_content = await human_image.read()

        human_file.write(
            human_content
        )

        human_file.close()


        # ====================================================
        # SAVE GARMENT IMAGE
        # ====================================================

        garment_suffix = (
            os.path.splitext(
                garment_image.filename or ""
            )[1]
            or ".png"
        )

        garment_file = tempfile.NamedTemporaryFile(
            delete=False,
            suffix=garment_suffix
        )

        garment_temp = garment_file.name

        garment_content = await garment_image.read()

        garment_file.write(
            garment_content
        )

        garment_file.close()


        # ====================================================
        # IDM-VTON
        #
        # NOTE ON OUTPUT ARTIFACTS
        #
        # IDM-VTON is a virtual try-on diffusion model. It
        # reconstructs the person wearing the garment, so its
        # output can contain generation artifacts that are not
        # present in the input photo - for example a duplicated
        # or extra limb (a repeated hand) near an edge of the
        # garment, distorted hands, or slight seams bleeding at
        # the garment border.
        #
        # These are model artifacts, not a bug in this backend and
        # not a frontend rendering problem. The pipeline below is
        # therefore intentionally left unchanged: no parameters,
        # seeds, masks, post-processing or cleanup are applied to
        # the generated image, because altering them would change
        # the inference request that is known to work.
        #
        # Nothing is done to "fix" the image. The frontend renders
        # exactly what the model returns.
        #
        # When live generation is available again, a cleaner
        # front-facing profile image with the arms clearly
        # separated from the torso noticeably reduces these
        # artifacts, because the model has an easier time placing
        # the limbs.
        # ====================================================

        print()
        print("Sending images to IDM-VTON...")
        print("Please wait...")


        # IMPORTANT:
        # This is the exact parameter order
        # that was previously working.

        result = client.predict(

            # 1. Human image
            dict(
                background=handle_file(
                    human_temp
                ),
                layers=[],
                composite=None
            ),

            # 2. Garment image
            handle_file(
                garment_temp
            ),

            # 3. Garment description
            garment_description,

            # 4. Auto mask
            True,

            # 5. Crop
            True,

            # 6. Denoising steps
            30,

            # 7. Seed
            42,

            api_name="/tryon"
        )


        print()
        print(
            "IDM-VTON processing completed!"
        )


        # ====================================================
        # OUTPUT
        # ====================================================

        generated_image = result[0]

        masked_image = result[1]


        print(
            "Generated image:",
            generated_image
        )

        print(
            "Masked image:",
            masked_image
        )


        # The generated path is printed and verified before it is
        # copied, so a missing / unexpected return value is visible
        # in the console instead of failing silently.
        if not os.path.exists(generated_image):

            print(
                "Generated image path does not exist:",
                generated_image
            )

            print(
                "Full result payload:",
                result
            )

            raise RuntimeError(
                "IDM-VTON returned a result that is not a file: "
                f"{generated_image!r}"
            )


        # ====================================================
        # SAVE GENERATED RESULT
        # ====================================================

        result_id = str(
            uuid.uuid4()
        )

        result_filename = (
            f"{result_id}.png"
        )

        result_path = os.path.join(
            RESULTS_DIR,
            result_filename
        )


        shutil.copy(
            generated_image,
            result_path
        )


        # ====================================================
        # RESULT URL
        # ====================================================

        # The URL is built from the incoming request, so it also
        # works when the backend runs on another host or port.
        image_url = (
            str(request.base_url).rstrip("/")
            + f"/results/{result_filename}"
        )


        print()
        print(
            "Result URL:"
        )

        print(
            image_url
        )


        print()
        print("========================================")
        print("TRY-ON SUCCESS")
        print("========================================")
        print()


        return {

            "success": True,

            "message":
                "Virtual try-on completed successfully",

            "category":
                category,

            "garment_description":
                garment_description,

            "image_url":
                image_url

        }


    except Exception as e:

        print()
        print("========================================")
        print("TRY-ON ERROR")
        print("========================================")

        # The full technical error (including the stack trace) is
        # logged in the backend console only. The API response below
        # carries a short readable message for the extension.
        print(
            str(e)
        )

        traceback.print_exc()

        print("========================================")
        print()


        # -------------------------------------------------
        # DEMO FALLBACK (quota exhaustion only)
        #
        # Used ONLY when the backend reports an exhausted
        # ZeroGPU quota. A previously generated IDM-VTON result
        # is returned and flagged with "demo": True, so the
        # extension labels it and never treats it as a new live
        # generation. Any other failure keeps the normal error
        # response below.
        # -------------------------------------------------

        if is_quota_exhausted(e):

            stored = latest_stored_result()

            if stored:

                demo_image_url = (
                    str(request.base_url).rstrip("/")
                    + f"/results/{os.path.basename(stored)}"
                )

                print()
                print("========================================")
                print("DEMO FALLBACK (quota exhausted)")
                print("========================================")
                print("Reusing stored result:", stored)
                print("Demo image URL:", demo_image_url)
                print("========================================")
                print()


                return {

                    "success": False,

                    "demo": True,

                    "message": DEMO_NOTICE,

                    "image_url": demo_image_url,

                    "category": category,

                    "garment_description":
                        garment_description,

                    "error": str(e)

                }


        # Full technical detail stays in this console output and in
        # the "error" field; "message" is kept readable.
        return {

            "success": False,

            "message":
                friendly_error(e),

            "error":
                str(e)

        }


    finally:

        # ====================================================
        # CLEAN TEMP FILES
        # ====================================================

        if human_temp:

            try:
                os.remove(
                    human_temp
                )

            except Exception:
                pass


        if garment_temp:

            try:
                os.remove(
                    garment_temp
                )

            except Exception:
                pass