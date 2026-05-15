from fastapi import APIRouter, HTTPException, Depends, Query, File, UploadFile
from datetime import datetime, timezone
from typing import Optional
from database import db
from auth_utils import get_current_user
from config import UPLOAD_DIR
from tax_engine import get_product_tax_category, DEFAULT_TAX_RATES
from pricing_helpers import derive_price_inr
import uuid

router = APIRouter()



@router.post("/admin/products/tax-preview")
async def product_tax_preview(request_data: dict, current_user: dict = Depends(get_current_user)):
    """Preview auto-detected tax category and GST rate for a product name."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    name = request_data.get("name", "")
    category = request_data.get("category", "")
    detected = get_product_tax_category({"name": name, "category": category})
    rate_info = DEFAULT_TAX_RATES.get(detected, DEFAULT_TAX_RATES["general_merch"])
    return {
        "detected_category": detected,
        "gst_rate": rate_info["gst_rate"],
        "hsn_code": rate_info["sac_hsn"],
        "description": rate_info["description"],
    }

# --- Product Management (Admin) ---

@router.post("/admin/products")
async def create_product(request_data: dict, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    required = ["name", "category", "price"]
    for f in required:
        if not request_data.get(f):
            raise HTTPException(status_code=400, detail=f"Missing required field: {f}")

    product = {
        "id": str(uuid.uuid4()),
        "name": request_data["name"],
        "category": request_data.get("category", "merch"),
        "description": request_data.get("description", ""),
        "price": float(request_data["price"]),
        "compare_at_price": float(request_data["compare_at_price"]) if request_data.get("compare_at_price") else None,
        "currency": request_data.get("currency", "USD"),
        "image_url": request_data.get("image_url", ""),
        "images": request_data.get("images", []),
        "sizes": request_data.get("sizes", []),
        "in_stock": request_data.get("in_stock", True),
        "stock": int(request_data.get("stock", 100)),
        "weight": float(request_data.get("weight", 0.3)),
        "sold_count": 0,
        "highlights": request_data.get("highlights", []),
        "tax_category": request_data.get("tax_category") or get_product_tax_category({"name": request_data["name"], "category": request_data.get("category", "")}),
        "country_of_origin": request_data.get("country_of_origin", "India"),
        "manufacturer": request_data.get("manufacturer", ""),
        "manufacturer_address": request_data.get("manufacturer_address", ""),
        "importer": request_data.get("importer", ""),
        "net_quantity": request_data.get("net_quantity", ""),
        "warranty": request_data.get("warranty", ""),
        "return_policy": request_data.get("return_policy", "7-day return"),
        "delivery_estimate": request_data.get("delivery_estimate", "5-7 business days"),
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    # ── Phase 4-P0: canonical INR pricing ───────────────────────────
    # `price_inr` is the source of truth going forward; `price` + `currency`
    # remain readable mirrors. Operator may pin specific other-currency
    # prices via `price_overrides` — those bypass FX for that currency only.
    if request_data.get("price_inr") is not None:
        product["price_inr"] = float(request_data["price_inr"])
    else:
        product["price_inr"] = await derive_price_inr(product["price"], product["currency"])
    product["price_overrides"] = request_data.get("price_overrides") or {}
    await db.products.insert_one(product.copy())
    return product


@router.put("/admin/products/{product_id}")
async def update_product(product_id: str, request_data: dict, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    allowed_fields = ["name", "category", "description", "price", "compare_at_price", "currency", "image_url",
                      "images", "sizes", "in_stock", "stock", "weight", "highlights", "tax_category", "status",
                      "country_of_origin", "manufacturer", "manufacturer_address", "importer",
                      "net_quantity", "warranty", "return_policy", "delivery_estimate",
                      "price_inr", "price_overrides"]
    update = {k: request_data[k] for k in allowed_fields if k in request_data}
    if "price" in update:
        update["price"] = float(update["price"])
    if "compare_at_price" in update:
        update["compare_at_price"] = float(update["compare_at_price"]) if update["compare_at_price"] else None
    if "stock" in update:
        update["stock"] = int(update["stock"])
    if "weight" in update:
        update["weight"] = float(update["weight"])
    # ── Phase 4-P0: recompute price_inr whenever price or currency change ───
    if "price_inr" in update:
        update["price_inr"] = float(update["price_inr"])
    elif "price" in update or "currency" in update:
        new_price = update.get("price", product.get("price"))
        new_currency = update.get("currency", product.get("currency", "USD"))
        update["price_inr"] = await derive_price_inr(new_price, new_currency)
    update["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.products.update_one({"id": product_id}, {"$set": update})
    return await db.products.find_one({"id": product_id}, {"_id": 0})


@router.delete("/admin/products/{product_id}")
async def delete_product(product_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted"}


@router.get("/admin/products")
async def get_admin_products(
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    query = {}
    if category:
        query["category"] = category
    if status:
        query["status"] = status
    products = await db.products.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    total_stock = sum(p.get("stock", 0) for p in products)
    total_sold = sum(p.get("sold_count", 0) for p in products)
    out_of_stock = len([p for p in products if not p.get("in_stock", True)])
    return {
        "products": products,
        "summary": {
            "total": len(products),
            "active": len([p for p in products if p.get("status") == "active"]),
            "out_of_stock": out_of_stock,
            "total_stock": total_stock,
            "total_sold": total_sold,
        }
    }


@router.post("/admin/products/upload-image")
async def upload_product_image(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    allowed = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP allowed")
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    if ext not in {"jpg", "jpeg", "png", "webp"}:
        raise HTTPException(status_code=400, detail="Invalid file extension")
    filename = f"product_{uuid.uuid4().hex[:12]}.{ext}"
    filepath = UPLOAD_DIR / filename
    with open(filepath, "wb") as f:
        f.write(contents)
    return {"url": f"/api/uploads/{filename}"}


# --- Promo & Referral Codes ---

@router.post("/admin/promo-codes")
async def create_promo_code(request_data: dict, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    code = (request_data.get("code") or "").strip().upper()
    if not code or len(code) < 3:
        raise HTTPException(status_code=400, detail="Code must be at least 3 characters")

    existing = await db.promo_codes.find_one({"code": code})
    if existing:
        raise HTTPException(status_code=400, detail="Code already exists")

    promo = {
        "id": str(uuid.uuid4()),
        "code": code,
        "type": request_data.get("type", "percentage"),  # percentage | flat
        "value": float(request_data.get("value", 10)),
        "max_discount": float(request_data.get("max_discount", 0)) if request_data.get("max_discount") else None,
        "min_order": float(request_data.get("min_order", 0)),
        "usage_limit": int(request_data.get("usage_limit", 0)),  # 0 = unlimited
        "per_user_limit": int(request_data.get("per_user_limit", 1)),
        "used_count": 0,
        "applies_to": request_data.get("applies_to", "all"),  # all | shop | bookings
        "source": request_data.get("source", "marketing"),  # marketing | operator | influencer | referral
        "operator_id": request_data.get("operator_id"),
        "influencer_name": request_data.get("influencer_name"),
        "active": True,
        "expires_at": request_data.get("expires_at"),
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.promo_codes.insert_one(promo.copy())
    return promo


@router.get("/admin/promo-codes")
async def get_promo_codes(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    codes = await db.promo_codes.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {
        "promo_codes": codes,
        "summary": {
            "total": len(codes),
            "active": len([c for c in codes if c.get("active")]),
            "total_uses": sum(c.get("used_count", 0) for c in codes),
        }
    }


@router.put("/admin/promo-codes/{code_id}")
async def update_promo_code(code_id: str, request_data: dict, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    code = await db.promo_codes.find_one({"id": code_id}, {"_id": 0})
    if not code:
        raise HTTPException(status_code=404, detail="Promo code not found")

    allowed = ["active", "value", "max_discount", "min_order", "usage_limit", "per_user_limit", "expires_at", "applies_to"]
    update = {k: request_data[k] for k in allowed if k in request_data}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.promo_codes.update_one({"id": code_id}, {"$set": update})
    return await db.promo_codes.find_one({"id": code_id}, {"_id": 0})


@router.delete("/admin/promo-codes/{code_id}")
async def delete_promo_code(code_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.promo_codes.delete_one({"id": code_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"message": "Promo code deleted"}


@router.post("/promo-codes/validate")
async def validate_promo_code(request_data: dict, current_user: dict = Depends(get_current_user)):
    """Validate and calculate discount for a promo code at checkout"""
    code_str = (request_data.get("code") or "").strip().upper()
    order_total = float(request_data.get("order_total", 0))
    applies_to = request_data.get("applies_to", "all")

    if not code_str:
        raise HTTPException(status_code=400, detail="Please enter a promo code")

    promo = await db.promo_codes.find_one({"code": code_str, "active": True}, {"_id": 0})
    if not promo:
        raise HTTPException(status_code=404, detail="Invalid or expired promo code")

    # Check expiry
    if promo.get("expires_at"):
        if datetime.now(timezone.utc).isoformat() > promo["expires_at"]:
            raise HTTPException(status_code=400, detail="Promo code has expired")

    # Check usage limit
    if promo.get("usage_limit") and promo["used_count"] >= promo["usage_limit"]:
        raise HTTPException(status_code=400, detail="Promo code usage limit reached")

    # Check per-user limit
    user_uses = await db.promo_usage.count_documents({"code": code_str, "user_id": current_user["id"]})
    if promo.get("per_user_limit") and user_uses >= promo["per_user_limit"]:
        raise HTTPException(status_code=400, detail="You've already used this code")

    # Check applies_to
    if promo["applies_to"] != "all" and promo["applies_to"] != applies_to:
        raise HTTPException(status_code=400, detail=f"This code is only valid for {promo['applies_to']}")

    # Check minimum order
    if promo.get("min_order") and order_total < promo["min_order"]:
        raise HTTPException(status_code=400, detail=f"Minimum order amount is {promo['min_order']}")

    # Calculate discount
    if promo["type"] == "percentage":
        discount = round(order_total * promo["value"] / 100, 2)
        if promo.get("max_discount") and discount > promo["max_discount"]:
            discount = promo["max_discount"]
    else:
        discount = min(promo["value"], order_total)

    return {
        "valid": True,
        "code": code_str,
        "type": promo["type"],
        "value": promo["value"],
        "discount": round(discount, 2),
        "final_total": round(order_total - discount, 2),
        "description": f"{promo['value']}% off" if promo["type"] == "percentage" else f"${promo['value']} off",
    }


@router.post("/promo-codes/apply")
async def apply_promo_code(request_data: dict, current_user: dict = Depends(get_current_user)):
    """Record promo code usage after successful payment"""
    code_str = (request_data.get("code") or "").strip().upper()
    order_id = request_data.get("order_id")
    discount = float(request_data.get("discount", 0))

    promo = await db.promo_codes.find_one({"code": code_str, "active": True}, {"_id": 0})
    if not promo:
        return {"applied": False}

    await db.promo_usage.insert_one({
        "code": code_str,
        "promo_id": promo["id"],
        "user_id": current_user["id"],
        "order_id": order_id,
        "discount": discount,
        "used_at": datetime.now(timezone.utc).isoformat()
    })
    await db.promo_codes.update_one({"id": promo["id"]}, {"$inc": {"used_count": 1}})
    return {"applied": True}


# --- Promo Code Usage Analytics ---

@router.get("/admin/promo-codes/{code_id}/usage")
async def get_promo_usage(code_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    promo = await db.promo_codes.find_one({"id": code_id}, {"_id": 0})
    if not promo:
        raise HTTPException(status_code=404, detail="Not found")
    usage = await db.promo_usage.find({"promo_id": code_id}, {"_id": 0}).sort("used_at", -1).to_list(500)
    return {
        "promo": promo,
        "usage": usage,
        "total_discount_given": round(sum(u.get("discount", 0) for u in usage), 2),
    }
