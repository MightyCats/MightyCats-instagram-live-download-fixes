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

def _extract_user_from_feed(data, username):
    """Extract the user object from Instagram's username-feed response.

    Instagram's web_profile_info endpoint currently returns HTTP 400 for
    some professional/business accounts.  The username-feed endpoint does
    not require that broken profile resolver and normally includes the user
    object on its media items.
    """
    if not isinstance(data, dict):
        return None

    # Prefer a top-level user if Instagram provides one.
    user = data.get("user")
    if isinstance(user, dict) and (user.get("id") or user.get("pk")):
        return user

    for item in data.get("items", []):
        if not isinstance(item, dict):
            continue
        user = item.get("user")
        if isinstance(user, dict) and (user.get("id") or user.get("pk")):
            item_username = user.get("username")
            if not item_username or item_username.lower() == username.lower():
                return user

    return None


def _get_user_info_from_username_feed(username):
    """Resolve a username without using web_profile_info.

    This is the primary workaround for the 2026 Instagram
    ig_business_category_subvertical HTTP 400 error.
    """
    response = globals.session.session.get(
        Constants.USER_FEED_BY_USERNAME.format(username),
        params={"count": 1},
        timeout=5
    )
    if response.status_code != 200:
        return {}

    try:
        data = response.json()
    except (ValueError, json.JSONDecodeError):
        return {}

    user = _extract_user_from_feed(data, username)
    if not user:
        return {}

    # Keep the same structure expected by the existing PyInstaLive code:
    # data.user.id / data.user.username / etc.
    return {"data": {"user": user}}


def get_user_info():
    username = globals.download.download_user

    # IMPORTANT:
    # Do not call web_profile_info first.  Instagram currently returns
    # HTTP 400 for some professional/business accounts with:
    # "Asset asset://laser.provider/ig_business_category_subvertical
    #  has been deleted. You cannot use this schema"
    #
    # The username-feed endpoint bypasses that broken profile resolver.
    info = _get_user_info_from_username_feed(username)
    if info:
        return info

    # Fallback for accounts where the username-feed response does not
    # contain a user object (for example an account with no feed items).
    response = globals.session.session.get(
        Constants.USER_INFO.format(username), timeout=5
    )
    if response.status_code == 200:
        try:
            return response.json()
        except (ValueError, json.JSONDecodeError):
            pass

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