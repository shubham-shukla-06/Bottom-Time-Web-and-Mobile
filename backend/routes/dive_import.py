"""
Dive Computer Data Import - Parse UDDF, FIT, and Subsurface XML files
Supported brands via file import:
- Suunto (FIT, UDDF via Subsurface)
- Garmin Descent (FIT)
- Shearwater (UDDF via Subsurface/Shearwater Cloud)
- Scubapro (UDDF via LogTRAK)
- Mares (UDDF via Dive Organizer)
- Oceanic (UDDF via Dive Converter)
- Aqualung (UDDF via DiverLog)
- Cressi (UDDF)
- Atomic Aquatics, Heinrichs Weikamp, Hollis, Ratio, etc.
"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
import uuid

router = APIRouter(prefix="/dive-import")

# Supported dive computer brands (for UI display)
SUPPORTED_BRANDS = [
    {"brand": "Suunto", "models": ["EON Core", "EON Steel", "D5", "Vyper Novo", "Zoop Novo", "Ocean"], "formats": ["FIT", "UDDF"], "notes": "Export FIT from Suunto App, or UDDF via Subsurface"},
    {"brand": "Garmin", "models": ["Descent MK3i", "Descent MK2i", "Descent MK1", "Descent G1"], "formats": ["FIT"], "notes": "Export FIT from Garmin Connect"},
    {"brand": "Shearwater", "models": ["Perdix 2", "Perdix", "Teric", "Peregrine", "Nerd 2", "NERD"], "formats": ["UDDF"], "notes": "Export from Shearwater Cloud or via Subsurface"},
    {"brand": "Scubapro", "models": ["G2", "G3", "Luna 2.0", "Mantis 2", "Aladin Sport Matrix"], "formats": ["UDDF"], "notes": "Export UDDF from LogTRAK"},
    {"brand": "Mares", "models": ["Genius", "Quad Air", "Puck Pro+", "Smart Air"], "formats": ["UDDF"], "notes": "Export from Mares Dive Organizer"},
    {"brand": "Oceanic", "models": ["Geo 4.0", "VTX", "Pro Plus X"], "formats": ["UDDF"], "notes": "Use Dive Converter to export UDDF"},
    {"brand": "Aqualung", "models": ["i330R", "i550C", "i770R", "i200C"], "formats": ["UDDF"], "notes": "Export from DiverLog+"},
    {"brand": "Cressi", "models": ["Leonardo", "Giotto", "Newton"], "formats": ["UDDF"], "notes": "Export via Subsurface"},
    {"brand": "Atomic Aquatics", "models": ["Cobalt 2"], "formats": ["UDDF"], "notes": "Via Subsurface/libdivecomputer"},
    {"brand": "Heinrichs Weikamp", "models": ["OSTC Plus", "OSTC 4"], "formats": ["UDDF"], "notes": "Via Subsurface"},
    {"brand": "Ratio", "models": ["iX3M GPS", "iDive Sport"], "formats": ["UDDF"], "notes": "Via Subsurface"},
    {"brand": "Deepblu", "models": ["Cosmiq+"], "formats": ["UDDF"], "notes": "Via Subsurface"},
    {"brand": "Apple Watch", "models": ["Ultra 2", "Ultra"], "formats": ["FIT"], "notes": "Export from Oceanic+ app"},
    {"brand": "Subsurface", "models": ["All supported computers"], "formats": ["Subsurface XML", "UDDF"], "notes": "Export from Subsurface desktop app"},
]


def parse_fit_dive(contents: bytes) -> list:
    """Parse Garmin/Suunto FIT files for dive data."""
    from fitparse import FitFile
    import io

    fit = FitFile(io.BytesIO(contents))
    dives = []
    current_dive = None
    profile_points = []

    for record in fit.get_messages():
        name = record.name

        if name == "dive_summary":
            data = {f.name: f.value for f in record.fields}
            current_dive = {
                "max_depth": round(float(data.get("max_depth", 0) or 0), 1),
                "avg_depth": round(float(data.get("avg_depth", 0) or 0), 1),
                "duration_seconds": int(data.get("bottom_time", 0) or data.get("total_elapsed_time", 0) or 0),
                "water_temp_min": None,
                "water_temp_max": None,
                "dive_type": "recreational",
            }
            if data.get("start_time"):
                ts = data["start_time"]
                if hasattr(ts, "isoformat"):
                    current_dive["date"] = ts.isoformat()
                else:
                    current_dive["date"] = str(ts)

        elif name == "record" and current_dive:
            data = {f.name: f.value for f in record.fields}
            depth = data.get("depth")
            temp = data.get("temperature")
            if depth is not None:
                point = {"depth": round(float(depth), 1)}
                if data.get("timestamp"):
                    ts = data["timestamp"]
                    point["time"] = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
                if temp is not None:
                    point["temp"] = round(float(temp), 1)
                    if current_dive["water_temp_min"] is None or float(temp) < current_dive["water_temp_min"]:
                        current_dive["water_temp_min"] = round(float(temp), 1)
                    if current_dive["water_temp_max"] is None or float(temp) > current_dive["water_temp_max"]:
                        current_dive["water_temp_max"] = round(float(temp), 1)
                profile_points.append(point)

        elif name == "session":
            data = {f.name: f.value for f in record.fields}
            sport = data.get("sport")
            if sport and "diving" in str(sport).lower():
                if current_dive:
                    current_dive["profile"] = profile_points[:500]
                    current_dive["source"] = "FIT"
                    duration = current_dive.get("duration_seconds", 0)
                    current_dive["duration_minutes"] = round(duration / 60, 1) if duration else 0
                    dives.append(current_dive)
                    current_dive = None
                    profile_points = []

    if current_dive:
        current_dive["profile"] = profile_points[:500]
        current_dive["source"] = "FIT"
        duration = current_dive.get("duration_seconds", 0)
        current_dive["duration_minutes"] = round(duration / 60, 1) if duration else 0
        dives.append(current_dive)

    return dives


def parse_uddf(contents: bytes) -> list:
    """Parse UDDF (Universal Dive Data Format) XML files."""
    from lxml import etree

    tree = etree.fromstring(contents)
    ns = {"u": "http://www.streit.cc/uddf/3.2"}

    # Try multiple UDDF namespace versions
    namespaces_to_try = [
        {"u": "http://www.streit.cc/uddf/3.2"},
        {"u": "http://www.streit.cc/uddf/3.1"},
        {"u": "http://www.streit.cc/uddf/3.0"},
        {},  # no namespace
    ]

    dives = []

    for ns in namespaces_to_try:
        prefix = "u:" if ns else ""
        repetition_groups = tree.findall(f".//{prefix}repetitiongroup", ns) or tree.findall(".//repetitiongroup")
        if not repetition_groups:
            dive_elements = tree.findall(f".//{prefix}dive", ns) or tree.findall(".//dive")
        else:
            dive_elements = []
            for rg in repetition_groups:
                dive_elements.extend(rg.findall(f"{prefix}dive", ns) or rg.findall("dive"))

        if dive_elements:
            break

    for dive_el in dive_elements:
        dive = {
            "max_depth": 0, "avg_depth": 0, "duration_seconds": 0,
            "water_temp_min": None, "water_temp_max": None,
            "dive_type": "recreational", "profile": [], "source": "UDDF",
        }

        # Date/time
        date_el = dive_el.find(f".//{prefix}datetime", ns) if ns else dive_el.find(".//datetime")
        if date_el is not None and date_el.text:
            dive["date"] = date_el.text.strip()

        # Informationbeforedive
        info_before = dive_el.find(f"{prefix}informationbeforedive", ns) if ns else dive_el.find("informationbeforedive")
        if info_before is not None:
            dt = info_before.find(f"{prefix}datetime", ns) if ns else info_before.find("datetime")
            if dt is not None and dt.text:
                dive["date"] = dt.text.strip()

        # Informationafterdive
        info_after = dive_el.find(f"{prefix}informationafterdive", ns) if ns else dive_el.find("informationafterdive")
        if info_after is not None:
            gd = info_after.find(f"{prefix}greatestdepth", ns) if ns else info_after.find("greatestdepth")
            if gd is not None and gd.text:
                dive["max_depth"] = round(float(gd.text), 1)
            dd = info_after.find(f"{prefix}diveduration", ns) if ns else info_after.find("diveduration")
            if dd is not None and dd.text:
                dive["duration_seconds"] = int(float(dd.text))
            lt = info_after.find(f"{prefix}lowesttemperature", ns) if ns else info_after.find("lowesttemperature")
            if lt is not None and lt.text:
                temp_k = float(lt.text)
                dive["water_temp_min"] = round(temp_k - 273.15, 1) if temp_k > 200 else round(temp_k, 1)

        # Profile waypoints
        waypoints = dive_el.findall(f".//{prefix}waypoint", ns) if ns else dive_el.findall(".//waypoint")
        for wp in waypoints[:500]:
            point = {}
            depth_el = wp.find(f"{prefix}depth", ns) if ns else wp.find("depth")
            time_el = wp.find(f"{prefix}divetime", ns) if ns else wp.find("divetime")
            temp_el = wp.find(f"{prefix}temperature", ns) if ns else wp.find("temperature")
            if depth_el is not None and depth_el.text:
                point["depth"] = round(float(depth_el.text), 1)
            if time_el is not None and time_el.text:
                point["time_seconds"] = int(float(time_el.text))
            if temp_el is not None and temp_el.text:
                temp = float(temp_el.text)
                point["temp"] = round(temp - 273.15, 1) if temp > 200 else round(temp, 1)
            if point.get("depth") is not None:
                dive["profile"].append(point)

        dive["duration_minutes"] = round(dive["duration_seconds"] / 60, 1) if dive["duration_seconds"] else 0
        dives.append(dive)

    return dives


def parse_subsurface_xml(contents: bytes) -> list:
    """Parse Subsurface XML export format."""
    from lxml import etree

    tree = etree.fromstring(contents)
    dives = []

    for dive_el in tree.findall(".//dive"):
        dive = {
            "max_depth": 0, "avg_depth": 0, "duration_seconds": 0,
            "water_temp_min": None, "dive_type": "recreational",
            "profile": [], "source": "Subsurface",
        }

        # Attributes
        if dive_el.get("date"):
            time_str = dive_el.get("time", "00:00:00")
            dive["date"] = f"{dive_el.get('date')}T{time_str}"

        if dive_el.get("duration"):
            dur = dive_el.get("duration")
            parts = dur.replace("min", "").replace(":", " ").split()
            if len(parts) >= 1:
                dive["duration_minutes"] = float(parts[0])
                dive["duration_seconds"] = int(float(parts[0]) * 60)

        # Depth
        depth_el = dive_el.find("depth")
        if depth_el is not None:
            max_d = depth_el.get("max", "0").replace("m", "").strip()
            avg_d = depth_el.get("mean", "0").replace("m", "").strip()
            dive["max_depth"] = round(float(max_d), 1) if max_d else 0
            dive["avg_depth"] = round(float(avg_d), 1) if avg_d else 0

        # Temperature
        temp_el = dive_el.find("temperature")
        if temp_el is not None:
            water = temp_el.get("water", "").replace("°C", "").replace("C", "").strip()
            if water:
                dive["water_temp_min"] = round(float(water), 1)

        # Location
        location_el = dive_el.find("location")
        if location_el is not None and location_el.text:
            dive["location"] = location_el.text.strip()

        # Dive computer
        dc_el = dive_el.find("divecomputer")
        if dc_el is not None:
            dive["computer_model"] = dc_el.get("model", "")
            dive["computer_serial"] = dc_el.get("serial", "")

            # Profile samples
            for sample in dc_el.findall("sample"):
                point = {}
                time_str = sample.get("time", "")
                depth_str = sample.get("depth", "")
                temp_str = sample.get("temp", "")
                if depth_str:
                    point["depth"] = round(float(depth_str.replace("m", "").strip()), 1)
                if time_str:
                    parts = time_str.replace("min", "").replace(":", " ").split()
                    if parts:
                        point["time_seconds"] = int(float(parts[0]) * 60)
                if temp_str:
                    point["temp"] = round(float(temp_str.replace("°C", "").replace("C", "").strip()), 1)
                if point.get("depth") is not None:
                    dive["profile"].append(point)

        dives.append(dive)

    return dives


@router.get("/supported-brands")
async def get_supported_brands() -> dict:
    """Get list of supported dive computer brands and import instructions."""
    return {"brands": SUPPORTED_BRANDS}


@router.post("/parse")
async def parse_dive_file(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Parse a dive computer export file and return dive data for review."""
    contents = await file.read()
    if len(contents) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 50MB)")

    filename = (file.filename or "").lower()
    dives = []

    try:
        if filename.endswith(".fit"):
            dives = parse_fit_dive(contents)
        elif filename.endswith(".uddf") or filename.endswith(".xml"):
            # Try UDDF first, then Subsurface XML
            try:
                dives = parse_uddf(contents)
            except Exception:
                dives = parse_subsurface_xml(contents)
            if not dives:
                dives = parse_subsurface_xml(contents)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Use .fit, .uddf, or .xml (Subsurface)")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse file: {str(e)}")

    if not dives:
        raise HTTPException(status_code=422, detail="No dive data found in file")

    return {
        "dives": dives,
        "count": len(dives),
        "source_file": file.filename,
        "message": f"Found {len(dives)} dive(s). Review and confirm to import.",
    }


