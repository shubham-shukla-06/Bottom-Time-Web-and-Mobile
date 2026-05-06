import time
from typing import Any, Optional

_store: dict[str, tuple[Any, float]] = {}

def cache_get(key: str, ttl: int = 30) -> Optional[Any]:
    entry = _store.get(key)
    if entry and time.time() - entry[1] < ttl:
        return entry[0]
    return None

def cache_set(key: str, value: Any) -> None:
    _store[key] = (value, time.time())

def cache_invalidate(prefix: Optional[str] = None) -> None:
    if prefix:
        keys = [k for k in _store if k.startswith(prefix)]
        for k in keys:
            del _store[k]
    else:
        _store.clear()
