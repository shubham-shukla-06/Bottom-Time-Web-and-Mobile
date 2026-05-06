from pathlib import Path
import os

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parents[2]
FRONTEND_ENV = ROOT_DIR / "frontend" / ".env"


def _load_env():
    if FRONTEND_ENV.exists():
        load_dotenv(dotenv_path=FRONTEND_ENV)

    if not os.environ.get("REACT_APP_BACKEND_URL"):
        raise RuntimeError(
            "REACT_APP_BACKEND_URL is required to run tests. Please set it in frontend/.env"
        )


_load_env()
