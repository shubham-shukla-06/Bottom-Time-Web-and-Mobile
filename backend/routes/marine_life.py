"""
Marine Life — iNaturalist-powered species encyclopedia.
Single source of truth: iNaturalist API (https://api.inaturalist.org/v1)
"""
from fastapi import APIRouter, HTTPException, Depends, Body
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
import uuid
import httpx

router = APIRouter()

INAT_BASE = "https://api.inaturalist.org/v1"
INAT_HEADERS = {"User-Agent": "BottomTime/1.0 (dive logging platform)"}
MARINE_ICONIC_TAXA = "Actinopterygii,Mollusca,Cnidaria,Mammalia,Reptilia,Echinodermata,Crustacea"
# Specific marine taxon IDs for precise filtering (avoids land animals in trending)
# 47273=Chondrichthyes(sharks), 152871=Cetacea(whales), 47549=Echinodermata,
# 47534=Cnidaria, 47459=Cephalopoda(octopus), 47113=Nudibranchia,
# 39774=Chelonioidea(sea turtles), 47233=Perciformes(reef fish)
MARINE_TAXON_IDS = "47273,152871,47549,47534,47459,47113,39774,47233"


def _format_taxon(taxon: dict, observation_count: int = None) -> dict:
    """Format an iNaturalist taxon result into our standard shape."""
    photo = taxon.get("default_photo") or {}
    conservation = taxon.get("conservation_status") or {}
    return {
        "taxon_id": taxon.get("id"),
        "name": taxon.get("preferred_common_name") or taxon.get("name", ""),
        "scientific_name": taxon.get("name", ""),
        "photo_url": photo.get("medium_url"),
        "photo_square": photo.get("square_url"),
        "photo_attribution": photo.get("attribution", ""),
        "iconic_taxon": taxon.get("iconic_taxon_name", ""),
        "observations_count": observation_count or taxon.get("observations_count", 0),
        "conservation_status": conservation.get("status_name") if conservation else None,
        "conservation_authority": conservation.get("authority") if conservation else None,
        "wikipedia_url": taxon.get("wikipedia_url"),
        "rank": taxon.get("rank", ""),
    }


# ─── SEARCH ───────────────────────────────────────────

@router.get("/marine-life/search")
async def search_species(q: str = "", per_page: int = 20) -> dict:
    """Search marine species via iNaturalist taxa API."""
    if len(q) < 2:
        return {"results": [], "total": 0}
    try:
        async with httpx.AsyncClient(timeout=10.0, headers=INAT_HEADERS) as client:
            # Use taxon_id filter for marine taxa (more reliable than iconic_taxa for taxa search)
            resp = await client.get(f"{INAT_BASE}/taxa", params={
                "q": q,
                "rank": "species,subspecies",
                "is_active": "true",
                "per_page": min(per_page, 30),
                "taxon_id": MARINE_TAXON_IDS,
            })
            resp.raise_for_status()
            data = resp.json()
        results = [_format_taxon(t) for t in data.get("results", [])]
        return {"results": results, "total": data.get("total_results", 0)}
    except Exception as e:
        return {"results": [], "total": 0, "error": str(e)}


@router.get("/marine-life/autocomplete")
async def autocomplete_species(q: str = "") -> dict:
    """Fast autocomplete for species picker in dive log modal."""
    if len(q) < 2:
        return {"results": []}
    try:
        async with httpx.AsyncClient(timeout=6.0, headers=INAT_HEADERS) as client:
            # Use taxon_id filter for marine taxa (more reliable for autocomplete)
            resp = await client.get(f"{INAT_BASE}/taxa/autocomplete", params={
                "q": q,
                "rank": "species",
                "is_active": "true",
                "per_page": 10,
                "taxon_id": MARINE_TAXON_IDS,
            })
            resp.raise_for_status()
            data = resp.json()
        results = [_format_taxon(t) for t in data.get("results", [])]
        return {"results": results}
    except Exception:
        return {"results": []}


# ─── SPECIES DETAIL ───────────────────────────────────

