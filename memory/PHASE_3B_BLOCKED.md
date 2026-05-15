# Phase 3b — Multi-warehouse — BLOCKED

> **Status: BLOCKED (2026-05-15)** — Waiting on GCP project owner to enable APIs.

## Blocker

Probing Google Distance Matrix on `GOOGLE_PLACES_API_KEY` returns
`REQUEST_DENIED` (legacy API not enabled). The newer **Routes API** also
returns `403 PERMISSION_DENIED / SERVICE_DISABLED`:

```
Routes API has not been used in project 314750536065 before or it is
disabled. Enable it by visiting
https://console.developers.google.com/apis/api/routes.googleapis.com/overview?project=314750536065
```

Per Dispatch D constraints ("If 403 / 'API not enabled' → STOP and report.
No Haversine fallback."), Phase 3b is parked.

## To unblock

1. GCP project owner enables **one** of:
   - **Routes API** (preferred — newer, supports `computeRouteMatrix`)
   - Legacy Distance Matrix API
2. Wait 2–3 minutes for propagation.
3. Re-run the probe:

```bash
cd /app/backend && python3 -c "
import os, httpx
from dotenv import load_dotenv
load_dotenv('.env')
key = os.environ['GOOGLE_PLACES_API_KEY']
r = httpx.post(
    'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
    json={'origins':[{'waypoint':{'address':'Mumbai, India'}}],
          'destinations':[{'waypoint':{'address':'Bangalore, India'}}],
          'travelMode':'DRIVE'},
    headers={'X-Goog-Api-Key': key,
             'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration'},
    timeout=15)
print('HTTP', r.status_code)
print(r.text[:500])
"
```
Pass condition: `HTTP 200` with `distanceMeters` populated.

4. Resume by implementing the 8 sub-items from Dispatch D Phase 3b:
   warehouses + product_inventory collections, migration with backup,
   admin UI, nearest-warehouse routing endpoint, cart pinning,
   Shiprocket pickup-address swap, Lock F in `CART_CHECKOUT_LOCKED.md`.

## Why no Haversine fallback

User decision (Dispatch D):
> "Document Google Distance Matrix dependency + 24h cache + Haversine
>  fallback policy (NONE — user said no Haversine; if Distance Matrix is
>  down, the system MUST surface an error, not fall back)."

Cart pinning errors will surface to the user as
`"Shipping calculation temporarily unavailable — please retry shortly"`
rather than silently routing to a wrong warehouse.
