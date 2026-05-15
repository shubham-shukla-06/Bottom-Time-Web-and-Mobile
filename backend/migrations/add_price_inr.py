"""
Phase 4-P0 migration — INR canonical pricing.

Adds `price_inr` (canonical) to every product and operator_dive_listings doc,
computed from current `price` + `currency` via today's frankfurter FX rate
(cached in db.exchange_rates).

Also writes `price_overrides` as an empty dict so the field exists and the
display layer can rely on its presence.

Idempotent: skips docs that already have a non-None `price_inr`.

Usage:
    python3 -m migrations.add_price_inr --dry-run   # prints first 5 of each
    python3 -m migrations.add_price_inr             # writes for real (with backup)
"""
import asyncio
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Allow importing app modules when run from /app/backend
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import db  # noqa: E402


SUPPORTED_CURRENCIES = "EUR,GBP,INR,AUD,CAD,JPY,THB,IDR,MYR,PHP,SGD,NZD,BRL,MXN"
FALLBACK_INR_RATE = 83.5  # USD→INR if frankfurter cache empty


async def get_inr_rate_and_rates():
    """Return (inr_rate, rates_dict) — USD→X. rates_dict[X] = X per 1 USD."""
    doc = await db.exchange_rates.find_one({"base": "USD"}, {"_id": 0})
    if doc and doc.get("rates"):
        rates = doc["rates"]
        rates["USD"] = 1.0
        return rates.get("INR", FALLBACK_INR_RATE), rates
    # Cache empty — fall back to fetch on the spot
    import httpx
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        resp = await client.get(f"https://api.frankfurter.app/latest?from=USD&to={SUPPORTED_CURRENCIES}")
        resp.raise_for_status()
        data = resp.json()
    rates = data.get("rates", {})
    rates["USD"] = 1.0
    return rates.get("INR", FALLBACK_INR_RATE), rates


def convert_to_inr(price: float, currency: str, rates: dict, inr_rate: float) -> float:
    """price in `currency` → INR. Routed via USD-base rates from frankfurter."""
    if price is None:
        return None
    cur = (currency or "USD").upper()
    if cur == "INR":
        return round(float(price), 2)
    if cur == "USD":
        return round(float(price) * inr_rate, 2)
    # cross-currency: price_in_cur / rate_cur_per_usd = price_in_usd; ×inr_rate = price_inr
    rate = rates.get(cur)
    if not rate:
        # Unknown currency — treat as USD (safer than crashing)
        return round(float(price) * inr_rate, 2)
    price_in_usd = float(price) / float(rate)
    return round(price_in_usd * inr_rate, 2)


async def migrate_collection(coll_name: str, dry_run: bool, rates: dict, inr_rate: float, backup_path: Path = None):
    """Walk the collection, compute price_inr where missing, optionally write."""
    coll = db[coll_name]
    cursor = coll.find({}, {"_id": 0, "id": 1, "name": 1, "price": 1, "currency": 1, "price_inr": 1})
    docs = await cursor.to_list(length=10000)

    sample = []
    backup_rows = []
    updated = 0
    skipped = 0

    for doc in docs:
        backup_rows.append({k: doc.get(k) for k in ("id", "name", "price", "currency", "price_inr")})
        if doc.get("price_inr") is not None:
            skipped += 1
            continue
        price = doc.get("price")
        currency = doc.get("currency") or "USD"
        if price is None:
            continue
        new_price_inr = convert_to_inr(price, currency, rates, inr_rate)
        if new_price_inr is None or new_price_inr <= 0:
            print(f"  WARNING: skip {coll_name} id={doc.get('id')} → invalid price_inr={new_price_inr}")
            continue
        sample_row = {
            "id": doc.get("id"),
            "name": (doc.get("name") or "")[:40],
            "before": {"price": price, "currency": currency},
            "after": {"price_inr": new_price_inr, "price_overrides": {}},
        }
        if len(sample) < 5:
            sample.append(sample_row)
        if not dry_run:
            await coll.update_one(
                {"id": doc.get("id")},
                {"$set": {"price_inr": new_price_inr, "price_overrides": {}, "price_inr_migrated_at": datetime.now(timezone.utc).isoformat(), "price_inr_migration_fx_rate": inr_rate}},
            )
        updated += 1

    if backup_path and not dry_run:
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        backup_path.write_text(json.dumps(backup_rows, indent=2, default=str))

    return {"collection": coll_name, "total": len(docs), "updated": updated, "skipped": skipped, "sample": sample}


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Sample only; no writes")
    args = parser.parse_args()

    inr_rate, rates = await get_inr_rate_and_rates()
    print(f"FX source: frankfurter.app (USD base) — inr_rate = {inr_rate}")

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_dir = Path("/app/backups")
    products_backup = backup_dir / f"products_pre_inr_{ts}.json"
    listings_backup = backup_dir / f"operator_dive_listings_pre_inr_{ts}.json"

    results = []
    for coll_name, backup in [("products", products_backup), ("operator_dive_listings", listings_backup)]:
        r = await migrate_collection(coll_name, args.dry_run, rates, inr_rate, backup if not args.dry_run else None)
        results.append(r)
        print(f"\n[{coll_name}] total={r['total']} updated={r['updated']} skipped={r['skipped']}")
        for s in r["sample"]:
            print(f"  • id={s['id']:<40} '{s['name']:<40}'  {s['before']['price']} {s['before']['currency']:>3}  →  ₹{s['after']['price_inr']:>10.2f}")

    if not args.dry_run:
        print(f"\nBackups written:\n  - {products_backup}\n  - {listings_backup}")
    else:
        print("\nDRY-RUN: no writes. Re-run without --dry-run to commit.")


if __name__ == "__main__":
    asyncio.run(main())