@router.post("/import")
async def import_dives(data: dict, current_user: dict = Depends(get_current_user)):
    """Import parsed dives into user's dive log."""
    dives = data.get("dives", [])
    if not dives:
        raise HTTPException(status_code=400, detail="No dives to import")

    imported = []
    for d in dives:
        log_entry = {
            "id": str(uuid.uuid4()),
            "user_id": current_user["id"],
            "date": d.get("date", datetime.now(timezone.utc).isoformat()),
            "location": d.get("location", ""),
            "dive_site": d.get("dive_site", ""),
            "max_depth": d.get("max_depth", 0),
            "avg_depth": d.get("avg_depth", 0),
            "duration": d.get("duration_minutes", 0),
            "water_temp": d.get("water_temp_min"),
            "visibility": d.get("visibility"),
            "buddy": d.get("buddy", ""),
            "notes": d.get("notes", ""),
            "dive_type": d.get("dive_type", "recreational"),
            "rating": d.get("rating"),
            # Computer data
            "computer_model": d.get("computer_model", ""),
            "computer_serial": d.get("computer_serial", ""),
            "profile": d.get("profile", []),
            "source": d.get("source", "import"),
            "source_file": data.get("source_file", ""),
            # Gas info
            "gas_mix": d.get("gas_mix", "Air"),
            "tank_start_pressure": d.get("tank_start_pressure"),
            "tank_end_pressure": d.get("tank_end_pressure"),
            "sac_rate": d.get("sac_rate"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.dive_logs.insert_one(log_entry.copy())
        imported.append(log_entry)

    return {
        "imported": len(imported),
        "message": f"Successfully imported {len(imported)} dive(s) to your log",
        "dive_ids": [d["id"] for d in imported],
    }
