"""
Automated Security Scanner for Bottom Time.
Runs static analysis on the codebase to detect vulnerabilities,
hardcoded secrets, insecure patterns, and configuration issues.
"""
import os
import re
import glob
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from database import db
import logging

logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).parent
FRONTEND_DIR = ROOT_DIR.parent / "frontend"

SEVERITY_CRITICAL = "critical"
SEVERITY_HIGH = "high"
SEVERITY_MEDIUM = "medium"
SEVERITY_LOW = "low"
SEVERITY_INFO = "info"

# Patterns that indicate hardcoded secrets
SECRET_PATTERNS = [
    (r'(?:api[_-]?key|apikey)\s*[=:]\s*["\'][A-Za-z0-9_\-]{16,}["\']', "Hardcoded API key"),
    (r'(?:secret|password|passwd|pwd)\s*[=:]\s*["\'][^"\']{8,}["\']', "Hardcoded secret/password"),
    (r'(?:token)\s*[=:]\s*["\'][A-Za-z0-9_\-\.]{20,}["\']', "Hardcoded token"),
    (r'sk[_-](?:live|test)[_-][A-Za-z0-9]{20,}', "Stripe secret key"),
    (r'(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}', "GitHub token"),
    (r'AKIA[0-9A-Z]{16}', "AWS access key ID"),
    (r'-----BEGIN (?:RSA |EC )?PRIVATE KEY-----', "Private key in code"),
]

# Dangerous code patterns
DANGEROUS_PATTERNS = [
    (r'\beval\s*\(', "eval() usage - code injection risk", SEVERITY_CRITICAL),
    (r'\bexec\s*\(', "exec() usage - code injection risk", SEVERITY_CRITICAL),
    (r'subprocess\.(?:call|run|Popen)\s*\(.*shell\s*=\s*True', "Shell injection via subprocess", SEVERITY_CRITICAL),
    (r'os\.system\s*\(', "os.system() - command injection risk", SEVERITY_HIGH),
    (r'(?<![\w.])__import__\s*\(', "Dynamic import - potential code injection", SEVERITY_MEDIUM),
    (r'pickle\.loads?\s*\(', "Pickle deserialization - arbitrary code execution", SEVERITY_HIGH),
    (r'yaml\.load\s*\([^)]*\)', "Unsafe YAML load (use safe_load)", SEVERITY_HIGH),
    (r'\.format\s*\(.*request', "String format with request data - injection risk", SEVERITY_MEDIUM),
    (r'f["\'].*\{.*request\.', "F-string with request data - injection risk", SEVERITY_MEDIUM),
]

# MongoDB injection patterns
NOSQL_PATTERNS = [
    (r'\$where', "MongoDB $where operator - NoSQL injection risk", SEVERITY_HIGH),
    (r'\.find\(.*\$regex.*request', "Regex from user input - ReDoS risk", SEVERITY_MEDIUM),
]

# Files/dirs to skip during scanning
SKIP_DIRS = {"node_modules", "__pycache__", ".git", ".emergent", "archive", "test-results", "playwright"}
SKIP_FILES = {".pyc", ".pyo", ".whl", ".egg", ".lock", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".woff", ".woff2"}
SELF_FILES = {"security_scanner.py"}  # Exclude the scanner itself from pattern matching


def _should_scan(filepath: str) -> bool:
    """Check if file should be scanned."""
    parts = Path(filepath).parts
    if any(skip in parts for skip in SKIP_DIRS):
        return False
    name = Path(filepath).name
    if name in SELF_FILES:
        return False
    ext = Path(filepath).suffix
    if ext in SKIP_FILES:
        return False
    return ext in {".py", ".js", ".jsx", ".ts", ".tsx", ".json", ".env", ".yml", ".yaml", ".toml", ".cfg", ".ini"}


def _is_env_file(filepath: str) -> bool:
    return Path(filepath).name.startswith(".env")


def _is_test_file(filepath: str) -> bool:
    name = Path(filepath).name
    return name.startswith("test_") or name.endswith("_test.py") or "/tests/" in filepath


