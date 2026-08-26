# instagram-live-stream-recorder Workaround

**Workaround for Instagram user-information failures caused by the `ig_business_category_subvertical` HTTP 400 error.**

## Problem

The original recorder uses Instagram's internal user-information endpoint:

```text
https://i.instagram.com/api/v1/users/web_profile_info/?username=<USERNAME>
```

Instagram may return:

```text
400

{
    "message": "Asset asset://laser.provider/ig_business_category_subvertical has been deleted. You cannot use this schema",
    "status": "fail"
}
```

This can result in errors such as:

```text
FetchError: maximum redirect reached
```

or:

```text
TypeError: Cannot read properties of undefined (reading 'user')
```

because the recorder does not receive the expected user object.

## Workaround

The patched `NodeInstaRequests.js` avoids relying on the failing `web_profile_info` request.

It first attempts a username-based user-information request and then falls back to:

```text
/api/v1/feed/user/<USERNAME>/username/?count=1
```

The returned information is normalized to the structure expected by `LiveVideoRecorder.js`:

```text
userInfo.data.user.id
```

`LiveVideoRecorder.js` itself continues to use that existing structure.

## Files

Replace the corresponding files in the original project's `src` directory:

- `NodeInstaRequests.js`
- `LiveVideoRecorder.js`

**Do not add a new `NodeInstaRequests.js` file if your installation already contains it. The original project does contain `src/NodeInstaRequests.js`.**

## Installation

1. Make a backup of your original project.
2. Replace `src/NodeInstaRequests.js` with the patched version.
3. Replace `src/LiveVideoRecorder.js` with the patched version.
4. Run `npm install` if necessary.
5. Run the recorder normally.

Example:

```text
node record.js -u your_username --get-full --verbose
```

## Important

**This is an unofficial compatibility workaround for an Instagram-side API change.**

Instagram's internal APIs may change again without notice.

## Security

**Never publish your Instagram password, `sessionid`, `csrftoken`, authentication tokens, or private cookies.**

## Original project

[instagram-live-stream-recorder](https://github.com/vadimb88/instagram-live-stream-recorder)

The original repository contains `src/LiveVideoRecorder.js` and `src/NodeInstaRequests.js`.
