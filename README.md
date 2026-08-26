# Instalive Downloader Fixes
Community workarounds for Instagram user information API errors affecting PyInstaLive and instagram-live-stream-recorder.

## ⚠️ Important Notice
If you are seeing the following error when trying to retrieve an Instagram user's information, this repository may help:
```text
400

{
    "message": "Asset asset://laser.provider/ig_business_category_subvertical has been deleted. You cannot use this schema",
    "status": "fail"
}
```
This problem appears to be caused by an Instagram-side change to an internal/private API, rather than an incorrect username or necessarily invalid authentication information.

## Affected Projects
This repository provides workarounds for the following projects:

[PyInstaLive](https://github.com/samuelchristlie/PyInstaLive/)

[instagram-live-stream-recorder](https://github.com/vadimb88/instagram-live-stream-recorder)

Both projects use Instagram's internal/private APIs to retrieve user information and live-stream information.

## Problem
In August 2026, some Instagram users could no longer be detected by these applications.
The following Instagram endpoint may return HTTP 400:
```text
/api/v1/users/web_profile_info/?username=<USERNAME>
```
with the following error:
```text
Asset asset://laser.provider/ig_business_category_subvertical
has been deleted. You cannot use this schema
```
The relevant internal schema is:
```text
ig_business_category_subvertical
```
As a result, applications that depend on this endpoint may fail to retrieve the target user's information.
For example, the application may report:
```text
The specified user does not exist
```
even though the Instagram account actually exists and can be viewed normally.

## Cause
The problem appears to be caused by an Instagram-side change or removal of an internal schema used by the `web_profile_info` endpoint.
The affected request is:
```text
/api/v1/users/web_profile_info/?username=<USERNAME>
```
The error:
```text
Asset asset://laser.provider/ig_business_category_subvertical
has been deleted. You cannot use this schema
```
indicates that Instagram's server is rejecting the request because the internal schema is no longer available.
This does not necessarily mean that the Instagram username is incorrect or that the account has been deleted.

## Workaround
The workaround is to avoid relying on the affected `web_profile_info` endpoint when retrieving the Instagram user's ID.
Instead, the modified versions use an alternative username-based method to retrieve the user information.
The general process is:
```text
Instagram username
        ↓
Username-based user information request
        ↓
Instagram user ID
        ↓
Live-stream information request
        ↓
Live-stream URL
        ↓
Download / Recording
```
The returned user information is then converted into the structure expected by the existing application.
This allows the existing live-stream retrieval and download logic to continue working.

### PyInstaLive
The PyInstaLive workaround modifies the user-information retrieval process so that it does not depend on the failing `web_profile_info` endpoint.
Files
The modified PyInstaLive files are provided in:
```text
PyInstaLive/
```
See:
PyInstaLive workaround
The directory contains installation instructions and the modified files.

### instagram-live-stream-recorder
The `instagram-live-stream-recorder` workaround modifies the user-information retrieval process and normalizes the returned user information so that it remains compatible with the existing recorder code.
Files
The modified files are provided in:
```text
instagram-live-stream-recorder/
```
See:
instagram-live-stream-recorder workaround
The directory contains installation instructions and the modified files.

## Tested
The workarounds were tested successfully in August 2026.
The original versions produced the following error:
```text
400

Asset asset://laser.provider/ig_business_category_subvertical
has been deleted. You cannot use this schema
```
After applying the modifications:
```text
User information retrieved successfully
        ↓
User ID retrieved successfully
        ↓
Live-stream information retrieved successfully
        ↓
Live stream downloaded successfully
```
The modified versions were successfully able to download an Instagram live stream again.

## ⚠️ Security
NEVER publish or share your Instagram authentication information.
Do not include any of the following in an Issue, Pull Request, README, screenshot, or debug log:
Instagram password
`sessionid`
`csrftoken`
Authentication tokens
Private cookies
Private authorization headers
If you post a debug log, remove all authentication information before publishing it.

## ⚠️ Disclaimer
This repository is not affiliated with Instagram, Meta, PyInstaLive, or instagram-live-stream-recorder.
These are unofficial community workarounds for an Instagram-side API change.
Both PyInstaLive and instagram-live-stream-recorder rely on Instagram's internal/private APIs.
Instagram may change these APIs again at any time.
If Instagram changes the relevant endpoints or response formats, these workarounds may stop working and may need to be updated.

## Original Projects
The original projects are:

[PyInstaLive](https://github.com/samuelchristlie/PyInstaLive/)

[instagram-live-stream-recorder](https://github.com/vadimb88/instagram-live-stream-recorder)

Please refer to the original repositories for the original project source code and documentation.

## Version / Test Date
Workaround tested: August 22, 2026
README updated: August 26, 2026

## About This Repository
This repository was created to make the workaround available to other users who encounter the same Instagram error.
If the same `ig_business_category_subvertical` error appears in the future, please check this repository for an updated workaround.