def scan_secrets(base_dirs: list[str]) -> list[dict]:
    """Scan for hardcoded secrets in code files (excluding .env files which are expected)."""
    findings = []
    for base in base_dirs:
        for filepath in glob.glob(f"{base}/**", recursive=True):
            if not os.path.isfile(filepath):
                continue
            if not _should_scan(filepath):
                continue
            if _is_env_file(filepath):
                continue
            if _is_test_file(filepath):
                continue

            try:
                with open(filepath, "r", errors="ignore") as f:
                    content = f.read()
            except Exception:
                continue

            rel = os.path.relpath(filepath, ROOT_DIR.parent)
            for pattern, desc in SECRET_PATTERNS:
                for match in re.finditer(pattern, content, re.IGNORECASE):
                    line_num = content[:match.start()].count("\n") + 1
                    matched = match.group()
                    # Skip if it's referencing an env var
                    line = content.split("\n")[line_num - 1] if line_num <= content.count("\n") + 1 else ""
                    if "environ" in line or "os.getenv" in line or "process.env" in line:
                        continue
                    # Skip known safe patterns
                    if "placeholder" in matched.lower() or "example" in matched.lower() or "change-in-production" in matched.lower():
                        continue
                    findings.append({
                        "type": "secret",
                        "severity": SEVERITY_CRITICAL,
                        "file": rel,
                        "line": line_num,
                        "description": desc,
                        "snippet": matched[:60] + "..." if len(matched) > 60 else matched,
                        "recommendation": "Move this value to an environment variable in .env"
                    })
    return findings


def scan_dangerous_patterns(base_dirs: list[str]) -> list[dict]:
    """Scan for dangerous code patterns."""
    findings = []
    for base in base_dirs:
        for filepath in glob.glob(f"{base}/**/*.py", recursive=True):
            if not _should_scan(filepath):
                continue
            if _is_test_file(filepath):
                continue

            try:
                with open(filepath, "r", errors="ignore") as f:
                    content = f.read()
            except Exception:
                continue

            rel = os.path.relpath(filepath, ROOT_DIR.parent)
            for pattern, desc, severity in DANGEROUS_PATTERNS + NOSQL_PATTERNS:
                for match in re.finditer(pattern, content):
                    line_num = content[:match.start()].count("\n") + 1
                    findings.append({
                        "type": "dangerous_pattern",
                        "severity": severity,
                        "file": rel,
                        "line": line_num,
                        "description": desc,
                        "snippet": match.group()[:80],
                        "recommendation": "Review and replace with a safer alternative"
                    })
    return findings


def scan_auth_coverage() -> list[dict]:
    """Check that all route handlers have authentication."""
    findings = []
    routes_dir = ROOT_DIR / "routes"
    PUBLIC_ROUTES = {
        "auth.py", "public.py", "waitlist.py",
    }
    PUBLIC_ENDPOINTS = {
        "/listings", "/destinations", "/products", "/events",
        "/shipping/rates", "/shipping/status", "/delivery-estimate",
        "/address/autocomplete", "/address/details", "/shipping/pincode-lookup",
        "/shipping/postcode/lookup", "/shipping/track/",
        "/delivery/estimate",
        # Public profile/content viewing
        "/{user_id}", "/dive/{dive_id}/comments", "/{log_id}",
        "/{log_id}/comments", "/user/{user_id}",
        "/reviews/{listing_id}",
        # UTM tracking (anonymous)
        "/utm/capture", "/utm/link-user",
        # Push config (public key only)
        "/push/vapid-key",
        # Marine life (iNaturalist - public database)
        "/marine-life/search", "/marine-life/autocomplete",
        "/marine-life/species/", "/marine-life/nearby",
        "/marine-life/trending", "/marine-life/dive-sites",
        # Dive planner (reference tables)
        "/dive-planner/ndl-table",
        # Species (public data)
        "/species/common", "/species/user/",
        "/bucket-list/user/",
        # Dive import (reference)
        "/supported-brands",
        # Operator listings (public browse)
        "/browse",
    }

    for filepath in routes_dir.glob("*.py"):
        if filepath.name.startswith("__"):
            continue
        if filepath.name in PUBLIC_ROUTES:
            continue

        try:
            with open(filepath, "r") as f:
                content = f.read()
        except Exception:
            continue

        rel = os.path.relpath(filepath, ROOT_DIR.parent)
        lines = content.split("\n")

        for i, line in enumerate(lines):
            route_match = re.match(r'@router\.(get|post|put|delete|patch)\s*\(\s*["\']([^"\']+)', line)
            if route_match:
                endpoint = route_match.group(2)
                if any(endpoint.startswith(pub) for pub in PUBLIC_ENDPOINTS):
                    continue

                # Look ahead for Depends(get_current_user)
                func_body = "\n".join(lines[i:i+10])
                if "get_current_user" not in func_body and "Depends" not in func_body:
                    findings.append({
                        "type": "auth_missing",
                        "severity": SEVERITY_HIGH,
                        "file": rel,
                        "line": i + 1,
                        "description": f"Endpoint {endpoint} may lack authentication",
                        "snippet": line.strip(),
                        "recommendation": "Add Depends(get_current_user) to require authentication"
                    })
    return findings


