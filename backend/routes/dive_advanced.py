"""
Advanced Dive Features:
- Repetitive dive planning (surface interval + tissue off-gassing)
- PDF logbook export
- Photo EXIF GPS extraction
- Bulk dive editing
- Multi-computer merge
- Enhanced profile analysis (ascent rate, pO2, deco ceiling)
- Tag management
"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
from routes.dive_planner import ZHL16C, WATER_VAPOUR_PRESSURE, calculate_cns
import math
import io

router = APIRouter()


# ═══════════════════════════════════════════
# REPETITIVE DIVE PLANNING
# ═══════════════════════════════════════════

@router.post("/dive-planner/repetitive")
async def plan_repetitive_dives(data: dict, current_user: dict = Depends(get_current_user)):
    """Plan multiple dives with surface intervals and tissue off-gassing."""
    dives = data.get("dives", [])
    if not dives or len(dives) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 dives for repetitive planning")

    surface_n2 = (1.0 - WATER_VAPOUR_PRESSURE) * 0.79
    gf_high = float(data.get("gf_high", 85)) / 100

    # Initialize tissue compartments at surface
    tissues = [surface_n2] * 16
    results = []

    for i, dive in enumerate(dives):
        depth = float(dive.get("depth", 18))
        duration = int(dive.get("duration", 30))
        fo2 = float(dive.get("fo2", 0.21))
        si = int(dive.get("surface_interval", 60)) if i > 0 else 0

        # Off-gas during surface interval
        if si > 0:
            for j in range(16):
                ht = ZHL16C[j][0]
                k = math.log(2) / ht
                tissues[j] = surface_n2 + (tissues[j] - surface_n2) * math.exp(-k * si)

        tissue_before = list(tissues)

        # On-gas during dive
        ambient = (depth / 10.0) + 1.0
        pp_n2 = (ambient - WATER_VAPOUR_PRESSURE) * (1.0 - fo2)

        for j in range(16):
            ht = ZHL16C[j][0]
            k = math.log(2) / ht
            tissues[j] = tissues[j] + (pp_n2 - tissues[j]) * (1 - math.exp(-k * duration))

        # Calculate NDL for this dive given current tissue loading
        ndl = 999
        for j in range(16):
            a_n2, b_n2 = ZHL16C[j][1], ZHL16C[j][2]
            max_tolerated = a_n2 + (1.0 / b_n2)
            max_gf = surface_n2 + gf_high * (max_tolerated - surface_n2)
            if pp_n2 <= tissue_before[j]:
                continue
            ratio = (max_gf - tissue_before[j]) / (pp_n2 - tissue_before[j])
            if ratio <= 0 or ratio >= 1:
                continue
            k = math.log(2) / ZHL16C[j][0]
            t = -math.log(1 - ratio) / k
            ndl = min(ndl, t)

        ndl = min(int(ndl), 999)
        cns = calculate_cns(depth, fo2, duration)

        # Tissue saturation percentages
        tissue_pcts = []
        for j in range(16):
            m_val = ZHL16C[j][1] + (1.0 / ZHL16C[j][2])
            pct = round((tissues[j] / m_val) * 100, 1)
            tissue_pcts.append(min(pct, 100))

        results.append({
            "dive_number": i + 1,
            "depth": depth,
            "duration": duration,
            "fo2": fo2,
            "surface_interval": si,
            "ndl": ndl,
            "within_ndl": duration <= ndl,
            "cns_percent": cns,
            "max_tissue_loading": max(tissue_pcts),
            "tissue_loading": tissue_pcts,
        })

    return {"dives": results, "total_dives": len(results)}


# ═══════════════════════════════════════════
# ENHANCED PROFILE ANALYSIS
# ═══════════════════════════════════════════

@router.post("/dive-log/{log_id}/analyze-profile")
async def analyze_dive_profile(log_id: str, current_user: dict = Depends(get_current_user)):
    """Compute ascent rates, pO2, deco ceiling for a dive profile."""
    log = await db.dive_logs.find_one({"id": log_id, "user_id": current_user["id"]}, {"_id": 0})
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")

    profile = log.get("profile") or []
    if len(profile) < 2:
        raise HTTPException(status_code=400, detail="This dive has no depth profile to analyze.")

    fo2 = 0.21
    gas_mix = log.get("gas_mix", "Air")
    if gas_mix and gas_mix.startswith("EAN"):
        try:
            fo2 = int(gas_mix.replace("EAN", "")) / 100
        except ValueError:
            pass

    gas_switches = log.get("gas_switches") or []
    analyzed = []
    tissues = [(1.0 - WATER_VAPOUR_PRESSURE) * 0.79] * 16

    for i, point in enumerate(profile):
        depth = point.get("depth", 0)
        time_s = point.get("time_seconds", i * 15)

        # Check gas switches
        current_fo2 = fo2
        for gs in gas_switches:
            if time_s >= gs.get("time_seconds", 999999):
                try:
                    gm = gs.get("gas_mix", "Air")
                    current_fo2 = int(gm.replace("EAN", "")) / 100 if gm.startswith("EAN") else 0.21
                except ValueError:
                    pass

        ambient = (depth / 10.0) + 1.0
        ppo2 = round(ambient * current_fo2, 2)
        ppn2 = round(ambient * (1 - current_fo2), 2)

        # Ascent rate (m/min)
        ascent_rate = 0
        if i > 0:
            prev = profile[i - 1]
            prev_depth = prev.get("depth", 0)
            prev_time = prev.get("time_seconds", (i - 1) * 15)
            dt = time_s - prev_time
            if dt > 0:
                ascent_rate = round((prev_depth - depth) / (dt / 60), 1)

        # Ascent rate safety: >18m/min = danger, >12 = warning, <9 = ok
        rate_status = "ok"
        if ascent_rate > 18:
            rate_status = "danger"
        elif ascent_rate > 12:
            rate_status = "warning"

        # Update tissue loading
        pp_n2_insp = (ambient - WATER_VAPOUR_PRESSURE) * (1 - current_fo2)
        dt_min = 0.25  # assume ~15s intervals
        if i > 0:
            prev_time = profile[i - 1].get("time_seconds", (i - 1) * 15)
            dt_min = max((time_s - prev_time) / 60, 0.01)

        ceiling = 0
        for j in range(16):
            ht = ZHL16C[j][0]
            k = math.log(2) / ht
            tissues[j] = tissues[j] + (pp_n2_insp - tissues[j]) * (1 - math.exp(-k * dt_min))
            # Ceiling = deepest depth where tissue is at M-value
            a, b = ZHL16C[j][1], ZHL16C[j][2]
            comp_ceiling = (tissues[j] - a) * b
            if comp_ceiling > ceiling:
                ceiling = comp_ceiling

        ceiling_m = round(max(0, (ceiling - 1) * 10), 1)

        entry = {
            "time_seconds": time_s,
            "depth": depth,
            "ppo2": ppo2,
            "ppn2": ppn2,
            "ascent_rate": ascent_rate,
            "rate_status": rate_status,
            "ceiling": ceiling_m,
            "gas_mix": f"EAN{int(current_fo2 * 100)}" if current_fo2 != 0.21 else "Air",
        }
        if point.get("temp") is not None:
            entry["temp"] = point["temp"]
        analyzed.append(entry)

    return {"analysis": analyzed, "point_count": len(analyzed)}


# ═══════════════════════════════════════════
# PHOTO EXIF GPS EXTRACTION
# ═══════════════════════════════════════════

@router.post("/dive-log/extract-gps")
async def extract_gps_from_photo(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Extract GPS coordinates from photo EXIF data."""
    contents = await file.read()
    if len(contents) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large")

    try:
        from PIL import Image
        from PIL.ExifTags import TAGS, GPSTAGS
        img = Image.open(io.BytesIO(contents))
        exif_data = img._getexif()
        if not exif_data:
            return {"gps": None, "message": "No EXIF data found"}

        gps_info = {}
        for tag_id, value in exif_data.items():
            tag = TAGS.get(tag_id, tag_id)
            if tag == "GPSInfo":
                for gps_tag_id in value:
                    gps_tag = GPSTAGS.get(gps_tag_id, gps_tag_id)
                    gps_info[gps_tag] = value[gps_tag_id]

        if not gps_info:
            return {"gps": None, "message": "No GPS data in EXIF"}

        def to_decimal(dms, ref) -> dict:
            d = float(dms[0])
            m = float(dms[1])
            s = float(dms[2])
            decimal = d + m / 60 + s / 3600
            if ref in ['S', 'W']:
                decimal = -decimal
            return round(decimal, 6)

        lat = to_decimal(gps_info.get("GPSLatitude", (0, 0, 0)), gps_info.get("GPSLatitudeRef", "N"))
        lng = to_decimal(gps_info.get("GPSLongitude", (0, 0, 0)), gps_info.get("GPSLongitudeRef", "E"))

        return {"gps": {"lat": lat, "lng": lng}, "message": "GPS extracted successfully"}

    except Exception as e:
        return {"gps": None, "message": f"Could not extract GPS: {str(e)}"}


