"""
Phase 4-P1 backfill — add amount_inr + fx_rate_locked to existing
orders + bookings rows that pre-date the multi-currency rebase.

Idempotent: skips rows already having amount_inr.

Backs up affected rows BEFORE writing to /app/backups/.

Usage:
    python3 -m migrations.backfill_order_fx --dry-run
    python3 -m migrations.backfill_order_fx
"""
import asyncio
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import db  # noqa: E402
from pricing_helpers import get_fx_rates, convert_to_inr  # noqa: E402


def derive_inr(amount, currency, rates, inr_rate):
    if amount is None:
        return None
    return convert_to_inr(amount, currency, rates, inr_rate)


async def backfill_collection(coll_name: str, amount_field: str, currency_field: str, dry_run: bool, rates: dict, inr_rate: float, backup_path: Path):
    coll = db[coll_name]
    cursor = coll.find({}, {"_id": 0, "id": 1, amount_field: 1, currency_field: 1, "amount_inr": 1, "fx_rate_locked": 1})
    docs = await cursor.to_list(length=10000)

    sample, backup_rows, updated, skipped = [], [], 0, 0

    for doc in docs:
        backup_rows.append({k: doc.get(k) for k in ("id", amount_field, currency_field, "amount_inr", "fx_rate_locked")})
        if doc.get("amount_inr") is not None:
            skipped += 1
            continue
        amount = doc.get(amount_field)
        currency = (doc.get(currency_field) or "INR").upper()
        if amount is None:
            continue
        if currency == "INR":
            amount_inr = round(float(amount), 2)
            fx_rate_locked = 1.0
            fx_source = "identity_backfill"
        else:
            amount_inr = derive_inr(amount, currency, rates, inr_rate)
            fx_rate_locked = inr_rate
            fx_source = "backfill_today"
        if amount_inr is None or amount_inr < 0:
            print(f"  WARNING: skip {coll_name} id={doc.get('id')} → invalid amount_inr={amount_inr}")
            continue
        s = {
            "id": doc.get("id"),
            "before": {amount_field: amount, currency_field: currency, "amount_inr": None},
            "after": {"amount_inr": amount_inr, "fx_rate_locked": fx_rate_locked, "fx_source": fx_source},
        }
        if len(sample) < 5:
            sample.append(s)
        if not dry_run:
            await coll.update_one(
                {"id": doc.get("id")},
                {"$set": {
                    "amount_inr": amount_inr,
                    "amount_display": round(float(amount), 2),
                    "display_currency": currency,
                    "fx_rate_locked": fx_rate_locked,
                    "fx_locked_at": datetime.now(timezone.utc).isoformat(),
                    "fx_source": fx_source,
                }},
            )
        updated += 1

    if not dry_run and backup_rows:
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        backup_path.write_text(json.dumps(backup_rows, indent=2, default=str))

    return {"collection": coll_name, "total": len(docs), "updated": updated, "skipped": skipped, "sample": sample}


async def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    inr_rate, rates = await get_fx_rates()
    print(f"FX source: frankfurter — USD→INR = {inr_rate}")

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backups = Path("/app/backups")
    results = []
    for coll, amt_field, cur_field, bkup in [
        ("orders", "total", "currency", backups / f"orders_pre_inr_{ts}.json"),
        ("bookings", "price", "currency", backups / f"bookings_pre_inr_{ts}.json"),
    ]:
        r = await backfill_collection(coll, amt_field, cur_field, args.dry_run, rates, inr_rate, bkup)
        results.append(r)
        print(f"\n[{coll}] total={r['total']} updated={r['updated']} skipped={r['skipped']}")
        for s in r["sample"]:
            print(f"  • id={s['id']:<40}  {s['before']}  →  {s['after']}")

    if args.dry_run:
        print("\nDRY-RUN — no writes.")
    else:
        for r, b in zip(results, [backups / f"orders_pre_inr_{ts}.json", backups / f"bookings_pre_inr_{ts}.json"]):
            print(f"  backup → {b}")


if __name__ == "__main__":
    asyncio.run(main())
