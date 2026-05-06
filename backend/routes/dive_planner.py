"""
Dive Planner & Equipment Tracker
- Bühlmann ZH-L16C based no-deco limits and deco planning
- SAC rate calculator
- Personal equipment/gear management
- Trip management
- Dive site management with GPS
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
import uuid
import math

router = APIRouter()

# ═══════════════════════════════════════════
# BÜHLMANN ZH-L16C COMPARTMENT DATA
# ═══════════════════════════════════════════
# [half-time N2 (min), a-value N2, b-value N2, half-time He, a-value He, b-value He]
ZHL16C = [
    [4.0, 1.2599, 0.5050, 1.51, 1.7424, 0.4245],
    [8.0, 1.0000, 0.6514, 3.02, 1.3830, 0.5747],
    [12.5, 0.8618, 0.7222, 4.72, 1.1919, 0.6527],
    [18.5, 0.7562, 0.7725, 6.99, 1.0458, 0.7223],
    [27.0, 0.6200, 0.8125, 10.21, 0.9220, 0.7582],
    [38.3, 0.5043, 0.8434, 14.48, 0.8205, 0.7957],
    [54.3, 0.4410, 0.8693, 20.53, 0.7305, 0.8279],
    [77.0, 0.4000, 0.8910, 29.11, 0.6502, 0.8553],
    [109.0, 0.3750, 0.9092, 41.20, 0.5950, 0.8757],
    [146.0, 0.3500, 0.9222, 55.19, 0.5545, 0.8903],
    [187.0, 0.3295, 0.9319, 70.69, 0.5333, 0.8997],
    [239.0, 0.3065, 0.9403, 90.34, 0.5189, 0.9073],
    [305.0, 0.2835, 0.9477, 115.29, 0.5181, 0.9122],
    [390.0, 0.2610, 0.9544, 147.42, 0.5176, 0.9171],
    [498.0, 0.2480, 0.9602, 188.24, 0.5172, 0.9217],
    [635.0, 0.2327, 0.9653, 240.03, 0.5119, 0.9267],
]

WATER_VAPOUR_PRESSURE = 0.0627  # bar at 37°C


def calculate_ndl(depth_m, fo2=0.21, gf_high=1.0) -> dict:
    """Calculate no-decompression limit at a given depth."""
    ambient = depth_m / 10.0 + 1.0  # bar
    pp_n2 = (ambient - WATER_VAPOUR_PRESSURE) * (1.0 - fo2)
    surface_n2 = (1.0 - WATER_VAPOUR_PRESSURE) * 0.79

    ndl = 999
    for comp in ZHL16C:
        ht_n2, a_n2, b_n2 = comp[0], comp[1], comp[2]
        _ = a_n2 + (ambient / b_n2)  # M-value (used in ZHL16C model reference)
        k = math.log(2) / ht_n2

        if pp_n2 <= surface_n2:
            continue

        # Time for compartment to reach M-value at surface (GF adjusted)
        max_tolerated = a_n2 + (1.0 / b_n2)  # M-value at surface
        max_gf = surface_n2 + gf_high * (max_tolerated - surface_n2)

        if pp_n2 <= max_gf:
            continue

        # Solve: surface_n2 + (pp_n2 - surface_n2)(1 - e^(-kt)) = max_gf
        ratio = (max_gf - surface_n2) / (pp_n2 - surface_n2)
        if ratio <= 0 or ratio >= 1:
            continue

        t = -math.log(1 - ratio) / k
        ndl = min(ndl, t)

    return min(int(ndl), 999)


def calculate_mod(fo2, max_ppo2=1.4) -> dict:
    """Maximum Operating Depth for a gas mix."""
    return round((max_ppo2 / fo2 - 1) * 10, 1)


def calculate_ead(depth_m, fo2) -> dict:
    """Equivalent Air Depth for Nitrox."""
    fn2 = 1.0 - fo2
    ead = ((depth_m + 10) * fn2 / 0.79) - 10
    return round(max(0, ead), 1)


def calculate_sac(tank_start, tank_end, tank_size_l, avg_depth_m, duration_min) -> dict:
    """Surface Air Consumption rate."""
    if duration_min <= 0 or avg_depth_m < 0:
        return 0
    gas_used = (tank_start - tank_end) * tank_size_l  # liters
    ambient = (avg_depth_m / 10.0) + 1.0
    sac = gas_used / (ambient * duration_min)
    return round(sac, 1)


def calculate_gas_needed(depth_m, duration_min, sac_rate, safety_factor=1.5) -> dict:
    """Calculate gas needed for a dive in liters."""
    ambient = (depth_m / 10.0) + 1.0
    return round(sac_rate * ambient * duration_min * safety_factor, 0)


def calculate_cns(depth_m, fo2, duration_min) -> dict:
    """Estimate CNS oxygen toxicity percentage."""
    ppo2 = ((depth_m / 10.0) + 1.0) * fo2
    if ppo2 <= 0.5:
        return 0
    # NOAA CNS clock limits (minutes at pO2)
    limits = [(0.6, 720), (0.7, 570), (0.8, 450), (0.9, 360), (1.0, 300),
              (1.1, 240), (1.2, 210), (1.3, 180), (1.4, 150), (1.5, 120), (1.6, 45)]
    limit_min = 45  # default for high pO2
    for pp, lim in limits:
        if ppo2 <= pp:
            limit_min = lim
            break
    return round((duration_min / limit_min) * 100, 1)


def calculate_otu(depth_m, fo2, duration_min) -> dict:
    """Oxygen Tolerance Units."""
    ppo2 = ((depth_m / 10.0) + 1.0) * fo2
    if ppo2 <= 0.5:
        return 0
    return round(duration_min * ((ppo2 - 0.5) / 0.5) ** 0.83, 1)


# ═══════════════════════════════════════════
# DIVE PLANNER ENDPOINTS
# ═══════════════════════════════════════════

@router.post("/dive-planner/calculate")
async def plan_dive(data: dict, current_user: dict = Depends(get_current_user)):
    """Calculate dive plan with NDL, gas, deco info."""
    depth = float(data.get("depth", 18))
    fo2 = float(data.get("fo2", 0.21))
    planned_time = int(data.get("planned_time", 45))
    tank_size = float(data.get("tank_size", 12))
    sac = float(data.get("sac_rate", 15))
    gf_low = float(data.get("gf_low", 30)) / 100
    gf_high = float(data.get("gf_high", 85)) / 100

    # NDL at depth
    ndl = calculate_ndl(depth, fo2, gf_high)
    mod = calculate_mod(fo2)
    ead = calculate_ead(depth, fo2) if fo2 != 0.21 else depth
    ppo2 = round(((depth / 10) + 1) * fo2, 2)
    ppn2 = round(((depth / 10) + 1) * (1 - fo2), 2)

    # Gas needed
    gas_needed = calculate_gas_needed(depth, planned_time, sac)
    gas_available = tank_size * 200  # assuming full tank at 200 bar
    gas_reserve = tank_size * 50  # 50 bar reserve
    usable_gas = gas_available - gas_reserve

    # CNS & OTU
    cns = calculate_cns(depth, fo2, planned_time)
    otu = calculate_otu(depth, fo2, planned_time)

    # Ascent profile
    ascent_rate = 9  # m/min
    safety_stop = 3 if depth > 10 else 0
    ascent_time = math.ceil(depth / ascent_rate) + safety_stop
    total_time = planned_time + ascent_time

    # Multi-depth NDL table
    ndl_table = []
    for d in range(6, min(int(depth) + 18, 61), 3):
        ndl_table.append({"depth": d, "ndl": calculate_ndl(d, fo2, gf_high)})

    # Tissue loading after dive (simplified)
    tissues = []
    ambient = (depth / 10) + 1
    pp_n2 = (ambient - WATER_VAPOUR_PRESSURE) * (1 - fo2)
    for i, comp in enumerate(ZHL16C):
        ht = comp[0]
        k = math.log(2) / ht
        surface_n2 = (1 - WATER_VAPOUR_PRESSURE) * 0.79
        loading = surface_n2 + (pp_n2 - surface_n2) * (1 - math.exp(-k * planned_time))
        m_value = comp[1] + (1.0 / comp[2])
        pct = round((loading / m_value) * 100, 1)
        tissues.append({"compartment": i + 1, "half_time": ht, "loading": round(loading, 3), "m_value": round(m_value, 3), "saturation_pct": min(pct, 100)})

    is_within_ndl = planned_time <= ndl
    depth_ok = depth <= mod
    gas_ok = gas_needed <= usable_gas
    cns_ok = cns < 80

    return {
        "plan": {
            "depth": depth,
            "planned_time": planned_time,
            "total_time": total_time,
            "ascent_time": ascent_time,
            "safety_stop_min": safety_stop,
        },
        "gas": {
            "mix": f"EAN{int(fo2*100)}" if fo2 != 0.21 else "Air",
            "fo2": fo2,
            "mod": mod,
            "ead": ead,
            "ppo2": ppo2,
            "ppn2": ppn2,
            "tank_size": tank_size,
            "gas_needed": gas_needed,
            "gas_available": usable_gas,
            "gas_reserve": gas_reserve,
            "sac_rate": sac,
        },
        "deco": {
            "ndl": ndl,
            "within_ndl": is_within_ndl,
            "gf_low": int(gf_low * 100),
            "gf_high": int(gf_high * 100),
        },
        "safety": {
            "cns_percent": cns,
            "otu": otu,
            "depth_ok": depth_ok,
            "gas_ok": gas_ok,
            "cns_ok": cns_ok,
            "all_ok": is_within_ndl and depth_ok and gas_ok and cns_ok,
        },
        "ndl_table": ndl_table,
        "tissues": tissues,
    }


@router.get("/dive-planner/ndl-table")
async def get_ndl_table(fo2: float = Query(0.21), gf: float = Query(85)):
    """Get NDL table for common depths."""
    gf_high = gf / 100
    table = []
    for d in range(6, 61, 3):
        ndl = calculate_ndl(d, fo2, gf_high)
        mod = calculate_mod(fo2)
        ppo2 = round(((d / 10) + 1) * fo2, 2)
        table.append({"depth": d, "ndl": ndl, "ppo2": ppo2, "within_mod": d <= mod})
    return {"table": table, "fo2": fo2, "gf_high": int(gf)}


@router.post("/dive-planner/sac-calculator")
async def sac_calculator(data: dict, current_user: dict = Depends(get_current_user)):
    """Calculate SAC rate from dive data."""
    tank_start = int(data.get("tank_start", 200))
    tank_end = int(data.get("tank_end", 50))
    tank_size = float(data.get("tank_size", 12))
    avg_depth = float(data.get("avg_depth", 15))
    duration = int(data.get("duration", 45))
    sac = calculate_sac(tank_start, tank_end, tank_size, avg_depth, duration)
    rmv = sac  # RMV = SAC at surface
    return {"sac_rate": sac, "rmv": rmv, "gas_used_liters": round((tank_start - tank_end) * tank_size / 1000, 1)}


# ═══════════════════════════════════════════
# PERSONAL EQUIPMENT TRACKER
# ═══════════════════════════════════════════

GEAR_CATEGORIES = ["BCD", "Regulator", "Wetsuit", "Drysuit", "Mask", "Fins", "Computer", "Torch", "Camera", "Tank", "SMB", "Weights", "Knife", "Reel", "Other"]

@router.get("/gear")
async def get_my_gear(current_user: dict = Depends(get_current_user)):
    items = await db.user_gear.find({"user_id": current_user["id"]}, {"_id": 0}).sort("category", 1).to_list(100)
    return {"gear": items}


@router.post("/gear")
async def add_gear(data: dict, current_user: dict = Depends(get_current_user)):
    item = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "name": data.get("name", ""),
        "brand": data.get("brand", ""),
        "model": data.get("model", ""),
        "category": data.get("category", "Other"),
        "serial_number": data.get("serial_number", ""),
        "purchase_date": data.get("purchase_date", ""),
        "last_service": data.get("last_service", ""),
        "next_service": data.get("next_service", ""),
        "total_dives": int(data.get("total_dives", 0)),
        "notes": data.get("notes", ""),
        "photo": data.get("photo", ""),
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.user_gear.insert_one(item.copy())
    return item


@router.put("/gear/{item_id}")
async def update_gear(item_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    existing = await db.user_gear.find_one({"id": item_id, "user_id": current_user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Gear not found")
    protected = {"id", "user_id", "created_at"}
    update = {k: v for k, v in data.items() if k not in protected}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.user_gear.update_one({"id": item_id}, {"$set": update})
    return await db.user_gear.find_one({"id": item_id}, {"_id": 0})


@router.delete("/gear/{item_id}")
async def delete_gear(item_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.user_gear.delete_one({"id": item_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"message": "Deleted"}


# ═══════════════════════════════════════════
# TRIP MANAGEMENT
# ═══════════════════════════════════════════

@router.get("/dive-trips")
async def get_trips(current_user: dict = Depends(get_current_user)):
    trips = await db.dive_trips.find({"user_id": current_user["id"]}, {"_id": 0}).sort("start_date", -1).to_list(100)
    for trip in trips:
        trip["dive_count"] = await db.dive_logs.count_documents({"user_id": current_user["id"], "trip_id": trip["id"]})
    return {"trips": trips}


@router.post("/dive-trips")
async def create_trip(data: dict, current_user: dict = Depends(get_current_user)):
    trip = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "name": data.get("name", ""),
        "location": data.get("location", ""),
        "start_date": data.get("start_date", ""),
        "end_date": data.get("end_date", ""),
        "notes": data.get("notes", ""),
        "photos": data.get("photos", []),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.dive_trips.insert_one(trip.copy())
    return trip


@router.put("/dive-trips/{trip_id}")
async def update_trip(trip_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    existing = await db.dive_trips.find_one({"id": trip_id, "user_id": current_user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Trip not found")
    protected = {"id", "user_id", "created_at"}
    update = {k: v for k, v in data.items() if k not in protected}
    await db.dive_trips.update_one({"id": trip_id}, {"$set": update})
    return await db.dive_trips.find_one({"id": trip_id}, {"_id": 0})


@router.delete("/dive-trips/{trip_id}")
async def delete_trip(trip_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.dive_trips.delete_one({"id": trip_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    await db.dive_logs.update_many({"trip_id": trip_id}, {"$set": {"trip_id": None, "trip_name": None}})
    return {"message": "Trip deleted"}


# ═══════════════════════════════════════════
# DIVE SITES
# ═══════════════════════════════════════════

@router.get("/dive-sites")
async def get_dive_sites(current_user: dict = Depends(get_current_user)):
    """Get unique dive sites from user's logs."""
    logs = await db.dive_logs.find(
        {"user_id": current_user["id"]},
        {"_id": 0, "site_name": 1, "location": 1, "max_depth": 1, "water_temp": 1, "date": 1, "dive_type": 1, "rating": 1},
    ).to_list(500)

    sites = {}
    for lg in logs:
        key = f"{lg.get('site_name', '')}-{lg.get('location', '')}"
        if key not in sites:
            sites[key] = {
                "site_name": lg.get("site_name", ""),
                "location": lg.get("location", ""),
                "dive_count": 0,
                "max_depth": 0,
                "avg_temp": None,
                "temps": [],
                "last_dive": "",
                "ratings": [],
            }
        s = sites[key]
        s["dive_count"] += 1
        if lg.get("max_depth") and lg["max_depth"] > s["max_depth"]:
            s["max_depth"] = lg["max_depth"]
        if lg.get("water_temp"):
            s["temps"].append(lg["water_temp"])
        if lg.get("date") and lg["date"] > s["last_dive"]:
            s["last_dive"] = lg["date"]
        if lg.get("rating"):
            s["ratings"].append(lg["rating"])

    result = []
    for s in sites.values():
        if s["temps"]:
            s["avg_temp"] = round(sum(s["temps"]) / len(s["temps"]), 1)
        if s["ratings"]:
            s["avg_rating"] = round(sum(s["ratings"]) / len(s["ratings"]), 1)
        del s["temps"]
        del s["ratings"]
        result.append(s)

    return {"sites": sorted(result, key=lambda x: x["dive_count"], reverse=True)}
