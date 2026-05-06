from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from database import db
from auth_utils import get_current_user
from models import OperatorPayoutSettings, PlatformFeeUpdate
from config import wise_api_token, wise_api_base_url, wise_profile_id, razorpay_client
import httpx

router = APIRouter()


# --- Operator Payout Settings ---

@router.get("/operator/payout-settings")
async def get_payout_settings(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("operator", "instructor"):
        raise HTTPException(status_code=403, detail="Not authorized")
    settings = current_user.get("payout_settings", {})
    return {"payout_settings": settings, "payout_configured": bool(settings.get("payout_country"))}


@router.put("/operator/payout-settings")
async def update_payout_settings(data: OperatorPayoutSettings, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("operator", "instructor"):
        raise HTTPException(status_code=403, detail="Not authorized")

    settings = data.model_dump()
    settings["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"payout_settings": settings}}
    )
    return {"message": "Payout settings updated", "payout_settings": settings}


# --- Platform Fee Management (Admin) ---

@router.get("/admin/platform-fees")
async def get_platform_fees(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    fees = await db.platform_fees.find({}, {"_id": 0}).to_list(500)
    global_fee = await db.platform_fees.find_one({"entity_type": "global"}, {"_id": 0})
    return {
        "global_fee": global_fee.get("platform_fee_percent", 15.0) if global_fee else 15.0,
        "custom_fees": [f for f in fees if f.get("entity_type") != "global"]
    }


@router.put("/admin/platform-fees/global")
async def set_global_fee(request_data: dict, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    fee_percent = request_data.get("platform_fee_percent", 15.0)
    if fee_percent < 0 or fee_percent > 100:
        raise HTTPException(status_code=400, detail="Fee must be between 0 and 100")

    await db.platform_fees.update_one(
        {"entity_type": "global"},
        {"$set": {
            "entity_type": "global",
            "entity_id": "global",
            "platform_fee_percent": fee_percent,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user["id"]
        }},
        upsert=True
    )
    return {"message": f"Global platform fee set to {fee_percent}%"}


@router.put("/admin/platform-fees/custom")
async def set_custom_fee(data: PlatformFeeUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    if data.platform_fee_percent < 0 or data.platform_fee_percent > 100:
        raise HTTPException(status_code=400, detail="Fee must be between 0 and 100")

    if data.entity_type not in ("listing", "product", "event", "operator"):
        raise HTTPException(status_code=400, detail="Invalid entity type")

    await db.platform_fees.update_one(
        {"entity_type": data.entity_type, "entity_id": data.entity_id},
        {"$set": {
            "entity_type": data.entity_type,
            "entity_id": data.entity_id,
            "platform_fee_percent": data.platform_fee_percent,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user["id"]
        }},
        upsert=True
    )
    return {"message": f"Custom fee set to {data.platform_fee_percent}% for {data.entity_type}/{data.entity_id}"}


@router.delete("/admin/platform-fees/custom")
async def delete_custom_fee(
    entity_type: str = Query(...), entity_id: str = Query(...),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    await db.platform_fees.delete_one({"entity_type": entity_type, "entity_id": entity_id})
    return {"message": "Custom fee removed, will use global fee"}


# --- Payout Dashboard ---

@router.get("/payouts")
async def get_payouts(
    status: str = Query(None),
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if current_user["role"] in ("operator", "instructor"):
        query["operator_id"] = current_user["id"]
    elif current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    if status:
        query["status"] = status

    payouts = await db.payouts.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)

    total_pending = sum(p["operator_amount"] for p in payouts if p["status"] == "pending")
    total_processing = sum(p["operator_amount"] for p in payouts if p["status"] == "processing")
    total_completed = sum(p["operator_amount"] for p in payouts if p["status"] == "completed")

    return {
        "payouts": payouts,
        "summary": {
            "total_pending": round(total_pending, 2),
            "total_processing": round(total_processing, 2),
            "total_completed": round(total_completed, 2),
            "count": len(payouts)
        }
    }


@router.post("/payouts/{payout_id}/process")
async def process_payout(payout_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    payout = await db.payouts.find_one({"id": payout_id}, {"_id": 0})
    if not payout:
        raise HTTPException(status_code=404, detail="Payout not found")
    if payout["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Payout is already {payout['status']}")

    if payout["payout_method"] == "razorpay_route":
        result = await _process_razorpay_payout(payout)
    elif payout["payout_method"] == "wise":
        result = await _process_wise_payout(payout)
    else:
        raise HTTPException(status_code=400, detail="Unknown payout method")

    return result


@router.post("/payouts/batch-process")
async def batch_process_payouts(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    pending = await db.payouts.find({"status": "pending"}, {"_id": 0}).to_list(100)
    results = {"processed": 0, "failed": 0, "details": []}

    for payout in pending:
        try:
            if payout["payout_method"] == "razorpay_route":
                await _process_razorpay_payout(payout)
            elif payout["payout_method"] == "wise":
                await _process_wise_payout(payout)
            results["processed"] += 1
            results["details"].append({"id": payout["id"], "status": "processing"})
        except Exception as e:
            results["failed"] += 1
            results["details"].append({"id": payout["id"], "status": "failed", "error": str(e)})

    return results


# --- Payout Processing ---

async def _process_razorpay_payout(payout: dict) -> dict:
    """Process payout via Razorpay Route (Indian operators)"""
    if not razorpay_client:
        await db.payouts.update_one(
            {"id": payout["id"]},
            {"$set": {
                "status": "processing",
                "processing_method": "razorpay_route_mock",
                "processed_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        return {"status": "processing", "method": "razorpay_route", "mock": True, "payout_id": payout["id"]}

    try:
        transfer = razorpay_client.payment.transfer(payout["payment_id"], {
            "transfers": [{
                "account": payout.get("razorpay_linked_account", ""),
                "amount": int(payout["operator_amount"] * 100),
                "currency": "INR"
            }]
        })
        await db.payouts.update_one(
            {"id": payout["id"]},
            {"$set": {
                "status": "processing",
                "processing_method": "razorpay_route",
                "transfer_ref": str(transfer),
                "processed_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        return {"status": "processing", "method": "razorpay_route", "payout_id": payout["id"]}
    except Exception as e:
        await db.payouts.update_one(
            {"id": payout["id"]},
            {"$set": {"status": "failed", "error": str(e)}}
        )
        raise HTTPException(status_code=500, detail=f"Razorpay payout failed: {str(e)}")


async def _process_wise_payout(payout: dict) -> dict:
    """Process payout via Wise (international operators)"""
    if not wise_api_token or wise_api_token.startswith("placeholder"):
        await db.payouts.update_one(
            {"id": payout["id"]},
            {"$set": {
                "status": "processing",
                "processing_method": "wise_mock",
                "processed_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        return {"status": "processing", "method": "wise", "mock": True, "payout_id": payout["id"]}

    await db.users.find_one({"id": payout["operator_id"]}, {"_id": 0})

    headers = {
        "Authorization": f"Bearer {wise_api_token}",
        "Content-Type": "application/json"
    }

    try:
        async with httpx.AsyncClient(headers=headers, timeout=30.0) as client:
            # Step 1: Create quote
            quote_resp = await client.post(
                f"{wise_api_base_url}/v3/profiles/{wise_profile_id}/quotes",
                json={
                    "sourceCurrency": "INR",
                    "targetCurrency": payout["payout_currency"],
                    "sourceAmount": payout["operator_amount"]
                }
            )
            quote_resp.raise_for_status()
            quote = quote_resp.json()

            # Step 2: Create transfer
            transfer_resp = await client.post(
                f"{wise_api_base_url}/v3/profiles/{wise_profile_id}/transfers",
                json={
                    "targetAccount": payout.get("wise_recipient_id"),
                    "quoteUuid": quote["id"],
                    "customerTransactionId": payout["id"],
                    "details": {"reference": f"BT Payout {payout['id'][:8]}"}
                }
            )
            transfer_resp.raise_for_status()
            transfer = transfer_resp.json()

            # Step 3: Fund transfer
            fund_resp = await client.post(
                f"{wise_api_base_url}/v3/profiles/{wise_profile_id}/transfers/{transfer['id']}/payments",
                json={"type": "BALANCE"}
            )
            fund_resp.raise_for_status()

        await db.payouts.update_one(
            {"id": payout["id"]},
            {"$set": {
                "status": "processing",
                "processing_method": "wise",
                "wise_transfer_id": transfer["id"],
                "wise_quote_id": quote["id"],
                "processed_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        return {"status": "processing", "method": "wise", "payout_id": payout["id"]}

    except Exception as e:
        await db.payouts.update_one(
            {"id": payout["id"]},
            {"$set": {"status": "failed", "error": str(e)}}
        )
        raise HTTPException(status_code=500, detail=f"Wise payout failed: {str(e)}")


@router.get("/payouts/{payout_id}/status")
async def get_payout_status(payout_id: str, current_user: dict = Depends(get_current_user)):
    payout = await db.payouts.find_one({"id": payout_id}, {"_id": 0})
    if not payout:
        raise HTTPException(status_code=404, detail="Payout not found")

    if current_user["role"] not in ("admin",) and payout["operator_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    if payout.get("wise_transfer_id") and wise_api_token and not wise_api_token.startswith("placeholder"):
        headers = {"Authorization": f"Bearer {wise_api_token}"}
        try:
            async with httpx.AsyncClient(headers=headers, timeout=30.0) as client:
                resp = await client.get(f"{wise_api_base_url}/v1/transfers/{payout['wise_transfer_id']}")
                if resp.status_code == 200:
                    wise_status = resp.json().get("status", "")
                    if wise_status == "outgoing_payment_sent":
                        await db.payouts.update_one({"id": payout_id}, {"$set": {"status": "completed"}})
                        payout["status"] = "completed"
                    payout["wise_status"] = wise_status
        except Exception:
            pass

    return payout
