from fastapi import FastAPI, APIRouter, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi.errors import RateLimitExceeded
from rate_limiter import limiter
from perf_monitor import PerfMiddleware
from config import UPLOAD_DIR
from database import client, db
from seed import seed_database
from datetime import datetime, timezone
import asyncio
from routes.auth import router as auth_router
from routes.sessions import router as sessions_router
from routes.webauthn import router as webauthn_router
from routes.welcome_slides import admin_router as welcome_slides_admin_router, public_router as welcome_slides_public_router
from routes.listings import router as listings_router
from routes.operator import router as operator_router
from routes.bookings import router as bookings_router, webhook_router
from routes.admin import router as admin_router
from routes.admin_bulk import router as admin_bulk_router
from routes.dev import router as dev_router
from routes.site_content import router as site_content_router, public_router as site_content_public_router
from routes.cmd import router as cmd_router
from routes.social import router as social_router
from routes.content import router as content_router
from routes.public import router as public_router
from routes.push import router as push_router
from routes.payments import router as payments_router, webhook_router as razorpay_webhook_router
from routes.payouts import router as payouts_router
from routes.tax import router as tax_router
from routes.orders import router as orders_router
from routes.shop_admin import router as shop_admin_router
from routes.shipping import router as shipping_router
from routes.fulfillment import router as fulfillment_router
from routes.operator_listings import router as operator_listings_router, review_router as operator_review_router
from routes.dive_import import router as dive_import_router
from routes.dive_planner import router as dive_planner_router
from routes.dive_advanced import router as dive_advanced_router
from routes.dive_share import router as dive_share_router
from routes.diver_profile import router as diver_profile_router
from routes.buddy_finder import router as buddy_finder_router
from routes.trip_planner import router as trip_planner_router
from routes.social_feed import router as social_feed_router
from routes.surface_log import router as surface_log_router
from routes.marine_life import router as marine_life_router
from routes.waitlist import router as waitlist_router
from routes.security import router as security_router
from routes.share_tracking import router as share_tracking_router
import os
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app):
    """Startup and shutdown lifecycle."""
    await seed_database()

    # --- Performance: MongoDB Indexes ---
    await db.users.create_index("id", unique=True)
    await db.users.create_index("email", unique=True)
    await db.users.create_index("phone")
    await db.users.create_index("role")
    await db.listings.create_index("id", unique=True)
    await db.listings.create_index("status")
    await db.listings.create_index("operator_id")
    await db.products.create_index("id", unique=True)
    await db.reviews.create_index("listing_id")
    await db.reviews.create_index("user_id")
    await db.bookings.create_index("id", unique=True)
    await db.bookings.create_index("user_id")
    await db.bookings.create_index("listing_id")
    await db.orders.create_index("id", unique=True)
    await db.orders.create_index("user_id")
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.notifications.create_index([("user_id", 1), ("read", 1)])
    await db.feed_items.create_index("id", unique=True)
    await db.feed_items.create_index([("user_id", 1), ("created_at", -1)])
    await db.feed_reactions.create_index([("item_id", 1), ("user_id", 1)])
    await db.connections.create_index("from_id")
    await db.connections.create_index("to_id")
    await db.connections.create_index("status")
    await db.surface_logs.create_index("id", unique=True)
    await db.surface_logs.create_index("user_id")
    await db.threads.create_index("id", unique=True)
    await db.threads.create_index("participant_ids")
    await db.messages.create_index([("thread_id", 1), ("created_at", -1)])
    await db.dive_logs.create_index([("user_id", 1), ("date", -1)])
    await db.wishlists.create_index([("user_id", 1), ("listing_id", 1)])
    await db.bucket_list.create_index("user_id")
    await db.trips.create_index("creator_id")
    await db.dive_trips.create_index("operator_id")
    await db.otp_rate_limits.create_index("sent_at", expireAfterSeconds=600)
    await db.otp_codes.create_index("created_at", expireAfterSeconds=600)
    await db.cms_history.create_index([("page", 1), ("published_at", -1)])
    await db.cms_history.create_index("id", unique=True)

    # device_sessions (mobile biometric refresh-token model — Phase A, 2026-05-07)
    from device_sessions import ensure_indexes as _ds_indexes
    await _ds_indexes()

    # passkeys + WebAuthn challenges (web passkey login — Phase B, 2026-05-07)
    from passkeys import ensure_indexes as _pk_indexes
    await _pk_indexes()

    # Apple Sign-In — store the Apple `sub` on linked users so a single Apple
    # account maps to a single user record even when the email claim is the
    # private relay address (which differs per app).
    await db.users.create_index(
        "apple_sub",
        unique=True,
        sparse=True,
        name="apple_sub_unique_sparse",
    )

    # One-time rename: welcome_slides.photographer_name → attribution_text.
    # The field used to be a person's name and the renderer prefixed it with
    # "Photo by ". The product now wants admins to type the credit verbatim
    # ("Kevin Charit" / "Photo: Kevin Charit / Unsplash" / "© 2024 …"). Carry
    # any existing rows over once, then drop the old key. Idempotent — rows
    # that already migrated have `attribution_text` and skip the $set.
    await db.welcome_slides.update_many(
        {"photographer_name": {"$exists": True}, "attribution_text": {"$exists": False}},
        [
            {"$set": {"attribution_text": "$photographer_name"}},
            {"$unset": "photographer_name"},
        ],
    )

    # One-time conversion of focal_point/zoom slides → server-side crop_box +
    # cropped JPEG. Idempotent: rows with `crop_box` and `image_url_original`
    # already are skipped.
    try:
        from routes.welcome_slides import migrate_legacy_slides as _mws_migrate
        await _mws_migrate()
    except Exception as exc:  # pragma: no cover — migration must never block startup
        import logging
        logging.getLogger("server").warning("welcome_slides crop_box migration: %s", exc)

    existing_fee = await db.platform_fees.find_one({"entity_type": "global"})
    if not existing_fee:
        await db.platform_fees.insert_one({
            "entity_type": "global", "entity_id": "global",
            "platform_fee_percent": 15.0,
            "updated_at": datetime.now(timezone.utc).isoformat()
        })

    async def _bg_scan():
        try:
            from security_scanner import run_full_scan
            await run_full_scan(save_to_db=True)
            logger.info("Startup security scan completed")
        except Exception as e:
            logger.warning(f"Startup security scan failed: {e}")
    asyncio.create_task(_bg_scan())

    async def _scheduled_publisher_loop():
        """Promote any CMS draft whose `scheduled_publish_at` has arrived. Polls every 30s.
        Also runs orphan-upload cleanup on the first tick so backend restart clears stale files."""
        from routes.site_content import run_scheduled_publisher_once, cleanup_orphan_uploads
        first = True
        while True:
            try:
                promoted = await run_scheduled_publisher_once()
                if promoted:
                    logger.info(f"Scheduled publisher promoted {promoted} CMS draft(s)")
                if first:
                    try:
                        deleted = await cleanup_orphan_uploads()
                        if deleted:
                            logger.info(f"Startup orphan-upload sweep deleted {deleted} file(s)")
                    except Exception as ce:
                        logger.warning(f"Startup orphan sweep failed: {ce}")
                    first = False
            except Exception as e:
                logger.warning(f"Scheduled publisher tick failed: {e}")
            await asyncio.sleep(30)
    asyncio.create_task(_scheduled_publisher_loop())

    yield
    client.close()


