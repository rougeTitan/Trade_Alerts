"""
Cognito JWT verification for Trade Alerts.
Supports ID tokens from the mobile app. Loads JWKS once and caches it.
"""

import os
from functools import wraps
from typing import Dict, Optional

import jwt
from jwt import PyJWKClient

COGNITO_REGION = os.environ.get("COGNITO_REGION", "")
COGNITO_POOL_ID = os.environ.get("COGNITO_POOL_ID", "")
COGNITO_CLIENT_ID = os.environ.get("COGNITO_CLIENT_ID", "")

_jwks_client = None


def _issuer():
    return f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_POOL_ID}"


def _get_jwks_client():
    global _jwks_client
    if _jwks_client is not None:
        return _jwks_client
    if not COGNITO_REGION or not COGNITO_POOL_ID:
        raise RuntimeError("COGNITO_REGION and COGNITO_POOL_ID must be set")
    _jwks_client = PyJWKClient(f"{_issuer()}/.well-known/jwks.json")
    return _jwks_client


def verify_token(token: str) -> Dict:
    """Verify a Cognito ID token. Returns token claims."""
    if not COGNITO_REGION or not COGNITO_POOL_ID:
        raise RuntimeError("Cognito is not configured")

    jwks_client = _get_jwks_client()
    signing_key = jwks_client.get_signing_key_from_jwt(token)
    claims = jwt.decode(
        token,
        signing_key.key,
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
            token = request.headers.get("X-Id-Token", "")
            if not token:
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