@router.get("/marine-life/species/{taxon_id}")
async def get_species_detail(taxon_id: int) -> dict:
    """Get full species detail from iNaturalist by taxon ID."""
    try:
        async with httpx.AsyncClient(timeout=10.0, headers=INAT_HEADERS) as client:
            resp = await client.get(f"{INAT_BASE}/taxa/{taxon_id}")
            resp.raise_for_status()
            data = resp.json()

        results = data.get("results", [])
        if not results:
            raise HTTPException(status_code=404, detail="Species not found")

        taxon = results[0]
        photo = taxon.get("default_photo") or {}
        conservation = taxon.get("conservation_status") or {}
        ancestors = taxon.get("ancestors") or []

        # Build taxonomy chain
        taxonomy = {}
        for a in ancestors:
            rank = a.get("rank", "")
            if rank in ("kingdom", "phylum", "class", "order", "family", "genus"):
                taxonomy[rank] = {
                    "name": a.get("name", ""),
                    "common_name": a.get("preferred_common_name", ""),
                }

        # Gather all photos
        taxon_photos = taxon.get("taxon_photos") or []
        photos = []
        for tp in taxon_photos[:8]:
            p = tp.get("photo", {})
            photos.append({
                "url": p.get("medium_url") or p.get("url"),
                "large_url": (p.get("medium_url") or "").replace("/medium.", "/large.") if p.get("medium_url") else None,
                "attribution": p.get("attribution", ""),
                "license": p.get("license_code", ""),
            })

        return {
            "taxon_id": taxon.get("id"),
            "name": taxon.get("preferred_common_name") or taxon.get("name", ""),
            "scientific_name": taxon.get("name", ""),
            "rank": taxon.get("rank", ""),
            "iconic_taxon": taxon.get("iconic_taxon_name", ""),
            "observations_count": taxon.get("observations_count", 0),
            "photo": {
                "url": photo.get("medium_url"),
                "large_url": (photo.get("medium_url") or "").replace("/medium.", "/large.") if photo.get("medium_url") else None,
                "attribution": photo.get("attribution", ""),
            },
            "photos": photos,
            "taxonomy": taxonomy,
            "conservation": {
                "status": conservation.get("status_name"),
                "authority": conservation.get("authority"),
                "iucn_url": conservation.get("url"),
            } if conservation else None,
            "wikipedia_summary": taxon.get("wikipedia_summary", ""),
            "wikipedia_url": taxon.get("wikipedia_url"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch species: {str(e)}")


# ─── NEARBY SPECIES ──────────────────────────────────

@router.get("/marine-life/nearby")
async def nearby_species(lat: float, lng: float, radius: int = 50, per_page: int = 30) -> dict:
    """Get marine species observed near a GPS coordinate (via iNaturalist)."""
    try:
        async with httpx.AsyncClient(timeout=12.0, headers=INAT_HEADERS) as client:
            resp = await client.get(f"{INAT_BASE}/observations/species_counts", params={
                "lat": lat,
                "lng": lng,
                "radius": radius,
                "iconic_taxa": MARINE_ICONIC_TAXA,
                "quality_grade": "research,needs_id",
                "per_page": min(per_page, 50),
            })
            resp.raise_for_status()
            data = resp.json()

        species_list = []
        for r in data.get("results", []):
            t = r.get("taxon", {})
            species_list.append(_format_taxon(t, observation_count=r.get("count", 0)))

        return {
            "location": {"lat": lat, "lng": lng, "radius": radius},
            "total_species": data.get("total_results", 0),
            "species": species_list,
        }
    except Exception as e:
        return {"species": [], "total_species": 0, "error": str(e)}


# ─── TRENDING / POPULAR ─────────────────────────────

@router.get("/marine-life/trending")
async def trending_species(per_page: int = 20) -> dict:
    """Get popular/trending marine species from iNaturalist (most observed recently)."""
    try:
        async with httpx.AsyncClient(timeout=10.0, headers=INAT_HEADERS) as client:
            resp = await client.get(f"{INAT_BASE}/observations/species_counts", params={
                "taxon_id": MARINE_TAXON_IDS,
                "quality_grade": "research",
                "d1": _recent_date(),
                "per_page": min(per_page, 30),
                "order_by": "count",
            })
            resp.raise_for_status()
            data = resp.json()

        species_list = []
        for r in data.get("results", []):
            t = r.get("taxon", {})
            species_list.append(_format_taxon(t, observation_count=r.get("count", 0)))

        return {"species": species_list, "total": data.get("total_results", 0)}
    except Exception as e:
        return {"species": [], "total": 0, "error": str(e)}


def _recent_date() -> dict:
    """Return ISO date 30 days ago."""
    from datetime import timedelta
    return (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")


# ─── DIVE SITE SEARCH (OpenStreetMap Overpass) ───────

@router.get("/marine-life/dive-sites")
async def search_dive_sites(lat: float = None, lng: float = None, radius: float = 0.5) -> dict:
    """Search for dive sites near coordinates using OpenStreetMap."""
    if not lat or not lng:
        return {"sites": [], "error": "lat and lng required"}

    bbox_s, bbox_n = lat - radius, lat + radius
    bbox_w, bbox_e = lng - radius, lng + radius

    query = f"""[out:json][timeout:10];
(
  node["sport"="scuba_diving"]({bbox_s},{bbox_w},{bbox_n},{bbox_e});
  node["leisure"="diving"]({bbox_s},{bbox_w},{bbox_n},{bbox_e});
  node["sport"="diving"]({bbox_s},{bbox_w},{bbox_n},{bbox_e});
  way["sport"="scuba_diving"]({bbox_s},{bbox_w},{bbox_n},{bbox_e});
);
out body 30;"""

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(
                "https://overpass-api.de/api/interpreter",
                data={"data": query},
            )
            resp.raise_for_status()
            data = resp.json()

        sites = []
        seen_names = set()
        for el in data.get("elements", []):
            tags = el.get("tags", {})
            name = tags.get("name", "")
            if not name or name in seen_names:
                continue
            seen_names.add(name)
            sites.append({
                "name": name,
                "lat": el.get("lat"),
                "lng": el.get("lon"),
                "type": tags.get("sport", tags.get("leisure", "")),
                "operator": tags.get("operator", ""),
                "website": tags.get("website", ""),
                "osm_id": el.get("id"),
            })
        return {"sites": sites, "total": len(sites)}
    except Exception as e:
        return {"sites": [], "total": 0, "error": str(e)}


# ─── USER SIGHTINGS (local DB, with verification) ────

@router.post("/marine-life/sightings")
async def submit_sighting(
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Submit a species sighting. Stored locally with 'pending' status until verified."""
    taxon_id = body.get("taxon_id")
    species_name = body.get("species_name", "")
    scientific_name = body.get("scientific_name", "")

    if not taxon_id or not species_name:
        raise HTTPException(status_code=400, detail="taxon_id and species_name are required")

    sighting = {
        "id": uuid.uuid4().hex[:12],
        "user_id": current_user["id"],
        "user_name": current_user.get("name", ""),
        "taxon_id": taxon_id,
        "species_name": species_name,
        "scientific_name": scientific_name,
        "photo_url": body.get("photo_url", ""),
        "location": body.get("location", ""),
        "lat": body.get("lat"),
        "lng": body.get("lng"),
        "notes": body.get("notes", ""),
        "dive_log_id": body.get("dive_log_id"),
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "verified_at": None,
        "verified_by": None,
    }
    await db.marine_sightings.insert_one(sighting)
    sighting.pop("_id", None)
    return sighting


@router.get("/marine-life/my-sightings")
async def get_my_sightings(current_user: dict = Depends(get_current_user)):
    """Get current user's submitted sightings."""
    sightings = await db.marine_sightings.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return {"sightings": sightings}


@router.get("/marine-life/sightings/pending")
async def get_pending_sightings(current_user: dict = Depends(get_current_user)):
    """Admin: get all pending sightings for verification."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    sightings = await db.marine_sightings.find(
        {"status": "pending"}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return {"sightings": sightings}


@router.put("/marine-life/sightings/{sighting_id}/verify")
async def verify_sighting(
    sighting_id: str,
    body: dict = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Admin: verify or reject a sighting."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    action = body.get("action")
    if action not in ("verify", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'verify' or 'reject'")

    result = await db.marine_sightings.update_one(
        {"id": sighting_id},
        {"$set": {
            "status": "verified" if action == "verify" else "rejected",
            "verified_at": datetime.now(timezone.utc).isoformat(),
            "verified_by": current_user["id"],
            "rejection_reason": body.get("reason", "") if action == "reject" else None,
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Sighting not found")
    return {"status": "verified" if action == "verify" else "rejected", "sighting_id": sighting_id}


# ─── CONSERVATION IMPACT ─────────────────────────────

@router.get("/marine-life/conservation/impact")
async def get_conservation_impact(current_user: dict = Depends(get_current_user)):
    """Get user's conservation contribution metrics from their sightings."""
    uid = current_user["id"]

    # Sightings from marine_sightings collection
    sightings = await db.marine_sightings.find(
        {"user_id": uid}, {"_id": 0}
    ).to_list(1000)

    # Also count species tagged in dive logs
    logs_with_sightings = await db.dive_logs.find(
        {"user_id": uid, "sightings": {"$exists": True, "$ne": []}},
        {"_id": 0, "id": 1, "site_name": 1, "date": 1, "sightings": 1}
    ).to_list(1000)

    total_observations = len(sightings)
    unique_species = set()
    unique_sites = set()
    verified_count = 0
    pending_count = 0

    for s in sightings:
        unique_species.add(s.get("species_name", ""))
        if s.get("location"):
            unique_sites.add(s["location"])
        if s.get("status") == "verified":
            verified_count += 1
        elif s.get("status") == "pending":
            pending_count += 1

    # Species from dive logs
    dive_species = set()
    for log in logs_with_sightings:
        for s in log.get("sightings", []):
            name = s.get("species", "")
            if name:
                dive_species.add(name)
                total_observations += 1

    all_species = unique_species | dive_species

    return {
        "total_observations": total_observations,
        "unique_species": len(all_species),
        "unique_sites": len(unique_sites),
        "verified_sightings": verified_count,
        "pending_sightings": pending_count,
        "dives_with_sightings": len(logs_with_sightings),
        "species_list": sorted(all_species),
    }
