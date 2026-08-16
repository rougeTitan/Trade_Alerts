"""
Cognito JWT verification for Trade Alerts.
Supports ID tokens from the mobile app. Loads JWKS once and caches it.
"""

import os
import json
import base64
import urllib.request
from functools import wraps
from typing import Dict, Optional

import jwt

COGNITO_REGION = os.environ.get("COGNITO_REGION", "")
COGNITO_POOL_ID = os.environ.get("COGNITO_POOL_ID", "")
COGNITO_CLIENT_ID = os.environ.get("COGNITO_CLIENT_ID", "")

_jwks_cache = None


def _issuer():
    return f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_POOL_ID}"


def _get_jwks():
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache
    if not COGNITO_REGION or not COGNITO_POOL_ID:
        raise RuntimeError("COGNITO_REGION and COGNITO_POOL_ID must be set")
    url = f"{_issuer()}/.well-known/jwks.json"
    with urllib.request.urlopen(url, timeout=10) as resp:
        _jwks_cache = json.loads(resp.read())
    return _jwks_cache


def _get_public_key(token: str):
    jwks = _get_jwks()
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    raise jwt.InvalidTokenError("Signing key not found")


def verify_token(token: str) -> Dict:
    """Verify a Cognito ID token. Returns token claims."""
    if not COGNITO_REGION or not COGNITO_POOL_ID:
        raise RuntimeError("Cognito is not configured")

    key = _get_public_key(token)
    claims = jwt.decode(
        token,
        key,
        algorithms=["RS256"],
        issuer=_issuer(),
        audience=COGNITO_CLIENT_ID,
        options={"require": ["exp", "iss", "sub"]},
    )
    return claims


def get_user_from_token(token: str) -> Optional[Dict]:
    """Return {user_id, email, name} from token, or None if invalid."""
    try:
        claims = verify_token(token)
    except Exception:
        return None
    return {
        "user_id": claims.get("sub"),
        "email": claims.get("email"),
        "name": claims.get("name") or claims.get("email", "").split("@")[0],
    }


# -----------------------------------------------------------------------------
# Flask integration
# -----------------------------------------------------------------------------
try:
    from flask import request, g, abort, jsonify, make_response
    _FLASK = True
except ImportError:
    _FLASK = False


if _FLASK:
    def require_auth(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            auth_header = request.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer "):
                return make_response(jsonify({"error": "missing token"}), 401)
            token = auth_header.split(" ", 1)[1]
            try:
                user = get_user_from_token(token)
            except Exception as e:
                return make_response(jsonify({"error": f"invalid token: {e}"}), 401)
            if not user:
                return make_response(jsonify({"error": "invalid token"}), 401)
            g.user = user
            g.user_id = user["user_id"]
            # Ensure profile exists in DynamoDB on first login.
            if os.environ.get("DYNAMODB_TABLE"):
                try:
                    import db as _db
                    if not _db.get_profile(g.user_id):
                        _db.ensure_profile(g.user_id, user["email"], user.get("name"))
                except Exception:
                    pass
            return f(*args, **kwargs)
        return wrapper
