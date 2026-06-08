"""One-shot generator: produces 16 product catalogue images via Nano Banana
(Gemini latest image-preview), writes each as a PNG to
/app/backend/static/products/<slug>.png.

Idempotent: skips slugs that already have a non-empty PNG on disk.
"""
import asyncio, base64, os, sys, time
from pathlib import Path
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv("/app/backend/.env")
API_KEY = os.environ["EMERGENT_LLM_KEY"]
MODEL = "gemini-3.1-flash-image-preview"
OUT_DIR = Path("/app/backend/static/products")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# slug -> (display name, prompt). Distinct prompts, no repeats.
STYLE = (
    "Professional studio product photography, soft natural lighting from upper left, "
    "soft drop shadow, isolated on a clean pale-cyan-to-white gradient background. "
    "Sharp focus, hyper-detailed, color-accurate, commercial-catalogue quality, 4k. "
    "Absolutely NO text, NO logos, NO watermarks, NO brand names, NO labels with words on the product."
)

PRODUCTS = [
    ("bottom-time-logo-tee",
     "Bottom Time Logo Tee",
     "A plain navy-blue cotton crew-neck t-shirt laid flat with subtle natural folds, "
     "front-facing view. " + STYLE),
    ("dive-flag-cap",
     "Dive Flag Cap",
     "A navy-blue structured snapback baseball cap, front-three-quarter view, "
     "embroidered patch on the front (no readable text, just a small red-and-white diagonal patch). "
     + STYLE),
    ("ocean-explorer-hoodie",
     "Ocean Explorer Hoodie",
     "A heavyweight charcoal-grey French-terry pullover hoodie with drawstrings, "
     "laid flat with subtle natural folds, front-facing view. " + STYLE),
    ("reef-sticker-pack",
     "Reef Sticker Pack",
     "A small fanned-out arrangement of eight glossy waterproof vinyl die-cut stickers "
     "featuring marine illustrations: a manta ray, a sea turtle, a coral cluster, "
     "a clownfish, a scuba mask outline, a wave, a sea-shell, and an octopus. "
     "Stickers slightly overlap. " + STYLE),
    ("dry-bag-20l",
     "Dry Bag 20L",
     "A bright cyan-blue waterproof roll-top dry-sack with the top rolled and clipped, "
     "standing upright, 20 litre capacity, matte vinyl finish, side carry handle. "
     + STYLE),
    ("dive-computer-wrist-mount",
     "Dive Computer Wrist Mount",
     "A black silicone-rubber wrist strap with a stainless quick-release buckle, "
     "fitted around a slim black wrist-worn dive computer with a small dark LCD face (no text), "
     "shown from above on a soft pale background. " + STYLE),
    ("reef-safe-sunscreen-spf50",
     "Reef-Safe Sunscreen SPF50",
     "A 100 ml white squeeze tube of mineral sunscreen with a cyan flip-cap, "
     "minimalist unbranded design, standing upright, slight drop shadow, "
     "next to a small unbranded white box. " + STYLE),
    ("mesh-gear-bag",
     "Mesh Gear Bag",
     "A large 80-litre black nylon mesh duffel bag with cyan accent webbing and "
     "a top zip closure, slightly slouched, partially showing the mesh weave, "
     "shoulder strap visible. " + STYLE),
    ("underwater-torch-1000-lumens",
     "Underwater Torch 1000 Lumens",
     "A matte-black anodized aluminium scuba dive torch with a knurled cylindrical grip and "
     "a recessed power button, the lens end emitting a faint cyan-white LED beam, "
     "held horizontally, side view. " + STYLE),
    ("bottom-time-water-bottle",
     "Bottom Time Water Bottle",
     "A 750 ml double-walled insulated stainless-steel water bottle in matte navy blue, "
     "with a black screw-cap, standing upright, slight condensation droplets. "
     + STYLE),
    ("neoprene-mask-strap-cover",
     "Neoprene Mask Strap Cover",
     "A padded cyan-blue neoprene mask-strap cover (a rectangular sleeve about 25 cm long) "
     "fitted around a black silicone scuba mask strap, lying flat, shown from above. "
     + STYLE),
    ("silicone-defog-spray",
     "Silicone Defog Spray",
     "A small 60 ml clear plastic spray bottle with a black pump-spray nozzle "
     "filled with clear cyan-tinted anti-fog solution, standing upright, "
     "next to a black silicone scuba mask faintly out of focus in background. " + STYLE),
    ("dive-slate-and-pencil",
     "Dive Slate & Pencil",
     "A rigid bright-yellow plastic underwater writing slate (rectangular, about 15 x 10 cm) "
     "with a small graphite pencil tethered by a black bungee cord, "
     "a quick-release wrist strap clipped to the corner, shown from above on pale background. "
     + STYLE),
    ("dive-reel-30m",
     "Dive Reel 30m",
     "A compact black finger-spool dive reel wound with white braided line (30 m), "
     "a small stainless double-ender clip attached, shown from a slight side angle "
     "on a pale background. " + STYLE),
    ("surface-marker-buoy-smb",
     "Surface Marker Buoy (SMB)",
     "A bright fluorescent-orange inflatable scuba surface marker buoy "
     "(long sausage shape ~1.2 m, vertical), partially inflated, "
     "with a black oral-inflate valve at the bottom and a clip at the top, "
     "isolated on a pale cyan gradient background. " + STYLE),
    ("wetsuit-shampoo-250ml",
     "Wetsuit Shampoo 250ml",
     "A 250 ml cylindrical white plastic bottle of neoprene wetsuit cleaner with a "
     "navy-blue flip-cap, minimalist unbranded design, standing upright, "
     "next to a small folded black neoprene wetsuit cuff faintly visible. " + STYLE),
]


async def generate_one(slug: str, name: str, prompt: str) -> tuple[str, bool, str]:
    """Returns (slug, ok, message). Skips if file already exists."""
    out_path = OUT_DIR / f"{slug}.png"
    if out_path.exists() and out_path.stat().st_size > 1000:
        return (slug, True, f"skip (exists, {out_path.stat().st_size} bytes)")
    try:
        chat = LlmChat(
            api_key=API_KEY,
            session_id=f"gen-product-{slug}-{int(time.time())}",
            system_message="You are a product-photography AI generator.",
        ).with_model("gemini", MODEL).with_params(modalities=["image", "text"])
        msg = UserMessage(text=prompt)
        _text, images = await chat.send_message_multimodal_response(msg)
        if not images:
            return (slug, False, "no images returned")
        img = images[0]
        b = base64.b64decode(img["data"])
        out_path.write_bytes(b)
        return (slug, True, f"wrote {len(b)} bytes mime={img.get('mime_type', '?')}")
    except Exception as e:
        return (slug, False, f"ERR: {type(e).__name__}: {e}")


async def main():
    print(f"Generating {len(PRODUCTS)} product images → {OUT_DIR}")
    results = []
    for slug, name, prompt in PRODUCTS:
        t0 = time.time()
        slug_done, ok, msg = await generate_one(slug, name, prompt)
        dt = time.time() - t0
        marker = "OK " if ok else "FAIL"
        print(f"  [{marker}] {slug_done:35s} ({dt:5.1f}s) {msg}")
        results.append((slug_done, ok))
    print()
    print(f"DONE: {sum(1 for _, ok in results if ok)}/{len(results)} succeeded")
    if any(not ok for _, ok in results):
        print("FAILED slugs:", [s for s, ok in results if not ok])
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
