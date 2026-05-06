from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional
from database import db
from cache import cache_get, cache_set
from auth_utils import get_current_user, require_admin
from perf_monitor import get_perf_snapshot, report_cache_stats
import analytics as analytics_engine
import marketing as marketing_engine

router = APIRouter()


@router.get("/cmd/pulse")
async def cmd_pulse(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    cached = cache_get("cmd:pulse", 30)
    if cached:
        return cached
    result = await analytics_engine.executive_pulse(db)
    cache_set("cmd:pulse", result)
    return result


@router.get("/cmd/discover")
async def cmd_discover(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    cached = cache_get("cmd:discover", 30)
    if cached:
        return cached
    result = await analytics_engine.discover_marketplace(db)
    cache_set("cmd:discover", result)
    return result


@router.get("/cmd/pathway")
async def cmd_pathway(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    cached = cache_get("cmd:pathway", 30)
    if cached:
        return cached
    result = await analytics_engine.dive_pathway(db)
    cache_set("cmd:pathway", result)
    return result


@router.get("/cmd/shop")
async def cmd_shop(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    cached = cache_get("cmd:shop", 30)
    if cached:
        return cached
    result = await analytics_engine.commerce_shop(db)
    cache_set("cmd:shop", result)
    return result


@router.get("/cmd/community")
async def cmd_community(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    cached = cache_get("cmd:community", 30)
    if cached:
        return cached
    result = await analytics_engine.community_social(db)
    cache_set("cmd:community", result)
    return result


@router.get("/cmd/chat")
async def cmd_chat(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    cached = cache_get("cmd:chat", 30)
    if cached:
        return cached
    result = await analytics_engine.chat_communication(db)
    cache_set("cmd:chat", result)
    return result


@router.get("/cmd/events")
async def cmd_events(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    cached = cache_get("cmd:events", 30)
    if cached:
        return cached
    result = await analytics_engine.events_meetups(db)
    cache_set("cmd:events", result)
    return result


@router.get("/cmd/revenue")
async def cmd_revenue(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    cached = cache_get("cmd:revenue", 30)
    if cached:
        return cached
    result = await analytics_engine.revenue_economics(db)
    cache_set("cmd:revenue", result)
    return result


@router.get("/cmd/cashflow")
async def cmd_cashflow(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    cached = cache_get("cmd:cashflow", 30)
    if cached:
        return cached
    result = await analytics_engine.cashflow_payments(db)
    cache_set("cmd:cashflow", result)
    return result


@router.get("/cmd/trust")
async def cmd_trust(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    cached = cache_get("cmd:trust", 30)
    if cached:
        return cached
    result = await analytics_engine.trust_safety(db)
    cache_set("cmd:trust", result)
    return result


@router.get("/cmd/platform")
async def cmd_platform(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    cached = cache_get("cmd:platform", 30)
    if cached:
        return cached
    result = await analytics_engine.platform_performance(db)
    cache_set("cmd:platform", result)
    return result


@router.get("/cmd/growth")
async def cmd_growth(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    cached = cache_get("cmd:growth", 30)
    if cached:
        return cached
    result = await analytics_engine.user_growth_trends(db)
    cache_set("cmd:growth", result)
    return result


@router.get("/cmd/alerts")
async def cmd_alerts(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    cached = cache_get("cmd:alerts", 30)
    if cached:
        return cached
    result = await analytics_engine.compute_alerts(db)
    cache_set("cmd:alerts", result)
    return result


@router.get("/cmd/drilldown")
async def cmd_drilldown(current_user: dict = Depends(get_current_user), country: Optional[str] = Query(None)):
    await require_admin(current_user)
    key = f"cmd:drilldown:{country or 'global'}"
    cached = cache_get(key, 30)
    if cached:
        return cached
    result = await analytics_engine.drill_down_metrics(db, country=country)
    cache_set(key, result)
    return result


@router.get("/cmd/marketing")
async def cmd_marketing(current_user: dict = Depends(get_current_user), model: str = Query("first_touch")):
    await require_admin(current_user)
    key = f"cmd:marketing:{model}"
    cached = cache_get(key, 30)
    if cached:
        return cached
    result = await marketing_engine.marketing_overview(db, model=model)
    cache_set(key, result)
    return result


@router.get("/cmd/funnels")
async def cmd_funnels(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    return await marketing_engine.funnel_analytics(db)


@router.get("/cmd/journey/{user_id}")
async def cmd_journey(user_id: str, current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    result = await marketing_engine.user_journey(db, user_id)
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    return result


@router.get("/cmd/journeys")
async def cmd_journeys(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    return await marketing_engine.aggregated_journeys(db)


@router.get("/cmd/operator-attribution")
async def cmd_operator_attr(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    return await marketing_engine.operator_attribution(db)


@router.get("/cmd/campaign-performance")
async def cmd_campaign_perf(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    return await marketing_engine.campaign_performance(db)


@router.get("/cmd/retention")
async def cmd_retention(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    return await marketing_engine.retention_by_channel(db)



class CacheReport(BaseModel):
    hits: int = 0
    misses: int = 0


@router.get("/cmd/perf")
async def cmd_perf(current_user: dict = Depends(get_current_user)):
    await require_admin(current_user)
    snapshot = get_perf_snapshot()
    # Also add MongoDB index stats
    index_count = 0
    collections = await db.list_collection_names()
    for coll_name in collections:
        indexes = await db[coll_name].index_information()
        index_count += len([k for k in indexes if k != "_id_"])
    snapshot["indexes"] = {"total": index_count, "collections": len(collections)}
    return snapshot


@router.post("/cmd/perf/cache-report")
async def cmd_cache_report(report: CacheReport, current_user: dict = Depends(get_current_user)):
    report_cache_stats(report.hits, report.misses)
    return {"ok": True}
