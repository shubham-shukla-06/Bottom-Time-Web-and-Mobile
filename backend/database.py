"""MongoDB handle — lazy, per-event-loop proxy.

Motor's `AsyncIOMotorClient` binds to the asyncio loop that is active at
instantiation time. In production the loop is long-lived so this is a
no-op. Under pytest, however, each `TestClient(app)` block spins up its
own loop via Starlette's anyio portal, and when the first module's
TestClient tears down, that loop closes — any subsequent module that
reuses the module-level Motor client then crashes with
`RuntimeError: Event loop is closed` on the first DB call.

The fix is a thin proxy that re-instantiates the underlying Motor client
whenever the current running loop differs from the one the client was
last built against. The public surface is unchanged:

    from database import db, client
    await db.users.find_one(...)
    client.close()

… still works exactly as before. The runtime path (single long-lived
loop) builds the client once and never rebuilds it.
"""

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import asyncio
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

_MONGO_URL = os.environ['MONGO_URL']
_DB_NAME = os.environ['DB_NAME']


def _current_loop():
    """Return the running asyncio loop, or None if called from sync code."""
    try:
        return asyncio.get_running_loop()
    except RuntimeError:
        return None


class _MotorProxy:
    """Lazy attribute-forwarding proxy that rebinds the underlying Motor
    client whenever the running asyncio loop changes.

    `kind` selects which Motor object the proxy stands in for:
      - "client" → `AsyncIOMotorClient` instance
      - "db"     → `AsyncIOMotorDatabase` for the configured DB_NAME
    """

    __slots__ = ("_kind", "_client", "_loop")

    def __init__(self, kind: str) -> None:
        self._kind = kind
        self._client = None
        self._loop = None

    def _resolve(self):
        loop = _current_loop()
        # Rebuild when:
        #   a) first access, OR
        #   b) the running loop differs from the one the client was bound to,
        #      AND we actually have a running loop (sync callers just re-use
        #      whatever we had last time).
        if self._client is None or (loop is not None and loop is not self._loop):
            # Best-effort close of the prior client. Motor's close() is sync
            # on the pool but schedules cleanup on the old loop — if that
            # loop is already gone the call raises RuntimeError, which is
            # fine to swallow here.
            if self._client is not None:
                try:
                    self._client.close()
                except Exception:
                    pass
            self._client = AsyncIOMotorClient(_MONGO_URL)
            self._loop = loop
        if self._kind == "client":
            return self._client
        return self._client[_DB_NAME]

    # Attribute / item access — forward to the underlying Motor object.
    def __getattr__(self, name: str):
        return getattr(self._resolve(), name)

    def __getitem__(self, name: str):
        return self._resolve()[name]


client = _MotorProxy("client")
db = _MotorProxy("db")
