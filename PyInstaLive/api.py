from datetime import datetime
import json

from . import helpers
from . import globals
from .constants import Constants

def get_csrf_token():
    response = globals.session.session.get(Constants.LOGIN_PAGE)
    return helpers.get_shared_data(response.text).get("csrf_token", None)

def do_login():
    now_epoch = int(datetime.now().timestamp())
    login_data = {
    "username": globals.session.username,
    "enc_password": f"#PWD_INSTAGRAM_BROWSER:0:{now_epoch}:{globals.session.password}",
    "queryParams": {},
    "optIntoOneTap": "false"
    }
    response = globals.session.session.post(Constants.LOGIN_AJAX, data=login_data, timeout=5)
    return json.loads(response.text)

def get_login_state():
    response = globals.session.session.get(Constants.BASE_WEB, timeout=5)
    return helpers.get_shared_data(response.text)

def _normalize_user(user, username=None):
    if not isinstance(user, dict):
        return None
    user_id = user.get("pk") or user.get("id") or user.get("user_id")
    if not user_id:
        return None
    if username:
        u = user.get("username")
        if not u or u.lower() != username.lower():
            return None
    user = dict(user)
    user["id"] = str(user_id)
    user["pk"] = user_id
    return user


def _find_user_in_payload(value, username):
    """Find a user object in current/legacy Instagram response envelopes."""
    if isinstance(value, dict):
        candidate = _normalize_user(value, username)
        if candidate:
            return candidate
        for key, child in value.items():
            found = _find_user_in_payload(child, username)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = _find_user_in_payload(child, username)
            if found:
                return found
    return None


def _request(method, url, **kwargs):
    try:
        return getattr(globals.session.session, method)(url, timeout=8, **kwargs)
    except Exception:
        return None


def _parse_json(response):
    if response is None:
        return None
    try:
        return response.json()
    except Exception:
        return None


def _mobile_request_headers():
    """Build headers that match Instagram's mobile app API rather than the web browser."""
    import hashlib
    import uuid

    headers = dict(getattr(Constants, "MOBILE_HEADERS", {}) or {})
    username = str(getattr(globals.session, "username", "pyinstalive"))
    device_seed = hashlib.md5(username.encode("utf-8")).hexdigest()
    headers["X-IG-Android-ID"] = "android-" + device_seed[:16]
    headers["X-IG-Device-ID"] = str(uuid.uuid5(uuid.NAMESPACE_DNS, "pyinstalive-device:" + username))
    headers["X-IG-App-Locale"] = "en_US"
    headers["X-IG-Device-Locale"] = "en_US"
    headers["X-IG-Mapped-Locale"] = "en_US"
    headers["X-IG-Timezone-Offset"] = "0"

    try:
        cookies = globals.session.session.cookies.get_dict()
        ds_user_id = cookies.get("ds_user_id")
        if ds_user_id:
            headers["IG-U-DS-USER-ID"] = str(ds_user_id)
            headers["IG-INTENDED-USER-ID"] = str(ds_user_id)
    except Exception:
        pass
    return headers


def _web_request_headers():
    headers = dict(getattr(Constants, "BASE_HEADERS", {}) or {})
    headers.setdefault("Referer", Constants.BASE_WEB)
    headers.setdefault("Accept", "*/*")
    return headers


def _get_user_info_from_search(username):
    """Resolve an exact username using the mobile users/search endpoint."""
    import time
    params = {
        "timezone_offset": "0",
        "q": username,
        "count": 30,
    }
    response = _request(
        "get",
        Constants.USER_SEARCH,
        params=params,
        headers=_mobile_request_headers(),
    )
    if response is None:
        return {}
    data = _parse_json(response)
    if not isinstance(data, dict) or data.get("status") == "fail":
        return {}
    users = data.get("users", [])
    if not isinstance(users, list):
        return {}
    wanted = username.casefold()
    for user in users:
        if not isinstance(user, dict):
            continue
        candidate_name = user.get("username")
        if isinstance(candidate_name, str) and candidate_name.casefold() == wanted:
            normalized = _normalize_user(user)
            if normalized:
                print(f"[D] user_search: exact username matched, id={normalized.get('id')}") if DEBUG_USER_LOOKUP else None
                return {"data": {"user": normalized}}
    return {}


