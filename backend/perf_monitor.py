import time
from collections import defaultdict, deque
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

# Ring buffer: last 2000 requests
_request_log = deque(maxlen=2000)
# Aggregated per-endpoint stats (reset every 5 min)
_endpoint_stats = defaultdict(lambda: {"count": 0, "total_ms": 0, "max_ms": 0, "errors": 0})
_last_reset = time.time()
_RESET_INTERVAL = 300  # 5 minutes

# Compression tracking
_compression_stats = {"requests": 0, "compressed": 0, "bytes_saved": 0}

# Cache tracking (updated from frontend reports)
_cache_stats = {"hits": 0, "misses": 0}


def _normalize_path(path: str) -> str:
    """Collapse IDs into :id for grouping, e.g. /api/listings/abc123 -> /api/listings/:id"""
    parts = path.rstrip("/").split("/")
    normalized = []
    for i, p in enumerate(parts):
        if i > 0 and len(p) > 8 and any(c.isdigit() for c in p):
            normalized.append(":id")
        else:
            normalized.append(p)
    return "/".join(normalized)


class PerfMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> dict:
        global _last_reset
        if time.time() - _last_reset > _RESET_INTERVAL:
            _endpoint_stats.clear()
            _last_reset = time.time()

        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000

        path = _normalize_path(request.url.path)
        method = request.method

        if path.startswith("/api/") and method in ("GET", "POST", "PUT", "DELETE", "PATCH"):
            key = f"{method} {path}"
            content_len = int(response.headers.get("content-length", 0))
            _request_log.append({"method": method, "path": path, "status": response.status_code, "ms": round(elapsed_ms, 1), "ts": time.time(), "size": content_len})

            stats = _endpoint_stats[key]
            stats["count"] += 1
            stats["total_ms"] += elapsed_ms
            stats["max_ms"] = max(stats["max_ms"], elapsed_ms)
            if response.status_code >= 400:
                stats["errors"] += 1

            _compression_stats["requests"] += 1
            if content_len > 500:
                _compression_stats["compressed"] += 1

        return response


def _get_recent_requests(window_sec: int = 60) -> list:
    """Filter request log to recent window."""
    cutoff = time.time() - window_sec
    return [r for r in _request_log if r["ts"] > cutoff]


def _build_endpoint_table() -> list:
    """Build per-endpoint performance breakdown."""
    result = []
    for key, stats in sorted(_endpoint_stats.items(), key=lambda x: x[1]["total_ms"], reverse=True):
        count = stats["count"]
        avg = stats["total_ms"] / count if count else 0
        result.append({
            "endpoint": key, "requests": count,
            "avg_ms": round(avg, 1), "max_ms": round(stats["max_ms"], 1),
            "error_rate": round((stats["errors"] / count) * 100, 1) if count else 0,
        })
    return result[:20]


def _build_distribution(all_times: list) -> list:
    """Bucket response times into histogram."""
    buckets = {"<50ms": 0, "50-100ms": 0, "100-300ms": 0, "300-1000ms": 0, ">1s": 0}
    for ms in all_times:
        if ms < 50:
            buckets["<50ms"] += 1
        elif ms < 100:
            buckets["50-100ms"] += 1
        elif ms < 300:
            buckets["100-300ms"] += 1
        elif ms < 1000:
            buckets["300-1000ms"] += 1
        else:
            buckets[">1s"] += 1
    return [{"bucket": k, "count": v} for k, v in buckets.items()]


def _build_timeline(recent: list) -> list:
    """Build 5-second-bucket throughput timeline for last 60s."""
    now = time.time()
    timeline = []
    for i in range(12):
        t_start = now - (12 - i) * 5
        t_end = t_start + 5
        bucket_reqs = [r for r in recent if t_start <= r["ts"] < t_end]
        avg_ms = sum(r["ms"] for r in bucket_reqs) / len(bucket_reqs) if bucket_reqs else 0
        timeline.append({"time": f"-{(12-i)*5}s", "requests": len(bucket_reqs), "avg_ms": round(avg_ms, 1)})
    return timeline


def _compute_percentiles(all_times: list) -> dict:
    """Compute p50, p95, p99 from sorted response times."""
    if not all_times:
        return {"p50_ms": 0, "p95_ms": 0, "p99_ms": 0}
    s = sorted(all_times)
    return {
        "p50_ms": round(s[len(s) // 2], 1),
        "p95_ms": round(s[int(len(s) * 0.95)], 1),
        "p99_ms": round(s[int(len(s) * 0.99)], 1),
    }


def _build_status_codes(recent: list) -> list:
    """Group recent requests by HTTP status code category."""
    dist: dict = defaultdict(int)
    for r in recent:
        dist[f"{r['status'] // 100}xx"] += 1
    return [{"status": k, "count": v} for k, v in sorted(dist.items())]


def get_perf_snapshot() -> dict:
    """Return current performance data for the dashboard."""
    recent = _get_recent_requests(60)
    all_times = [r["ms"] for r in recent]
    percentiles = _compute_percentiles(all_times)

    total_reqs = _compression_stats["requests"]
    total_cache = _cache_stats["hits"] + _cache_stats["misses"]

    return {
        "summary": {
            "total_requests_60s": len(recent),
            "rps": round(len(recent) / 60, 2) if recent else 0,
            "avg_ms": round(sum(all_times) / len(all_times), 1) if all_times else 0,
            **percentiles,
            "error_rate": round(sum(1 for r in recent if r["status"] >= 400) / len(recent) * 100, 1) if recent else 0,
        },
        "compression": {
            "total_requests": total_reqs,
            "compressed": _compression_stats["compressed"],
            "ratio": round(_compression_stats["compressed"] / total_reqs * 100, 1) if total_reqs else 0,
        },
        "cache": {
            "hits": _cache_stats["hits"],
            "misses": _cache_stats["misses"],
            "hit_rate": round(_cache_stats["hits"] / total_cache * 100, 1) if total_cache else 0,
        },
        "distribution": _build_distribution(all_times),
        "status_codes": _build_status_codes(recent),
        "timeline": _build_timeline(recent),
        "endpoints": _build_endpoint_table(),
    }


def report_cache_stats(hits: int, misses: int) -> dict:
    """Accept cache hit/miss reports from frontend."""
    _cache_stats["hits"] += hits
    _cache_stats["misses"] += misses
