"""Accounts: password hashing, cookie sessions for the browser, bearer API tokens for CI."""
import hashlib
import hmac
import secrets

from fastapi import HTTPException, Request, Response

from . import db

COOKIE = "sl_session"
SESSION_DAYS = 30


def _sha(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${h.hex()}"


def check_password(pw: str, stored: str | None) -> bool:
    try:
        algo, salt, h = (stored or "").split("$")
        if algo != "scrypt":
            return False
        got = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(got.hex(), h)
    except ValueError:
        return False


def user_json(u):
    from .jobs import _iso
    return {"id": u["id"], "email": u["email"], "name": u["name"], "is_guest": bool(u["is_guest"]),
            "created_at": _iso(u["created_at"])}


def create_user(email=None, name="Guest", password=None, guest=False):
    uid = db.uid("u_")
    db.x("insert into users(id,email,name,pw_hash,is_guest,created_at) values(?,?,?,?,?,?)",
         (uid, email, name, hash_password(password) if password else None, 1 if guest else 0, db.now()))
    return db.one("select * from users where id=?", (uid,))


def start_session(response: Response, request: Request, user_id: str):
    token = secrets.token_urlsafe(32)
    db.x("insert into sessions(token_hash,user_id,created_at,expires_at) values(?,?,?,?)",
         (_sha(token), user_id, db.now(), db.now() + SESSION_DAYS * 86400))
    https = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
    response.set_cookie(COOKIE, token, max_age=SESSION_DAYS * 86400, httponly=True, samesite="lax", secure=https, path="/")


def end_session(response: Response, request: Request):
    token = request.cookies.get(COOKIE)
    if token:
        db.x("delete from sessions where token_hash=?", (_sha(token),))
    response.delete_cookie(COOKIE, path="/")


def optional_user(request: Request):
    """The signed-in user from a bearer API token or the session cookie, or None."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        tok = db.one("select * from api_tokens where token_hash=?", (_sha(auth[7:].strip()),))
        if not tok:
            raise HTTPException(401, "Invalid API token")
        db.x("update api_tokens set last_used_at=? where id=?", (db.now(), tok["id"]))
        return db.one("select * from users where id=?", (tok["user_id"],))
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    s = db.one("select * from sessions where token_hash=? and expires_at>?", (_sha(token), db.now()))
    return db.one("select * from users where id=?", (s["user_id"],)) if s else None


def current_user(request: Request):
    u = optional_user(request)
    if not u:
        raise HTTPException(401, "Not signed in")
    return u


def new_api_token():
    token = "sl_" + secrets.token_urlsafe(30)
    return token, _sha(token), token[:9] + "…"