# --- Rate Limiter ---
app = FastAPI(lifespan=lifespan, openapi_url="/api/openapi.json", docs_url="/api/docs", redoc_url="/api/redoc")
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> dict:
    return JSONResponse(status_code=429, content={"detail": "Too many requests. Please try again later."})


# --- Security Headers Middleware ---
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next) -> dict:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(self)"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https:; frame-ancestors 'none'"
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        return response

app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

api_router = APIRouter(prefix="/api")
api_router.include_router(auth_router)
api_router.include_router(sessions_router)
api_router.include_router(webauthn_router)
api_router.include_router(welcome_slides_admin_router)
api_router.include_router(welcome_slides_public_router)
api_router.include_router(share_tracking_router)
api_router.include_router(listings_router)
api_router.include_router(operator_router)
api_router.include_router(bookings_router)
api_router.include_router(admin_router)
api_router.include_router(admin_bulk_router)
api_router.include_router(dev_router)
api_router.include_router(site_content_router)
api_router.include_router(site_content_public_router)
api_router.include_router(cmd_router)
api_router.include_router(social_router)
# dive_advanced_router MUST be before content_router because content has /dive-log/{log_id} wildcard
api_router.include_router(dive_advanced_router)
api_router.include_router(dive_share_router)
api_router.include_router(diver_profile_router)
api_router.include_router(buddy_finder_router)
api_router.include_router(trip_planner_router)
api_router.include_router(social_feed_router)
api_router.include_router(surface_log_router)
api_router.include_router(marine_life_router)
api_router.include_router(dive_planner_router)
api_router.include_router(dive_import_router)
api_router.include_router(content_router)
api_router.include_router(public_router)
api_router.include_router(push_router)
api_router.include_router(payments_router)
api_router.include_router(payouts_router)
api_router.include_router(tax_router)
api_router.include_router(orders_router)
api_router.include_router(shop_admin_router)
api_router.include_router(shipping_router)
api_router.include_router(fulfillment_router)
api_router.include_router(operator_listings_router)
api_router.include_router(waitlist_router)
api_router.include_router(security_router)

# Lightweight health probe (used by Emergent IDE preview detector + ops tooling)
@api_router.get("/health")
async def api_health() -> dict:
    return {"status": "ok", "service": "bottom-time-backend"}

app.include_router(api_router)
app.include_router(webhook_router)
app.include_router(razorpay_webhook_router)
app.include_router(operator_review_router)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(PerfMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=500)

cors_origins = os.environ.get('CORS_ORIGINS', '').split(',')
cors_origins = [o.strip() for o in cors_origins if o.strip()]
if not cors_origins:
    cors_origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_credentials="*" not in cors_origins,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-Session-Id"],
)