def _get_user_info_from_usernameinfo(username):
    """Resolve a username using Instagram's mobile usernameinfo endpoint."""
    response = _request(
        "get",
        Constants.USERNAME_INFO.format(username),
        headers=_mobile_request_headers(),
    )
    if response is None or response.status_code != 200:
        return {}
    data = _parse_json(response)
    if data is None:
        return {}
    user = _find_user_in_payload(data, username)
    if user:
        return {"data": {"user": user}}
    return {}


def _get_user_info_from_username_feed(username):
    """Resolve a username through the web feed/user/username endpoint."""
    response = _request(
        "get",
        Constants.USER_FEED_BY_USERNAME.format(username),
        params={"count": 1},
        headers=_web_request_headers(),
    )
    if response is None or response.status_code != 200:
        return {}
    data = _parse_json(response)
    if data is None:
        return {}
    user = _find_user_in_payload(data, username)
    if user:
        return {"data": {"user": user}}
    return {}


def _get_user_info_from_username_stream(username):
    """Resolve a username using Instagram's mobile profile stream resolver."""
    response = _request(
        "get",
        Constants.USERNAME_INFO_STREAM.format(username),
        headers=_mobile_request_headers(),
    )
    if response is None or response.status_code != 200:
        return {}
    data = _parse_json(response)
    if data is None:
        return {}
    user = _find_user_in_payload(data, username)
    if user:
        return {"data": {"user": user}}
    return {}


def _get_user_info_from_profile_page(username):
    """Resolve user ID from the authenticated Instagram profile HTML."""
    import re
    url = Constants.BASE_WEB + username.strip('/') + "/"
    headers = _web_request_headers()
    headers.update({
        "X-Requested-With": "XMLHttpRequest",
        "X-Asbd-Id": "359341",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Dest": "document",
    })
    response = _request("get", url, headers=headers)
    if response is None or response.status_code != 200:
        return {}
    text = response.text or ""
    # Instagram has used several serialized representations over time.
    patterns = [
        r'"profilePage_(\d+)"',
        r'"user_id"\s*:\s*"?(\d+)"?',
        r'"pk"\s*:\s*"?(\d+)"?[^{}]{0,500}?"username"\s*:\s*"' + re.escape(username) + r'"',
        r'"id"\s*:\s*"?(\d+)"?[^{}]{0,500}?"username"\s*:\s*"' + re.escape(username) + r'"',
    ]
    for pattern in patterns:
        m = re.search(pattern, text, flags=re.I)
        if m:
            user_id = m.group(1)
            return {"data": {"user": {"id": str(user_id), "pk": int(user_id), "username": username}}}
    return {}

def get_user_info():
    username = globals.download.download_user

    for resolver in (
        _get_user_info_from_username_feed,
        _get_user_info_from_profile_page,
        _get_user_info_from_search,
        _get_user_info_from_usernameinfo,
        _get_user_info_from_username_stream,
    ):
        info = resolver(username)
        if info:
            return info
    return {}

def get_reels_tray():
    response = globals.session.session.get(Constants.REELS_TRAY, timeout=5)
    return json.loads(response.text)

def get_single_live():
    response = globals.session.session.get(Constants.LIVE_STATE_USER.format(globals.download.download_user_id), timeout=5)
    return json.loads(response.text)

def get_comments():
    response = globals.session.session.get(Constants.LIVE_COMMENT.format(globals.download.livestream_object_init.get('id'), str(globals.comments.comments_last_ts)), timeout=5)
    return json.loads(response.text)

def get_stream_data():
    response = globals.session.session.get(Constants.LIVE_STATE_USER.format(globals.download.download_user_id), timeout=5)
    return json.loads(response.text)

def do_heartbeat():
    response = globals.session.session.post(Constants.LIVE_HEARTBEAT.format(globals.download.livestream_object_init.get('id')), timeout=5)
    return json.loads(response.text)