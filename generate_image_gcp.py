#!/usr/bin/env python3
"""
Grietas Vivas / SafeSpace — GCP Vertex AI Imagen 3 Generator
Generates realistic structural damage inspection images, visual framing guides,
reference scale examples, and UI background assets using GCP Service Account variables in .env.

Usage:
  # Generate a single custom prompt
  python generate_image_gcp.py "Macro photograph of a diagonal crack in a concrete beam with a credit card for scale" --out public/examples/detail-card.webp

  # Generate preset reference examples for the UI
  python generate_image_gcp.py --preset detail --out public/examples/guide-detail-coin.webp
  python generate_image_gcp.py --preset context --out public/examples/guide-context-beam.webp
  python generate_image_gcp.py --preset shear-x --out public/examples/guide-shear-x.webp
  python generate_image_gcp.py --preset hero-bg --out public/images/hero-bg.webp

  # Generate the Reconocimiento gallery (10 tipos de grieta post-sismo)
  python generate_image_gcp.py --preset rec-fisura-superficial
  python generate_image_gcp.py --preset rec-vertical
  python generate_image_gcp.py --preset rec-horizontal
  python generate_image_gcp.py --preset rec-diagonal
  python generate_image_gcp.py --preset rec-escalera
  python generate_image_gcp.py --preset rec-puerta-ventana
  python generate_image_gcp.py --preset rec-muro-columna
  python generate_image_gcp.py --preset rec-muro-losa-viga
  python generate_image_gcp.py --preset rec-viga-columna
  python generate_image_gcp.py --preset rec-oxido
  # O todas a la vez:
  python generate_image_gcp.py --generate-reconocimiento

  # Generate all standard examples in batch
  python generate_image_gcp.py --generate-all
"""

import argparse
import base64
import os
import sys
from pathlib import Path
import io

import requests
import google.auth.transport.requests
from google.oauth2 import service_account
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent

# Load .env variables manually to avoid dependency on dotenv
def load_env():
    env_path = PROJECT_ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip()
                if val.startswith('"') and val.endswith('"'):
                    val = val[1:-1]
                elif val.startswith("'") and val.endswith("'"):
                    val = val[1:-1]
                os.environ[key] = val

load_env()

PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "project-64a1188d-1e41-49e8-b1a")
LOCATION = os.environ.get("VERTEX_LOCATION", "us-central1")
MODEL = "gemini-2.5-flash-image"

ENDPOINT = (
    f"https://{LOCATION}-aiplatform.googleapis.com/v1"
    f"/projects/{PROJECT_ID}/locations/{LOCATION}"
    f"/publishers/google/models/{MODEL}:predict"
)

ASPECT_INFO = {
    "1:1":  "1024x1024  — square (ideal for detail framing)",
    "4:3":  "1280x960   — viewfinder aspect ratio",
    "16:9": "1408x768   — horizontal standard / hero",
    "3:4":  "960x1280   — portrait mobile viewfinder",
}

BRAND_SUFFIX = (
    ", forensic civil engineering architectural photography, authentic building damage inspection, "
    "sharp focus, natural lighting, ultra-realistic concrete and plaster textures, professional documentation 8k"
)

