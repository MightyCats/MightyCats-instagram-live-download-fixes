# PyInstaLive Workaround

**Workaround for the Instagram HTTP 400 error involving `ig_business_category_subvertical`.**

## Problem

Some Instagram accounts may cause the following request to fail:

```text
/api/v1/users/web_profile_info/?username=<USERNAME>
```

with:

```text
400

{
    "message": "Asset asset://laser.provider/ig_business_category_subvertical has been deleted. You cannot use this schema",
    "status": "fail"
}
```

This can cause PyInstaLive to report that the specified user does not exist even though the account is available.

## Workaround

The patched version changes the user-information lookup in `api.py`.

Instead of calling `web_profile_info` first, it first uses:

```text
/api/v1/feed/user/<USERNAME>/username/?count=1
```

The user object returned by the username-feed response is converted to the structure expected by the existing PyInstaLive code:

```text
{
    "data": {
        "user": ...
    }
}
```

If the username-feed response does not contain a usable user object, the original `web_profile_info` request is retained as a fallback.

## Files

Replace the corresponding files in the PyInstaLive `pyinstalive` package with:

- `api.py`
- `constants.py`

`PATCH_20260822.txt` describes the changes.

## Installation

1. Make a backup of your existing PyInstaLive installation.
2. Replace the original `pyinstalive/api.py` with the patched `api.py`.
3. Replace the original `pyinstalive/constants.py` with the patched `constants.py`.
4. Run PyInstaLive normally.

## Notes

**This is an unofficial compatibility workaround for an Instagram-side API change.**

It does not repair Instagram's server-side schema. If Instagram changes the username-feed endpoint or its response format, this workaround may need to be updated.

## Security

**Never publish your Instagram password, `sessionid`, `csrftoken`, authentication tokens, or private cookies.**

## Original project

[PyInstaLive](https://github.com/dvingerh/PyInstaLive)

The original project currently states that active development has ended. This repository is intended to help users who encounter the described API problem.