def scan_env_security() -> list[dict]:
    """Check environment configuration security."""
    findings = []
    env_path = ROOT_DIR / ".env"

    if not env_path.exists():
        findings.append({
            "type": "config",
            "severity": SEVERITY_CRITICAL,
            "file": "backend/.env",
            "line": 0,
            "description": "Backend .env file missing",
            "snippet": "",
            "recommendation": "Create .env with required environment variables"
        })
        return findings

    try:
        with open(env_path, "r") as f:
            content = f.read()
    except Exception:
        return findings

    lines = content.split("\n")
    for i, line in enumerate(lines):
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        key_match = re.match(r'^([A-Z_]+)\s*=\s*(.*)$', line)
        if not key_match:
            continue

        key, value = key_match.group(1), key_match.group(2).strip('"').strip("'")

        # Check for placeholder values
        if "placeholder" in value.lower() and key in ("RAZORPAY_WEBHOOK_SECRET", "WISE_API_TOKEN"):
            findings.append({
                "type": "config",
                "severity": SEVERITY_MEDIUM,
                "file": "backend/.env",
                "line": i + 1,
                "description": f"{key} has placeholder value — not production-ready",
                "snippet": f"{key}=placeholder...",
                "recommendation": f"Set a real value for {key} before production deployment"
            })

        # Check for wildcard CORS
        if key == "CORS_ORIGINS" and value == "*":
            findings.append({
                "type": "config",
                "severity": SEVERITY_HIGH,
                "file": "backend/.env",
                "line": i + 1,
                "description": "CORS_ORIGINS is set to wildcard (*) — allows any origin",
                "snippet": "CORS_ORIGINS=*",
                "recommendation": "Restrict to specific domains: CORS_ORIGINS=https://yourdomain.com"
            })

        # Check for weak JWT secret
        if key == "JWT_SECRET_KEY" and len(value) < 32:
            findings.append({
                "type": "config",
                "severity": SEVERITY_HIGH,
                "file": "backend/.env",
                "line": i + 1,
                "description": "JWT secret key is too short (< 32 characters)",
                "snippet": f"{key}=****",
                "recommendation": "Use a cryptographically random string of at least 64 characters"
            })

    return findings


def scan_mongodb_security(base_dirs: list[str]) -> list[dict]:
    """Check for MongoDB _id leaks and injection patterns."""
    findings = []
    for base in base_dirs:
        for filepath in glob.glob(f"{base}/**/*.py", recursive=True):
            if not _should_scan(filepath) or _is_test_file(filepath):
                continue

            try:
                with open(filepath, "r", errors="ignore") as f:
                    content = f.read()
            except Exception:
                continue

            rel = os.path.relpath(filepath, ROOT_DIR.parent)
            lines = content.split("\n")

            for i, line in enumerate(lines):
                # Check for find_one without _id exclusion that returns directly
                if "find_one(" in line and '{"_id": 0}' not in line and '"_id": 0' not in line and "{'_id': 0}" not in line:
                    # Check if it's in a projection
                    if "find_one({" in line and ", {" not in line:
                        findings.append({
                            "type": "mongodb",
                            "severity": SEVERITY_LOW,
                            "file": rel,
                            "line": i + 1,
                            "description": "find_one() without _id exclusion — may leak ObjectId",
                            "snippet": line.strip()[:80],
                            "recommendation": "Add {'_id': 0} projection or exclude _id from response"
                        })

    return findings


def scan_rate_limiting() -> list[dict]:
    """Check that auth-sensitive endpoints have rate limiting."""
    findings = []
    auth_file = ROOT_DIR / "routes" / "auth.py"

    if not auth_file.exists():
        return findings

    try:
        with open(auth_file, "r") as f:
            content = f.read()
    except Exception:
        return findings

    lines = content.split("\n")
    for i, line in enumerate(lines):
        route_match = re.match(r'@router\.(post)\s*\(\s*["\']([^"\']+)', line)
        if route_match:
            endpoint = route_match.group(2)
            # Check surrounding lines (above and below) for @limiter.limit
            context = "\n".join(lines[max(0, i-3):min(len(lines), i+4)])
            if "limiter.limit" not in context:
                findings.append({
                    "type": "rate_limit",
                    "severity": SEVERITY_HIGH,
                    "file": "backend/routes/auth.py",
                    "line": i + 1,
                    "description": f"Auth endpoint {endpoint} missing rate limiting",
                    "snippet": line.strip(),
                    "recommendation": "Add @limiter.limit() decorator"
                })

    return findings