PRESETS = {
    "detail": {
        "prompt": (
            "Close-up macro photograph taken at 35 centimeters distance of a structural crack on a plastered concrete wall, "
            "with a circular metal Colombian coin placed directly next to the crack as a size scale reference, "
            "crisp crack edges, fine dust, architectural inspection viewfinder guide"
        ),
        "aspect": "4:3",
        "default_out": "public/examples/guide-detail-coin.webp",
    },
    "context": {
        "prompt": (
            "Wide architectural photograph taken from 2 meters distance showing a building room corner with a reinforced concrete column, "
            "horizontal ceiling beam, and load-bearing brick wall with diagonal shear cracks post-earthquake, "
            "wide perspective capturing structural joints and surrounding framework, forensic damage assessment"
        ),
        "aspect": "4:3",
        "default_out": "public/examples/guide-context-beam.webp",
    },
    "shear-x": {
        "prompt": (
            "Forensic engineering photograph of a masonry wall displaying prominent bidirectional X-shaped shear crack pattern "
            "following mortar joints, severe seismic damage triage documentation, clear structural lines"
        ),
        "aspect": "4:3",
        "default_out": "public/examples/guide-shear-x.webp",
    },
    "hero-bg": {
        "prompt": (
            "Subtle cinematic architectural background texture with reinforced concrete wall, geometric engineering crosshair lines, "
            "clean minimalist disaster resilience technology, deep slate blue tones, soft ambient lighting"
        ),
        "aspect": "16:9",
        "default_out": "public/images/hero-bg.webp",
    },
    # ---------------------------------------------------------------------------
    # Reconocimiento — galeria educativa de tipos de grietas post-sismo.
    # Cada preset genera una imagen 4:3 representativa para identificar
    # el patron en inspeccion ciudadana. Fuente visual: poster oficial
    # "¿Como revisar tu casa despues de un sismo?".
    # ---------------------------------------------------------------------------
    "rec-fisura-superficial": {
        "prompt": (
            "Macro forensic photograph of a very thin hairline crack on a freshly painted interior plaster wall, "
            "superficial finish crack thinner than 1 millimeter, paint and stucco texture visible, "
            "well-lit neutral interior wall, documentary inspection framing"
        ),
        "aspect": "4:3",
        "default_out": "public/reconocimiento/fisura-superficial.webp",
    },
    "rec-vertical": {
        "prompt": (
            "Forensic photograph of a vertical structural crack running straight from top to bottom on a bare concrete wall, "
            "uniform width approximately 1 to 2 millimeters, no branching, natural daylight, "
            "engineering inspection documentation, mid-range framing showing full crack length"
        ),
        "aspect": "4:3",
        "default_out": "public/reconocimiento/vertical.webp",
    },
    "rec-horizontal": {
        "prompt": (
            "Forensic photograph of a horizontal structural crack running parallel to the floor on an interior concrete wall, "
            "approximately 1 to 3 millimeters wide, slightly stepped at one point, "
            "natural ambient light, structural inspection framing"
        ),
        "aspect": "4:3",
        "default_out": "public/reconocimiento/horizontal.webp",
    },
    "rec-diagonal": {
        "prompt": (
            "Forensic photograph of a diagonal structural crack at approximately 45 degrees on a plastered masonry wall, "
            "clean diagonal line from upper corner to lower opposite, width around 2 to 4 millimeters, "
            "post-earthquake damage triage documentation, natural lighting"
        ),
        "aspect": "4:3",
        "default_out": "public/reconocimiento/diagonal.webp",
    },
    "rec-escalera": {
        "prompt": (
            "Forensic photograph of a stair-step crack following the mortar joints of a concrete block masonry wall, "
            "zigzag horizontal and vertical segments aligned with the block grid, post-seismic damage, "
            "clear daylight, structural damage inspection framing"
        ),
        "aspect": "4:3",
        "default_out": "public/reconocimiento/escalera.webp",
    },
    "rec-puerta-ventana": {
        "prompt": (
            "Forensic photograph of a diagonal crack starting at the upper corner of a window frame and propagating into the surrounding plastered wall, "
            "typical post-seismic stress concentration at openings, approximately 2 to 5 millimeters wide, "
            "white PVC window frame visible, natural interior lighting"
        ),
        "aspect": "4:3",
        "default_out": "public/reconocimiento/puerta-ventana.webp",
    },
    "rec-muro-columna": {
        "prompt": (
            "Forensic close-up photograph of a vertical separation crack between a reinforced concrete column and an adjacent masonry wall, "
            "clean vertical gap approximately 3 to 8 millimeters wide, two different materials visible side by side, "
            "post-seismic detachment, structural inspection framing"
        ),
        "aspect": "4:3",
        "default_out": "public/reconocimiento/muro-columna.webp",
    },
    "rec-muro-losa-viga": {
        "prompt": (
            "Forensic photograph of a horizontal separation crack at the junction between the top of a masonry wall and the underside of a reinforced concrete slab or beam, "
            "clear linear horizontal gap, approximately 3 to 6 millimeters wide, "
            "daylight illuminating the underside of the slab, structural damage documentation"
        ),
        "aspect": "4:3",
        "default_out": "public/reconocimiento/muro-losa-viga.webp",
    },
    "rec-viga-columna": {
        "prompt": (
            "Forensic photograph of a structural crack on a reinforced concrete column or beam, "
            "vertical or diagonal crack approximately 2 to 5 millimeters wide on bare gray concrete surface, "
            "post-earthquake damage triage, no plaster covering, structural engineering documentation"
        ),
        "aspect": "4:3",
        "default_out": "public/reconocimiento/viga-columna.webp",
    },
    "rec-oxido": {
        "prompt": (
            "Forensic close-up photograph of a deteriorated concrete crack with rust-orange oxidation stains, "
            "spalling concrete with exposed corroded rebar visible inside the crack, "
            "orange-brown rust bleeding down the wall surface, severe structural deterioration, "
            "natural daylight, engineering damage assessment framing"
        ),
        "aspect": "4:3",
        "default_out": "public/reconocimiento/oxido.webp",
    },
}


def get_credentials():
    private_key = os.environ.get("GCP_SA_PRIVATE_KEY")
    client_email = os.environ.get("GCP_SA_EMAIL")
    
    if not private_key or not client_email:
        print("Error: Missing GCP_SA_PRIVATE_KEY or GCP_SA_EMAIL in .env file", file=sys.stderr)
        sys.exit(1)
        
    # Clean private key spacing
    private_key = private_key.replace("\\n", "\n")
    if private_key.startswith('"') and private_key.endswith('"'):
        private_key = private_key[1:-1]
        
    sa_info = {
        "type": "service_account",
        "project_id": PROJECT_ID,
        "private_key_id": "dummy_id",
        "private_key": private_key,
        "client_email": client_email,
        "client_id": "dummy_id_2",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{client_email.replace('@', '%40')}"
    }
    
    return service_account.Credentials.from_service_account_info(
        sa_info,
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )


