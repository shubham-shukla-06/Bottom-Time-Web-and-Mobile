from database import db
from config import SUPER_ADMINS
from datetime import datetime, timezone
import uuid

from dive_profile_synth import generate_synthetic_profile


async def seed_database() -> None:
    for sa in SUPER_ADMINS:
        existing = await db.users.find_one({"email": sa["email"]})
        if existing:
            await db.users.update_one({"email": sa["email"]}, {"$set": {"role": "admin", "status": "active"}})
        else:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": sa["email"],
                "phone": sa["phone"],
                "name": sa["email"].split("@")[0].replace(".", " ").title(),
                "role": "admin",
                "status": "active",
                "email_verified": True,
                "phone_verified": True,
                "onboarding_complete": True,
                "interests": [],
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

    await db.analytics_events.create_index("event_type")
    await db.analytics_events.create_index("created_at")

    # Seed regular diver test account
    diver_test = await db.users.find_one({"email": "testuser@bottom-time.com"})
    if not diver_test:
        diver_user_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": diver_user_id,
            "email": "testuser@bottom-time.com",
            "phone": "+919876543210",
            "name": "Test Diver",
            "role": "diver",
            "status": "active",
            "email_verified": True,
            "phone_verified": True,
            "onboarding_complete": True,
            "experience_level": "intermediate",
            "certification_level": "Open Water",
            "certification_agency": "PADI",
            "total_dives": 25,
            "interests": ["diving", "marine conservation"],
            "currency": "USD",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        print("Seeded diver test account: testuser@bottom-time.com / +919876543210 / OTP: 007320")
    else:
        await db.users.update_one({"email": "testuser@bottom-time.com"}, {"$set": {
            "phone": "+919876543210", "role": "diver", "status": "active",
            "email_verified": True, "phone_verified": True, "onboarding_complete": True,
        }})

    # Seed operator test account
    op_test = await db.users.find_one({"email": "testoperator@bottom-time.com"})
    if not op_test:
        op_user_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": op_user_id,
            "email": "testoperator@bottom-time.com",
            "phone": "+919876543211",
            "name": "Test Dive Operator",
            "role": "operator",
            "status": "active",
            "email_verified": True,
            "phone_verified": True,
            "onboarding_complete": True,
            "operator_verified": True,
            "business_name": "Bottom Time Dive Center",
            "interests": ["diving", "marine conservation"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        print("Seeded operator test account: testoperator@bottom-time.com / +919876543211 / OTP: 007320")
    else:
        # Ensure test operator always has correct fields
        await db.users.update_one({"email": "testoperator@bottom-time.com"}, {"$set": {
            "phone": "+919876543211", "role": "operator", "status": "active",
            "operator_verified": True, "business_name": "Bottom Time Dive Center",
            "onboarding_complete": True,
        }})

    # Seed instructor test account
    instr_test = await db.users.find_one({"email": "testinstructor@bottom-time.com"})
    if not instr_test:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": "testinstructor@bottom-time.com",
            "phone": "+919876543212",
            "name": "Test Dive Instructor",
            "role": "instructor",
            "status": "active",
            "email_verified": True,
            "phone_verified": True,
            "onboarding_complete": True,
            "instructor_certification": "PADI Master Scuba Diver Trainer",
            "instructor_agency": "PADI",
            "instructor_specialties": ["Open Water", "Advanced Open Water", "Wreck Diving"],
            "instructor_years": 8,
            "interests": ["diving", "teaching", "marine conservation"],
            "currency": "USD",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        print("Seeded instructor test account: testinstructor@bottom-time.com / OTP: 007320")
    else:
        await db.users.update_one({"email": "testinstructor@bottom-time.com"}, {"$set": {
            "role": "instructor", "status": "active",
            "email_verified": True, "phone_verified": True, "onboarding_complete": True,
        }})

    # ─── LISTINGS — single source of truth: operator_dive_listings ───
    # Migrate any legacy `db.listings` data into the rich collection (one-time).
    legacy_count = await db.listings.count_documents({})
    if legacy_count > 0:
        legacy_docs = await db.listings.find({}, {"_id": 0}).to_list(legacy_count)
        legacy_type_to_rich = {
            "dives": "day_dive", "courses": "course", "liveaboards": "liveaboard",
            "day_trips": "trip", "snorkeling": "snorkeling",
        }
        migrated = 0
        for ld in legacy_docs:
            existing = await db.operator_dive_listings.find_one({"id": ld.get("id")}, {"_id": 0, "id": 1})
            if existing:
                continue
            now_iso = ld.get("created_at") or datetime.now(timezone.utc).isoformat()
            rich = {
                "id": ld.get("id") or str(uuid.uuid4()),
                "operator_id": ld.get("operator_id") or "seed",
                "operator_name": ld.get("operator_name") or "Bottom Time Demo",
                "operator_verified": True,
                "title": ld.get("name", "Untitled Listing"),
                "description": ld.get("description", ""),
                "listing_type": legacy_type_to_rich.get(ld.get("type", ""), "day_dive"),
                "location": ld.get("location", ""),
                "country": ld.get("country", ""),
                "image_url": ld.get("image_url") or "",
                "photos": [{"url": ld["image_url"], "caption": ld.get("name", ""), "order": 0}] if ld.get("image_url") else [],
                "videos": [],
                "dive_sites": [],
                "num_dives": 1,
                "nitrox_available": False,
                "nitrox_price": 0,
                "max_depth": 30,
                "difficulty_level": ld.get("difficulty", "beginner"),
                "certification_required": "Open Water",
                "gear_rental": {"included": False, "price": 0, "items": []},
                "arrival_date": None,
                "departure_date": None,
                "duration_days": 1,
                "schedule_type": "on_demand",
                "max_slots": 20,
                "max_per_booking": 6,
                "accommodation": {"included": False, "rooms": []},
                "inclusions": ld.get("highlights", []),
                "exclusions": [],
                "price": ld.get("price", 0),
                "currency": ld.get("currency", "USD"),
                "cancellation_policy": "",
                "refund_policy": "",
                "terms_conditions": "",
                "legal_disclaimer": "",
                "tcs_compliance": {"applicable": False, "rate": 5.0, "disclaimer": ""},
                "directions": {"text": "", "nearest_airport": "", "transfers_available": False, "transfer_price": 0},
                "medical_waiver_required": True,
                "rating": ld.get("rating", 0),
                "review_count": ld.get("review_count", 0),
                "status": "active",
                "created_at": now_iso,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.operator_dive_listings.insert_one(rich)
            migrated += 1
        if migrated:
            print(f"Migrated {migrated} legacy listings to operator_dive_listings")
        # Drop the legacy collection so it can no longer be the source of truth
        await db.listings.drop()
        print("Dropped legacy db.listings collection")

    # Seed sample rich listings if none exist
    rich_count = await db.operator_dive_listings.count_documents({})
    if rich_count == 0:
        now = datetime.now(timezone.utc).isoformat()
        samples = [
            ("Maldives Reef Divers", "day_dive", "Premier dive center in the heart of Maldives with access to world-class reef diving. Explore vibrant coral gardens, encounter manta rays, and drift dive through crystal-clear channels.", "Male", "Maldives", 150.0, "intermediate", "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800", 4.8, 234, ["PADI certified", "Equipment included", "Small groups", "Manta ray encounters"]),
            ("Advanced Wreck Diving Course", "course", "Learn wreck diving techniques and safety procedures with hands-on training at real wreck sites along the Indian coastline.", "Goa", "India", 299.0, "advanced", "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=800", 4.9, 87, ["Certification included", "Expert instructor", "Real wreck sites"]),
            ("Caribbean Liveaboard Adventure", "liveaboard", "7-day liveaboard journey exploring the best Caribbean dive sites. Multiple dives daily with experienced crew and all meals included.", "Grand Cayman", "Cayman Islands", 1899.0, "intermediate", "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800", 4.7, 156, ["All meals included", "Multiple dives daily", "Experienced crew"]),
            ("Sarah Thompson - PADI Master Instructor", "course", "20+ years experience teaching all levels from beginner to professional. Specializing in patient, confidence-building instruction in warm tropical waters.", "Bali", "Indonesia", 80.0, "beginner", "https://images.unsplash.com/photo-1583212292454-1fe6229603b7?w=800", 5.0, 312, ["PADI Master Instructor", "Multilingual", "Patient teaching style"]),
            ("Blue Horizon Dive Center", "trip", "Family-run dive center on the stunning coast of Hurghada. Access to famous Red Sea reefs, wall dives, and night diving experiences.", "Hurghada", "Egypt", 65.0, "beginner", "https://images.unsplash.com/photo-1682687982501-1e58ab814714?w=800", 4.6, 189, ["Red Sea access", "Night dives available", "Family friendly"]),
            ("Open Water Diver Certification", "course", "Start your diving journey with a full PADI Open Water Diver course. Includes pool sessions, theory, and open water dives in crystal-clear Thai waters.", "Koh Tao", "Thailand", 350.0, "beginner", "https://images.unsplash.com/photo-1544551763-77ef2d0cfc6c?w=800", 4.9, 421, ["PADI certification", "All equipment provided", "Small class sizes"]),
            ("Raja Ampat Explorer Liveaboard", "liveaboard", "10-day expedition through the heart of the Coral Triangle. Raja Ampat boasts the highest marine biodiversity on Earth.", "Sorong", "Indonesia", 3200.0, "advanced", "https://images.unsplash.com/photo-1583212292454-1fe6229603b7?w=800", 4.9, 78, ["Coral Triangle", "30+ dive sites", "Marine biologist on board"]),
            ("Marco Rivera - Underwater Photography Pro", "day_dive", "Award-winning underwater photographer offering dive + photography workshops. Learn to capture the ocean's beauty.", "Cozumel", "Mexico", 120.0, "intermediate", "https://images.unsplash.com/photo-1682687220063-4742bd7fd538?w=800", 4.8, 145, ["Photography workshop", "Camera rental included", "Award-winning instructor"]),
            ("Great Barrier Reef Day Trips", "trip", "Daily departures to the outer Great Barrier Reef. Snorkel or dive among the world's most famous coral ecosystem.", "Cairns", "Australia", 210.0, "beginner", "https://images.unsplash.com/photo-1682687982360-3fbab65f9d50?w=800", 4.7, 567, ["Great Barrier Reef", "Lunch included", "Snorkel + dive combo"]),
        ]
        docs = []
        for (title, ltype, desc, loc, country, price, diff, img, rating, rc, highlights) in samples:
            docs.append({
                "id": str(uuid.uuid4()),
                "operator_id": "seed",
                "operator_name": "Bottom Time Demo",
                "operator_verified": True,
                "title": title, "description": desc, "listing_type": ltype,
                "location": loc, "country": country,
                "image_url": img,
                "photos": [{"url": img, "caption": title, "order": 0}],
                "videos": [], "dive_sites": [],
                "num_dives": 1, "nitrox_available": False, "nitrox_price": 0,
                "max_depth": 30, "difficulty_level": diff, "certification_required": "Open Water",
                "gear_rental": {"included": False, "price": 0, "items": []},
                "arrival_date": None, "departure_date": None, "duration_days": 1,
                "schedule_type": "on_demand", "max_slots": 20, "max_per_booking": 6,
                "accommodation": {"included": False, "rooms": []},
                "inclusions": highlights, "exclusions": [],
                "price": price, "currency": "USD",
                "cancellation_policy": "", "refund_policy": "",
                "terms_conditions": "", "legal_disclaimer": "",
                "tcs_compliance": {"applicable": False, "rate": 5.0, "disclaimer": ""},
                "directions": {"text": "", "nearest_airport": "", "transfers_available": False, "transfer_price": 0},
                "medical_waiver_required": True,
                "rating": rating, "review_count": rc,
                "status": "active",
                "created_at": now, "updated_at": now,
            })
        await db.operator_dive_listings.insert_many(docs)
        print(f"Seeded {len(docs)} sample dive listings")

    product_count = await db.products.count_documents({})
    if product_count == 0:
        now = datetime.now(timezone.utc).isoformat()
        sample_products = [
            {"id": str(uuid.uuid4()), "name": "Bottom Time Logo Tee", "category": "merch", "description": "Soft cotton crew neck with embroidered wave logo. Unisex fit.", "price": 34.99, "currency": "USD", "image_url": "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800", "sizes": ["S","M","L","XL"], "in_stock": True, "sold_count": 245, "weight": 0.2, "status": "active", "created_at": now, "rating": 4.8, "review_count": 52},
            {"id": str(uuid.uuid4()), "name": "Dive Flag Cap", "category": "merch", "description": "Embroidered dive flag on structured snapback. One size fits all.", "price": 28.99, "currency": "USD", "image_url": "https://images.unsplash.com/photo-1588850561407-ed78c334e67a?w=800", "sizes": ["One Size"], "in_stock": True, "sold_count": 189, "weight": 0.1, "status": "active", "created_at": now, "rating": 4.6, "review_count": 33},
            {"id": str(uuid.uuid4()), "name": "Ocean Explorer Hoodie", "category": "merch", "description": "Heavyweight French terry hoodie. Perfect for post-dive warmth.", "price": 64.99, "currency": "USD", "image_url": "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800", "sizes": ["S","M","L","XL","XXL"], "in_stock": True, "sold_count": 167, "weight": 0.6, "status": "active", "created_at": now, "rating": 4.9, "review_count": 41},
            {"id": str(uuid.uuid4()), "name": "Reef Sticker Pack", "category": "merch", "description": "Set of 8 waterproof vinyl stickers. Marine life and dive motifs.", "price": 12.99, "currency": "USD", "image_url": "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800", "sizes": [], "in_stock": True, "sold_count": 412, "weight": 0.05, "status": "active", "created_at": now, "rating": 4.5, "review_count": 78},
            {"id": str(uuid.uuid4()), "name": "Dry Bag 20L", "category": "gear", "description": "Waterproof roll-top dry bag. Keep your gear safe on the boat.", "price": 39.99, "currency": "USD", "image_url": "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800", "sizes": [], "in_stock": True, "sold_count": 334, "weight": 0.35, "status": "active", "created_at": now, "rating": 4.7, "review_count": 61},
            {"id": str(uuid.uuid4()), "name": "Dive Computer Wrist Mount", "category": "gear", "description": "Universal wrist strap for dive computers. Quick-release buckle.", "price": 24.99, "currency": "USD", "image_url": "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800", "sizes": [], "in_stock": True, "sold_count": 156, "weight": 0.08, "status": "active", "created_at": now, "rating": 4.4, "review_count": 29},
            {"id": str(uuid.uuid4()), "name": "Reef-Safe Sunscreen SPF50", "category": "essentials", "description": "Biodegradable, coral-safe mineral sunscreen. 100ml travel size.", "price": 18.99, "currency": "USD", "image_url": "https://images.unsplash.com/photo-1556227702-d1e4e7b5c232?w=800", "sizes": [], "in_stock": True, "sold_count": 523, "weight": 0.15, "status": "active", "created_at": now, "rating": 4.8, "review_count": 94},
            {"id": str(uuid.uuid4()), "name": "Mesh Gear Bag", "category": "gear", "description": "Large mesh bag for rinsing and drying dive equipment. 80L capacity.", "price": 29.99, "currency": "USD", "image_url": "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800", "sizes": [], "in_stock": True, "sold_count": 201, "weight": 0.45, "status": "active", "created_at": now, "rating": 4.3, "review_count": 37},
            {"id": str(uuid.uuid4()), "name": "Underwater Torch 1000 Lumens", "category": "gear", "description": "Rechargeable dive torch with 3 modes. Rated to 100m depth.", "price": 54.99, "currency": "USD", "image_url": "https://images.unsplash.com/photo-1590479773265-7464e5d48f73?w=800", "sizes": [], "in_stock": True, "sold_count": 98, "weight": 0.3, "status": "active", "created_at": now, "rating": 4.6, "review_count": 22},
            {"id": str(uuid.uuid4()), "name": "Bottom Time Water Bottle", "category": "merch", "description": "Insulated stainless steel bottle. 750ml. Keeps cold for 24hrs.", "price": 29.99, "currency": "USD", "image_url": "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800", "sizes": [], "in_stock": True, "sold_count": 298, "weight": 0.4, "status": "active", "created_at": now, "rating": 4.7, "review_count": 56},
            {"id": str(uuid.uuid4()), "name": "Neoprene Mask Strap Cover", "category": "gear", "description": "Comfortable padded neoprene strap for any dive mask. Prevents hair pulling.", "price": 14.99, "currency": "USD", "image_url": "https://images.unsplash.com/photo-1544551763-77ef2d0cfc6c?w=800", "sizes": [], "in_stock": True, "sold_count": 445, "weight": 0.05, "status": "active", "created_at": now, "rating": 4.9, "review_count": 102},
            {"id": str(uuid.uuid4()), "name": "Silicone Defog Spray", "category": "essentials", "description": "Anti-fog spray for dive masks. 60ml bottle lasts 100+ dives.", "price": 9.99, "currency": "USD", "image_url": "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800", "sizes": [], "in_stock": True, "sold_count": 678, "weight": 0.08, "status": "active", "created_at": now, "rating": 4.5, "review_count": 134},
            {"id": str(uuid.uuid4()), "name": "Dive Slate & Pencil", "category": "essentials", "description": "Underwater communication slate with attached pencil. Wrist mount.", "price": 16.99, "currency": "USD", "image_url": "https://images.unsplash.com/photo-1544377193-33dcf4d68fb5?w=800", "sizes": [], "in_stock": True, "sold_count": 312, "weight": 0.12, "status": "active", "created_at": now, "rating": 4.3, "review_count": 58},
            {"id": str(uuid.uuid4()), "name": "Dive Reel 30m", "category": "gear", "description": "Compact finger spool with 30m line. Essential for SMB deployment.", "price": 32.99, "currency": "USD", "image_url": "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800", "sizes": [], "in_stock": True, "sold_count": 167, "weight": 0.15, "status": "active", "created_at": now, "rating": 4.6, "review_count": 31},
            {"id": str(uuid.uuid4()), "name": "Surface Marker Buoy (SMB)", "category": "gear", "description": "Bright orange delayed SMB with oral inflate and dump valve.", "price": 27.99, "currency": "USD", "image_url": "https://images.unsplash.com/photo-1544551763-77ef2d0cfc6c?w=800", "sizes": [], "in_stock": True, "sold_count": 234, "weight": 0.2, "status": "active", "created_at": now, "rating": 4.7, "review_count": 44},
            {"id": str(uuid.uuid4()), "name": "Wetsuit Shampoo 250ml", "category": "essentials", "description": "Extends wetsuit life. Removes salt, chlorine and odors.", "price": 11.99, "currency": "USD", "image_url": "https://images.unsplash.com/photo-1556227702-d1e4e7b5c232?w=800", "sizes": [], "in_stock": True, "sold_count": 389, "weight": 0.28, "status": "active", "created_at": now, "rating": 4.4, "review_count": 67},
        ]
        await db.products.insert_many(sample_products)
        print(f"Seeded {len(sample_products)} sample products")

    event_count = await db.events.count_documents({})
    if event_count == 0:
        sample_events = [
            {"id": str(uuid.uuid4()), "title": "Reef Cleanup Dive - Bali", "event_type": "cleanup", "description": "Join fellow divers for an underwater reef cleanup at Tulamben. All levels welcome. Equipment provided.", "location": "Tulamben, Bali, Indonesia", "date": "2026-03-15", "time": "08:00 AM", "image_url": "https://images.unsplash.com/photo-1583212292454-1fe6229603b7?w=800", "organizer": "Bali Dive Community", "max_attendees": 30, "attendees": [], "status": "active"},
            {"id": str(uuid.uuid4()), "title": "Night Dive Social - Red Sea", "event_type": "social_dive", "description": "Group night dive followed by beachside BBQ. Must hold OW certification or higher.", "location": "Hurghada, Egypt", "date": "2026-03-22", "time": "06:30 PM", "image_url": "https://images.unsplash.com/photo-1682687982501-1e58ab814714?w=800", "organizer": "Red Sea Divers Club", "max_attendees": 20, "attendees": [], "status": "active"},
            {"id": str(uuid.uuid4()), "title": "Underwater Photography Workshop", "event_type": "workshop", "description": "Two-day workshop covering macro and wide-angle techniques. Camera rental available.", "location": "Cozumel, Mexico", "date": "2026-04-05", "time": "09:00 AM", "image_url": "https://images.unsplash.com/photo-1682687220063-4742bd7fd538?w=800", "organizer": "Ocean Lens Academy", "max_attendees": 12, "attendees": [], "status": "active"},
            {"id": str(uuid.uuid4()), "title": "Dive & Dine Meetup - Sydney", "event_type": "meetup", "description": "Casual meetup for Sydney divers. Share stories, plan trips, and meet your next dive buddy.", "location": "Sydney, Australia", "date": "2026-03-28", "time": "07:00 PM", "image_url": "https://images.unsplash.com/photo-1682687982360-3fbab65f9d50?w=800", "organizer": "Sydney Dive Social", "max_attendees": 50, "attendees": [], "status": "active"},
            {"id": str(uuid.uuid4()), "title": "Manta Ray Season - Group Trip", "event_type": "group_trip", "description": "5-day group trip to swim with manta rays. Includes accommodation and 8 dives.", "location": "Komodo, Indonesia", "date": "2026-05-10", "time": "All Day", "image_url": "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800", "organizer": "Bottom Time Trips", "max_attendees": 16, "attendees": [], "status": "active"},
            {"id": str(uuid.uuid4()), "title": "Freediving Introduction - Koh Tao", "event_type": "workshop", "description": "One-day intro to freediving. Learn breathing techniques and dive to 10m on a single breath.", "location": "Koh Tao, Thailand", "date": "2026-04-12", "time": "08:00 AM", "image_url": "https://images.unsplash.com/photo-1544551763-77ef2d0cfc6c?w=800", "organizer": "Apnea Academy Thailand", "max_attendees": 10, "attendees": [], "status": "active"},
        ]
        await db.events.insert_many(sample_events)
        print(f"Seeded {len(sample_events)} events")


    # ─── Seed 8 demo dives for testuser so charts/maps render meaningfully ───
    await seed_demo_dives_for_testuser()

    # ─── Backfill synthetic dive profiles for legacy dives ───────────────
    # Any dive log that has max_depth + duration but no profile points gets a
    # realistic descent / bottom / safety-stop / ascent profile so charts on
    # /dive-logs, /dive-log/:id, /dive-dashboard, the share-card, and the
    # profile-analysis modal render out of the box. Idempotent: only stamps
    # dives where `profile` is missing or empty.
    missing_query = {
        "max_depth": {"$exists": True, "$ne": None},
        "duration": {"$exists": True, "$ne": None},
        "$or": [
            {"profile": {"$exists": False}},
            {"profile": None},
            {"profile": {"$size": 0}},
        ],
    }
    backfilled = 0
    async for log in db.dive_logs.find(missing_query, {"_id": 0, "id": 1, "max_depth": 1, "duration": 1}):
        profile = generate_synthetic_profile(float(log["max_depth"]), float(log["duration"]))
        if not profile:
            continue
        await db.dive_logs.update_one(
            {"id": log["id"]},
            {"$set": {"profile": profile, "profile_source": "synthetic"}},
        )
        backfilled += 1
    if backfilled:
        print(f"Backfilled synthetic depth profiles on {backfilled} dive log(s)")

DEMO_DIVES_TESTUSER = [
    {
        "site_name": "Manta Point", "location": "South Ari Atoll, Maldives", "country": "Maldives",
        "date": "2026-01-15", "dive_type": "reef", "max_depth": 18.0, "duration": 52,
        "water_temp": 28.0, "air_temp": 31.0, "visibility": "30m+", "gps_lat": 3.4924, "gps_lng": 72.8390,
        "buddy": "Aarav P", "rating": 5, "gas_mix": "Air",
        "tags": ["manta", "cleaning-station", "drift"],
        "notes": "Spotted 4 mantas circling the cleaning station — held position for 25 min in mild current.",
        "sightings": [{"species": "Reef manta ray", "count": 4}, {"species": "Bluefin trevally", "count": 12}],
    },
    {
        "site_name": "Banana Reef", "location": "North Malé, Maldives", "country": "Maldives",
        "date": "2026-01-17", "dive_type": "reef", "max_depth": 24.0, "duration": 47,
        "water_temp": 29.0, "air_temp": 32.0, "visibility": "25m", "gps_lat": 4.2104, "gps_lng": 73.5510,
        "buddy": "Aarav P", "rating": 4, "gas_mix": "Air",
        "tags": ["reef", "schooling-fish"],
        "notes": "Schooling bannerfish and oriental sweetlips along the wall. Tight current at the corner.",
    },
    {
        "site_name": "SS Thistlegorm", "location": "Sharm El Sheikh, Egypt", "country": "Egypt",
        "date": "2026-02-08", "dive_type": "wreck", "max_depth": 32.0, "duration": 41,
        "water_temp": 24.0, "air_temp": 22.0, "visibility": "20m", "gps_lat": 27.8137, "gps_lng": 33.9211,
        "buddy": "Riya K", "rating": 5, "gas_mix": "32% Nitrox",
        "tags": ["wreck", "history", "ww2", "penetration"],
        "notes": "Penetrated cargo holds at 28m — motorbikes and rifles still recognisable. Surge picked up on ascent.",
        "sightings": [{"species": "Bluespotted ribbontail ray", "count": 1}, {"species": "Crocodilefish", "count": 2}],
    },
    {
        "site_name": "Yolanda Reef", "location": "Ras Mohammed, Egypt", "country": "Egypt",
        "date": "2026-02-10", "dive_type": "drift", "max_depth": 28.0, "duration": 49,
        "water_temp": 25.0, "air_temp": 23.0, "visibility": "30m", "gps_lat": 27.7257, "gps_lng": 34.2615,
        "buddy": "Riya K", "rating": 5, "gas_mix": "32% Nitrox",
        "tags": ["drift", "wall", "pelagic"],
        "notes": "Classic Ras Mo drift — barracuda tornado at the corner, two grey reef sharks cruised past.",
        "sightings": [{"species": "Grey reef shark", "count": 2}, {"species": "Great barracuda", "count": 40}],
    },
    {
        "site_name": "USS Liberty", "location": "Tulamben, Bali, Indonesia", "country": "Indonesia",
        "date": "2026-03-03", "dive_type": "wreck", "max_depth": 29.0, "duration": 55,
        "water_temp": 27.0, "air_temp": 30.0, "visibility": "18m", "gps_lat": -8.2747, "gps_lng": 115.5917,
        "buddy": "M3 Tester", "rating": 4, "gas_mix": "Air",
        "tags": ["wreck", "macro", "history"],
        "notes": "Shore entry over the boulders. Bumphead parrotfish school at first light, then macro along the stern.",
    },
    {
        "site_name": "Crystal Bay", "location": "Nusa Penida, Indonesia", "country": "Indonesia",
        "date": "2026-03-05", "dive_type": "drift", "max_depth": 25.0, "duration": 44,
        "water_temp": 26.0, "air_temp": 30.0, "visibility": "25m", "gps_lat": -8.7128, "gps_lng": 115.5290,
        "buddy": "M3 Tester", "rating": 5, "gas_mix": "Air",
        "tags": ["mola", "drift", "cold-thermocline"],
        "notes": "Mola mola at 22m — cold thermocline hit hard around 18m. Three minutes with the sunfish before it dropped.",
        "sightings": [{"species": "Mola mola (oceanic sunfish)", "count": 1}],
    },
    {
        "site_name": "Manta Sandy", "location": "Raja Ampat, Indonesia", "country": "Indonesia",
        "date": "2026-03-10", "dive_type": "reef", "max_depth": 14.0, "duration": 60,
        "water_temp": 28.0, "air_temp": 31.0, "visibility": "20m", "gps_lat": -0.5667, "gps_lng": 130.6833,
        "buddy": "Aarav P", "rating": 5, "gas_mix": "Air",
        "tags": ["manta", "cleaning-station", "shallow"],
        "notes": "Stayed put at the cleaning station — six different manta passes, including a 4m black morph.",
        "sightings": [{"species": "Reef manta ray", "count": 6}],
    },
    {
        "site_name": "Goa Wall Night Dive", "location": "Grande Island, India", "country": "India",
        "date": "2026-03-22", "dive_type": "night", "max_depth": 12.0, "duration": 38,
        "water_temp": 26.0, "air_temp": 27.0, "visibility": "8m", "gps_lat": 15.3667, "gps_lng": 73.7833,
        "buddy": "Riya K", "rating": 3, "gas_mix": "Air",
        "tags": ["night", "bioluminescence", "macro"],
        "notes": "First India night dive — bioluminescent plankton trails on every hand movement. Octopus hunting at 10m.",
    },
]


async def seed_demo_dives_for_testuser() -> None:
    """Insert 8 realistic demo dives across Maldives, Egypt, Indonesia, India for
    testuser@bottom-time.com so Overview charts, dive-sites map, and the
    Personal Records cards have varied data to render. Idempotent: upserts by
    (user_id, site_name, date).
    """
    user = await db.users.find_one({"email": "testuser@bottom-time.com"}, {"_id": 0, "id": 1})
    if not user:
        print("seed_demo_dives_for_testuser: testuser not found — skipping")
        return

    user_id = user["id"]
    inserted = 0
    updated = 0
    for d in DEMO_DIVES_TESTUSER:
        profile = generate_synthetic_profile(d["max_depth"], d["duration"])
        existing = await db.dive_logs.find_one(
            {"user_id": user_id, "site_name": d["site_name"], "date": d["date"]},
            {"_id": 0, "id": 1},
        )
        payload = {
            **d,
            "user_id": user_id,
            "profile": profile,
            "profile_source": "synthetic",
            "source": "manual",
        }
        if existing:
            await db.dive_logs.update_one(
                {"id": existing["id"]},
                {"$set": payload},
            )
            updated += 1
        else:
            await db.dive_logs.insert_one({
                "id": str(uuid.uuid4()),
                "created_at": datetime.now(timezone.utc).isoformat(),
                **payload,
            })
            inserted += 1
    print(f"Demo dives for testuser: inserted={inserted} updated={updated} (total={len(DEMO_DIVES_TESTUSER)})")