def scan_dependency_vulnerabilities() -> list[dict]:
    """Check Python dependencies for known vulnerabilities using pip-audit."""
    findings = []
    try:
        result = subprocess.run(
            ["pip-audit", "--format=json", "--desc=on"],
            capture_output=True, text=True, timeout=120, cwd=str(ROOT_DIR)
        )
        if result.returncode != 0 and result.stdout:
            data = json.loads(result.stdout)
            for dep in data.get("dependencies", []):
                for vuln in dep.get("vulns", []):
                    findings.append({
                        "type": "dependency",
                        "severity": SEVERITY_HIGH if "HIGH" in vuln.get("id", "").upper() else SEVERITY_MEDIUM,
                        "file": "backend/requirements.txt",
                        "line": 0,
                        "description": f"{dep['name']}=={dep['version']}: {vuln.get('id', 'CVE')} — {vuln.get('description', '')[:120]}",
                        "snippet": f"{dep['name']}=={dep['version']}",
                        "recommendation": f"Upgrade to {vuln.get('fix_versions', ['latest'])[0] if vuln.get('fix_versions') else 'latest version'}"
                    })
    except FileNotFoundError:
        findings.append({
            "type": "dependency",
            "severity": SEVERITY_INFO,
            "file": "",
            "line": 0,
            "description": "pip-audit not installed — dependency scanning unavailable",
            "snippet": "",
            "recommendation": "Install pip-audit: pip install pip-audit"
        })
    except subprocess.TimeoutExpired:
        findings.append({
            "type": "dependency",
            "severity": SEVERITY_INFO,
            "file": "",
            "line": 0,
            "description": "pip-audit timed out",
            "snippet": "",
            "recommendation": "Run pip-audit manually"
        })
    except Exception as e:
        logger.warning(f"Dependency scan error: {e}")

    return findings


def scan_frontend_security() -> list[dict]:
    """Scan frontend for security issues."""
    findings = []
    src_dir = FRONTEND_DIR / "src"

    if not src_dir.exists():
        return findings

    for filepath in glob.glob(f"{src_dir}/**/*.js", recursive=True):
        if not _should_scan(filepath):
            continue

        try:
            with open(filepath, "r", errors="ignore") as f:
                content = f.read()
        except Exception:
            continue

        rel = os.path.relpath(filepath, ROOT_DIR.parent)
        lines = content.split("\n")

        for i, line in enumerate(lines):
            # Check for dangerouslySetInnerHTML
            if "dangerouslySetInnerHTML" in line:
                findings.append({
                    "type": "xss",
                    "severity": SEVERITY_HIGH,
                    "file": rel,
                    "line": i + 1,
                    "description": "dangerouslySetInnerHTML — XSS risk if content is user-supplied",
                    "snippet": line.strip()[:80],
                    "recommendation": "Sanitize HTML with DOMPurify or use safe rendering"
                })

            # Check for localStorage with sensitive data
            if re.search(r'localStorage\.setItem\s*\(\s*["\'](?:token|password|secret|key)', line, re.IGNORECASE):
                findings.append({
                    "type": "storage",
                    "severity": SEVERITY_MEDIUM,
                    "file": rel,
                    "line": i + 1,
                    "description": "Sensitive data stored in localStorage — vulnerable to XSS",
                    "snippet": line.strip()[:80],
                    "recommendation": "Use httpOnly cookies for tokens, or encrypt before storing"
                })

    return findings