# ═══════════════════════════════════════════
# BULK DIVE EDITING
# ═══════════════════════════════════════════

@router.put("/dive-log/bulk-edit")
async def bulk_edit_dives(data: dict, current_user: dict = Depends(get_current_user)):
    """Edit multiple dives at once."""
    dive_ids = data.get("dive_ids", [])
    updates = data.get("updates", {})
    if not dive_ids:
        raise HTTPException(status_code=400, detail="No dive IDs provided")
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    allowed = {"buddy", "dive_type", "trip_id", "trip_name", "tags", "visibility",
               "current", "surface_conditions", "entry_type", "water_type",
               "suit_type", "gas_mix", "location"}
    filtered = {k: v for k, v in updates.items() if k in allowed}
    if not filtered:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    filtered["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.dive_logs.update_many(
        {"id": {"$in": dive_ids}, "user_id": current_user["id"]},
        {"$set": filtered},
    )
    return {"modified": result.modified_count, "updates": filtered}


# ═══════════════════════════════════════════
# MULTI-COMPUTER MERGE
# ═══════════════════════════════════════════

@router.post("/dive-log/merge")
async def merge_dive_computers(data: dict, current_user: dict = Depends(get_current_user)):
    """Merge data from two dive logs (from different computers) into one."""
    primary_id = data.get("primary_id")
    secondary_id = data.get("secondary_id")
    if not primary_id or not secondary_id:
        raise HTTPException(status_code=400, detail="Need primary_id and secondary_id")

    primary = await db.dive_logs.find_one({"id": primary_id, "user_id": current_user["id"]}, {"_id": 0})
    secondary = await db.dive_logs.find_one({"id": secondary_id, "user_id": current_user["id"]}, {"_id": 0})
    if not primary or not secondary:
        raise HTTPException(status_code=404, detail="One or both dives not found")

    # Merge profiles (interleave by time_seconds)
    p1 = primary.get("profile", [])
    p2 = secondary.get("profile", [])
    merged_profile = sorted(p1 + p2, key=lambda x: x.get("time_seconds", 0))

    # Take max depth, longer duration, merge temps
    updates = {
        "max_depth": max(primary.get("max_depth") or 0, secondary.get("max_depth") or 0),
        "avg_depth": round(((primary.get("avg_depth") or 0) + (secondary.get("avg_depth") or 0)) / 2, 1),
        "duration": max(primary.get("duration") or 0, secondary.get("duration") or 0),
        "profile": merged_profile,
        "computer_model": f"{primary.get('computer_model', '')} + {secondary.get('computer_model', '')}".strip(" +"),
        "source": "merged",
        "merged_from": [secondary_id],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    # Merge water temp (take average if both exist)
    t1, t2 = primary.get("water_temp"), secondary.get("water_temp")
    if t1 is not None and t2 is not None:
        updates["water_temp"] = round((t1 + t2) / 2, 1)
    elif t2 is not None:
        updates["water_temp"] = t2

    await db.dive_logs.update_one({"id": primary_id}, {"$set": updates})
    await db.dive_logs.delete_one({"id": secondary_id})

    merged = await db.dive_logs.find_one({"id": primary_id}, {"_id": 0})
    return {"merged": merged, "message": "Dives merged successfully"}


# ═══════════════════════════════════════════
# TAG MANAGEMENT
# ═══════════════════════════════════════════

@router.get("/dive-log/tags")
async def get_all_tags(current_user: dict = Depends(get_current_user)):
    """Get all unique tags used across user's dive logs."""
    logs = await db.dive_logs.find(
        {"user_id": current_user["id"], "tags": {"$exists": True, "$ne": []}},
        {"_id": 0, "tags": 1},
    ).to_list(500)
    all_tags = {}
    for lg in logs:
        for tag in (lg.get("tags") or []):
            all_tags[tag] = all_tags.get(tag, 0) + 1
    return {"tags": [{"name": k, "count": v} for k, v in sorted(all_tags.items(), key=lambda x: x[1], reverse=True)]}


# ═══════════════════════════════════════════
# PDF LOGBOOK EXPORT
# ═══════════════════════════════════════════

@router.get("/dive-log/export-pdf")
async def export_logbook_pdf(current_user: dict = Depends(get_current_user)):
    """Export dive logbook as PDF."""
    logs = await db.dive_logs.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("date", -1).to_list(500)

    if not logs:
        raise HTTPException(status_code=404, detail="No dives to export")

    # Generate HTML for PDF
    user_name = current_user.get("name", "Diver")
    total_dives = len(logs)
    depths = [entry.get("max_depth", 0) for entry in logs if entry.get("max_depth")]
    max_depth = max(depths) if depths else 0
    total_time = sum(entry.get("duration") or 0 for entry in logs)

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body {{ font-family: 'Helvetica', sans-serif; margin: 40px; color: #1e293b; font-size: 11px; }}
h1 {{ color: #0e7490; font-size: 24px; margin-bottom: 4px; }}
.subtitle {{ color: #64748b; font-size: 12px; margin-bottom: 20px; }}
.stats {{ display: flex; gap: 20px; margin-bottom: 24px; }}
.stat {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; text-align: center; }}
.stat-val {{ font-size: 20px; font-weight: 800; color: #0e7490; }}
.stat-label {{ font-size: 9px; color: #94a3b8; text-transform: uppercase; }}
table {{ width: 100%; border-collapse: collapse; margin-top: 16px; }}
th {{ background: #f1f5f9; color: #475569; font-size: 9px; text-transform: uppercase; padding: 8px 6px; text-align: left; border-bottom: 2px solid #e2e8f0; }}
td {{ padding: 7px 6px; border-bottom: 1px solid #f1f5f9; font-size: 10px; }}
tr:nth-child(even) {{ background: #fafbfc; }}
.dive-num {{ color: #0e7490; font-weight: 700; }}
.tag {{ background: #ecfeff; color: #0e7490; padding: 1px 6px; border-radius: 10px; font-size: 8px; font-weight: 600; }}
.footer {{ margin-top: 30px; text-align: center; color: #94a3b8; font-size: 9px; }}
</style></head><body>
<h1>Dive Logbook</h1>
<p class="subtitle">{user_name} &mdash; {total_dives} dives &mdash; Generated {datetime.now(timezone.utc).strftime('%B %d, %Y')}</p>
<div class="stats">
<div class="stat"><div class="stat-val">{total_dives}</div><div class="stat-label">Total Dives</div></div>
<div class="stat"><div class="stat-val">{max_depth}m</div><div class="stat-label">Max Depth</div></div>
<div class="stat"><div class="stat-val">{total_time}min</div><div class="stat-label">Total Time</div></div>
</div>
<table>
<thead><tr><th>#</th><th>Date</th><th>Site</th><th>Location</th><th>Depth</th><th>Time</th><th>Temp</th><th>Gas</th><th>Buddy</th><th>Type</th><th>Rating</th></tr></thead>
<tbody>"""

    for i, log in enumerate(logs):
        stars = "★" * (log.get("rating") or 0) + "☆" * (5 - (log.get("rating") or 0))
        tags_html = " ".join(f'<span class="tag">{t}</span>' for t in (log.get("tags") or []))
        html += f"""<tr>
<td class="dive-num">{total_dives - i}</td>
<td>{log.get('date', '')[:10]}</td>
<td>{log.get('site_name', '')}</td>
<td>{log.get('location', '')}</td>
<td>{log.get('max_depth', '')}m</td>
<td>{log.get('duration', '')}min</td>
<td>{log.get('water_temp', '')}{'°C' if log.get('water_temp') is not None else ''}</td>
<td>{log.get('gas_mix', 'Air')}</td>
<td>{log.get('buddy', '')}</td>
<td>{log.get('dive_type', '')} {tags_html}</td>
<td>{stars}</td>
</tr>"""

    html += """</tbody></table>
<div class="footer">Bottom Time Dive Logbook &mdash; bottom-time.com</div>
</body></html>"""

    return {"html": html, "dive_count": total_dives, "format": "html"}


# ═══════════════════════════════════════════
# DIVE SITES WITH GPS
# ═══════════════════════════════════════════

@router.get("/dive-sites/map")
async def get_dive_sites_map(current_user: dict = Depends(get_current_user)):
    """Get dive sites with GPS coordinates for map display."""
    logs = await db.dive_logs.find(
        {"user_id": current_user["id"]},
        {"_id": 0, "site_name": 1, "location": 1, "gps_lat": 1, "gps_lng": 1,
         "max_depth": 1, "water_temp": 1, "date": 1, "rating": 1, "dive_type": 1,
         "duration": 1, "visibility": 1},
    ).to_list(500)

    sites = {}
    for lg in logs:
        key = lg.get("site_name", "") or lg.get("location", "")
        if not key:
            continue
        if key not in sites:
            sites[key] = {
                "site_name": lg.get("site_name", ""),
                "location": lg.get("location", ""),
                "gps_lat": lg.get("gps_lat"),
                "gps_lng": lg.get("gps_lng"),
                "dive_count": 0,
                "max_depth": 0,
                "last_dive": "",
                "ratings": [],
                "temps": [],
                "dive_types": set(),
                "total_time": 0,
            }
        s = sites[key]
        s["dive_count"] += 1
        if lg.get("gps_lat") and not s["gps_lat"]:
            s["gps_lat"] = lg["gps_lat"]
            s["gps_lng"] = lg.get("gps_lng")
        if (lg.get("max_depth") or 0) > s["max_depth"]:
            s["max_depth"] = lg["max_depth"]
        if lg.get("date", "") > s["last_dive"]:
            s["last_dive"] = lg["date"]
        if lg.get("rating"):
            s["ratings"].append(lg["rating"])
        if lg.get("water_temp") is not None:
            s["temps"].append(lg["water_temp"])
        if lg.get("dive_type"):
            s["dive_types"].add(lg["dive_type"])
        if lg.get("duration"):
            s["total_time"] += lg["duration"]

    result = []
    for s in sites.values():
        if s["ratings"]:
            s["avg_rating"] = round(sum(s["ratings"]) / len(s["ratings"]), 1)
        del s["ratings"]
        if s["temps"]:
            s["avg_temp"] = round(sum(s["temps"]) / len(s["temps"]), 1)
        del s["temps"]
        s["dive_types"] = list(s["dive_types"])[:3]
        result.append(s)

    return {"sites": result}