def get_token() -> str:
    creds = get_credentials()
    auth_req = google.auth.transport.requests.Request()
    creds.refresh(auth_req)
    return creds.token


def generate(
    prompt: str,
    out_path: Path,
    aspect: str = "4:3",
    brand_suffix: str = BRAND_SUFFIX,
    quality: int = 90,
) -> Path:
    from google import genai
    from google.genai import types

    full_prompt = prompt.strip()
    if brand_suffix and not full_prompt.endswith(brand_suffix):
        full_prompt += brand_suffix

    print(f"Generating image with Vertex AI ({MODEL}) on {PROJECT_ID}: '{prompt[:60]}...' (Aspect: {aspect})")

    client = genai.Client(
        vertexai=True,
        project=PROJECT_ID,
        location=LOCATION,
    )

    try:
        res = client.models.generate_content(
            model=MODEL,
            contents=f"{full_prompt}. Aspect ratio: {aspect}.",
            config=types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"]),
        )
    except Exception as e:
        print(f"Error calling Vertex AI: {e}", file=sys.stderr)
        sys.exit(1)

    img_bytes = None
    if res.candidates:
        for p in res.candidates[0].content.parts:
            if p.inline_data:
                img_bytes = p.inline_data.data
                break

    if not img_bytes:
        print("Error: No image found in Vertex AI response", file=sys.stderr)
        sys.exit(1)

    out_path.parent.mkdir(parents=True, exist_ok=True)

    img = Image.open(io.BytesIO(img_bytes))
    img.save(str(out_path), "WEBP", quality=quality)
    print(f"Successfully saved: {out_path.relative_to(PROJECT_ROOT) if out_path.is_relative_to(PROJECT_ROOT) else out_path}")
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Generate structural inspection images and UI assets with GCP Vertex AI Imagen 3")
    parser.add_argument("prompt", nargs="?", default=None, help="Visual description of the image")
    parser.add_argument("--out", default=None, help="Output path, e.g. public/examples/detail-example.webp")
    parser.add_argument("--aspect", default="4:3", choices=list(ASPECT_INFO.keys()), help="Aspect ratio (default: 4:3)")
    parser.add_argument("--preset", choices=list(PRESETS.keys()), help="Use a predefined structural inspection preset")
    parser.add_argument("--generate-all", action="store_true", help="Generate all standard preset examples in batch")
    parser.add_argument("--generate-reconocimiento", action="store_true", help="Generate the 10 Reconocimiento gallery presets only (public/reconocimiento/*.webp)")
    parser.add_argument("--quality", type=int, default=90, help="WebP compression quality (default: 90)")
    parser.add_argument("--no-brand", action="store_true", help="Do not append structural brand descriptors")

    args = parser.parse_args()

    if args.generate_all:
        for name, pset in PRESETS.items():
            print(f"\n--- Generating Preset: {name} ---")
            out_file = PROJECT_ROOT / pset["default_out"]
            generate(
                pset["prompt"],
                out_file,
                aspect=pset["aspect"],
                brand_suffix="" if args.no_brand else BRAND_SUFFIX,
                quality=args.quality,
            )
        print("\nAll presets generated successfully!")
        return

    if args.generate_reconocimiento:
        rec_names = [name for name in PRESETS if name.startswith("rec-")]
        for name in rec_names:
            pset = PRESETS[name]
            print(f"\n--- Generating Reconocimiento Preset: {name} ---")
            out_file = PROJECT_ROOT / pset["default_out"]
            generate(
                pset["prompt"],
                out_file,
                aspect=pset["aspect"],
                brand_suffix="" if args.no_brand else BRAND_SUFFIX,
                quality=args.quality,
            )
        print("\nAll Reconocimiento presets generated successfully!")
        return

    if args.preset:
        preset_info = PRESETS[args.preset]
        prompt = args.prompt or preset_info["prompt"]
        out_target = args.out or preset_info["default_out"]
        aspect = args.aspect if args.aspect != "4:3" else preset_info["aspect"]
    elif args.prompt:
        prompt = args.prompt
        if not args.out:
            print("Error: --out path is required when providing a custom prompt.", file=sys.stderr)
            sys.exit(1)
        out_target = args.out
        aspect = args.aspect
    else:
        parser.print_help()
        sys.exit(1)

    brand_suffix = "" if args.no_brand else BRAND_SUFFIX
    out_path = Path(out_target)
    if not out_path.is_absolute():
        out_path = PROJECT_ROOT / out_path

    generate(
        prompt,
        out_path,
        aspect=aspect,
        brand_suffix=brand_suffix,
        quality=args.quality,
    )


if __name__ == "__main__":
    main()