def scan_file_upload_security() -> list[dict]:
    """Check file upload handling for security issues."""
    findings = []
    for filepath in glob.glob(f"{ROOT_DIR}/**/*.py", recursive=True):
        if not _should_scan(filepath) or _is_test_file(filepath):
            continue

        try:
            with open(filepath, "r", errors="ignore") as f:
                content = f.read()
        except Exception:
            continue

        rel = os.path.relpath(filepath, ROOT_DIR.parent)
        if "UploadFile" in content or "File(" in content:
            if "content_type" not in content:
                findings.append({
                    "type": "upload",
                    "severity": SEVERITY_MEDIUM,
                    "file": rel,
                    "line": 0,
                    "description": "File upload without content-type validation",
                    "snippet": "",
                    "recommendation": "Validate file content_type against an allowlist"
                })
            if "max" not in content.lower() and "5 * 1024" not in content:
                findings.append({
                    "type": "upload",
                    "severity": SEVERITY_MEDIUM,
                    "file": rel,
                    "line": 0,
                    "description": "File upload without size limit",
                    "snippet": "",
                    "recommendation": "Add file size check: if len(contents) > MAX_SIZE"
                })

    return findings


async def run_full_scan(save_to_db: bool = True) -> dict:
    """Run all security scans and return results."""
    scan_id = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    started = datetime.now(timezone.utc)

    backend_dir = str(ROOT_DIR)
    frontend_src = str(FRONTEND_DIR / "src") if (FRONTEND_DIR / "src").exists() else None
    scan_dirs = [backend_dir]
    if frontend_src:
        scan_dirs.append(frontend_src)

    all_findings = []
    scan_results = {}

    # 1. Secret Detection
    secrets = scan_secrets(scan_dirs)
    all_findings.extend(secrets)
    scan_results["secrets"] = {"count": len(secrets), "status": "clean" if not secrets else "findings"}

    # 2. Dangerous Code Patterns
    patterns = scan_dangerous_patterns(scan_dirs)
    all_findings.extend(patterns)
    scan_results["dangerous_patterns"] = {"count": len(patterns), "status": "clean" if not patterns else "findings"}

    # 3. Auth Coverage
    auth = scan_auth_coverage()
    all_findings.extend(auth)
    scan_results["auth_coverage"] = {"count": len(auth), "status": "clean" if not auth else "findings"}

    # 4. Environment Config
    env = scan_env_security()
    all_findings.extend(env)
    scan_results["env_config"] = {"count": len(env), "status": "clean" if not env else "findings"}

    # 5. MongoDB Security
    mongo = scan_mongodb_security(scan_dirs)
    all_findings.extend(mongo)
    scan_results["mongodb"] = {"count": len(mongo), "status": "clean" if not mongo else "findings"}

    # 6. Rate Limiting
    rate = scan_rate_limiting()
    all_findings.extend(rate)
    scan_results["rate_limiting"] = {"count": len(rate), "status": "clean" if not rate else "findings"}

    # 7. Dependency Vulnerabilities
    deps = scan_dependency_vulnerabilities()
    all_findings.extend(deps)
    scan_results["dependencies"] = {"count": len(deps), "status": "clean" if not deps else "findings"}

    # 8. Frontend Security
    frontend = scan_frontend_security()
    all_findings.extend(frontend)
    scan_results["frontend"] = {"count": len(frontend), "status": "clean" if not frontend else "findings"}

    # 9. File Upload Security
    upload = scan_file_upload_security()
    all_findings.extend(upload)
    scan_results["file_uploads"] = {"count": len(upload), "status": "clean" if not upload else "findings"}

    finished = datetime.now(timezone.utc)
    duration_ms = int((finished - started).total_seconds() * 1000)

    # Severity counts
    severity_counts = {}
    for f in all_findings:
        sev = f["severity"]
        severity_counts[sev] = severity_counts.get(sev, 0) + 1

    total_checks = len(scan_results)
    clean_checks = sum(1 for v in scan_results.values() if v["status"] == "clean")

    report = {
        "scan_id": scan_id,
        "started_at": started.isoformat(),
        "finished_at": finished.isoformat(),
        "duration_ms": duration_ms,
        "total_findings": len(all_findings),
        "severity_counts": severity_counts,
        "checks_passed": clean_checks,
        "checks_total": total_checks,
        "score": round(clean_checks / total_checks * 100) if total_checks else 0,
        "scan_results": scan_results,
        "findings": all_findings,
    }

    if save_to_db:
        await db.security_scans.insert_one({
            **{k: v for k, v in report.items() if k != "findings"},
            "findings_count": len(all_findings),
        })
        # Store findings separately to avoid document size issues
        if all_findings:
            await db.security_findings.delete_many({"scan_id": scan_id})
            for f in all_findings:
                f["scan_id"] = scan_id
            await db.security_findings.insert_many([{**f} for f in all_findings])

    return report
