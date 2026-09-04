import fetch from 'node-fetch'

export default class NodeInstaRequests {
  constructor({ csrfToken, xmlParser, sessionId, agent, cookieString }) {
    this.csrfToken = csrfToken
    this.cookies = cookieString
    this.sessionId = sessionId
    this.xIgWWWClaim = '0'
    this.xmlParser = xmlParser
    this.xIgAppId = '936619743392459' // current web app id
    this.agent = agent
  }

  _handleHeaders(...headers) {
    for (const [header, value] of headers) {
      if (header.toLowerCase() === 'x-ig-set-www-claim') {
        this.xIgWWWClaim = value
      }
    }
  }

  _cookieHeader() {
    return this.cookies || `sessionid=${this.sessionId}; csrftoken=${this.csrfToken};`
  }

  _webHeaders(referer = 'https://www.instagram.com/') {
    return {
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'x-asbd-id': '198387',
      'x-csrftoken': this.csrfToken || '',
      'x-ig-app-id': this.xIgAppId,
      'x-ig-www-claim': this.xIgWWWClaim,
      cookie: this._cookieHeader(),
      'user-agent': this.agent,
      referer,
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-requested-with': 'XMLHttpRequest',
      origin: 'https://www.instagram.com',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin'
    }
  }

  _findUserInValue(value, username) {
    const wanted = String(username).toLowerCase()

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this._findUserInValue(item, username)
        if (found) return found
      }
      return null
    }

    if (!value || typeof value !== 'object') return null

    const userId = value.pk ?? value.id ?? value.user_id
    const userName = value.username
    if (userId && userName && String(userName).toLowerCase() === wanted) {
      return {
        ...value,
        id: String(userId),
        pk: value.pk ?? userId
      }
    }

    for (const child of Object.values(value)) {
      const found = this._findUserInValue(child, username)
      if (found) return found
    }
    return null
  }

  _extractUserFromProfileHtml(html, username) {
    const wanted = String(username).toLowerCase()

    // Current Instagram profile pages contain serialized user data in several
    // slightly different forms. Prefer a username/id pair so that we don't
    // accidentally return an unrelated numeric ID from the page.
    const pairPatterns = [
      new RegExp(`"username"\\s*:\\s*"${this._escapeRegExp(username)}"[\\s\\S]{0,2500}?"(?:pk|id)"\\s*:\\s*"?(\\d+)"?`, 'i'),
      new RegExp(`"(?:pk|id)"\\s*:\\s*"?(\\d+)"?[\\s\\S]{0,2500}?"username"\\s*:\\s*"${this._escapeRegExp(username)}"`, 'i'),
      new RegExp(`"username"\\s*:\\s*"${this._escapeRegExp(username)}"[\\s\\S]{0,2500}?\\b(?:pk|id)\\b\\s*[:=]\\s*"?(\\d+)"?`, 'i')
    ]

    for (const pattern of pairPatterns) {
      const match = html.match(pattern)
      if (match) {
        return { id: match[1], pk: match[1], username }
      }
    }

    // Common legacy format: "profilePage_...":{"user":{"pk":"..."
    const legacy = html.match(new RegExp(
      `profilePage_[^<]{0,5000}?"user"\\s*:\\s*\\{[\\s\\S]{0,2000}?"(?:pk|id)"\\s*:\\s*"?(\\d+)"?[\\s\\S]{0,2000}?"username"\\s*:\\s*"${this._escapeRegExp(username)}"`,
      'i'
    ))
    if (legacy) {
      return { id: legacy[1], pk: legacy[1], username }
    }

    return null
  }

  _escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  async _get(url, headers) {
    try {
      const response = await fetch(url, {
        headers,
        method: 'GET',
        agent: this.agent,
        // Keep redirects visible for Instagram API diagnostics. A redirect
        // loop here usually means the endpoint is soft-blocking the session.
        redirect: 'manual',
      })
      this._handleHeaders(...response.headers)
      const text = await response.text()
      return { response, text }
    } catch (error) {
      return { response: null, text: '', error }
    }
  }

  async getUsernameInfo(username) {
    if (!this.csrfToken) {
      throw new Error('Error: csrfToken is required for getUsernameInfo request')
    }

    this.username = username
    const profileUrl = `https://www.instagram.com/${encodeURIComponent(username)}/`
    const { response, text } = await this._get(profileUrl, this._webHeaders('https://www.instagram.com/'))

    if (response && response.ok) {
      const user = this._extractUserFromProfileHtml(text, username)
      if (user) {
        return {
          ok: true,
          status: response.status,
          json: { data: { user } }
        }
      }
    }

    // Do not use web_profile_info here. Instagram currently returns HTTP 400
    // for a number of Professional/Business accounts from that endpoint.
    return {
      ok: false,
      status: response ? response.status : 0,
      error: `Unable to resolve Instagram user from profile page: ${username}`
    }
  }

  async getStreamInfo(userId) {
    if (!this.csrfToken) {
      throw new Error('Error: csrfToken is required for getStreamInfo request')
    }
    if (!this.sessionId) {
      throw new Error('Error: sessionId is required for getStreamInfo request')
    }

    // Use the web API host with the existing browser session. The old source
    // used i.instagram.com here, which is now subject to mobile-client checks.
    const url = `https://www.instagram.com/api/v1/live/web_info/?target_user_id=${encodeURIComponent(userId)}`
    const { response, text, error } = await this._get(url, this._webHeaders('https://www.instagram.com/'))

    if (error) {
    }

    if (response) {
    }

    // A same-URL 302 is currently used by Instagram as a web-session
    // soft-block signal. Do not follow it indefinitely. Instead, fall back
    // to the already-working authenticated profile page and look for a
    // serialized live/broadcast object there.
    if (response && response.status === 302) {
      const location = response.headers.get('location') || ''
      const fallback = await this._getLiveFromMobileTray(userId)
      if (fallback) {
        return { ok: true, status: 200, json: fallback }
      }
      const profileFallback = await this._getProfileLiveData(userId)
      if (profileFallback) {
        return { ok: true, status: 200, json: profileFallback }
      }
      return {
        ok: false,
        status: response.status,
        error: location === url ? 'Instagram soft-blocked live/web_info (same-URL 302); no live data in profile page' : `HTTP ${response.status} redirect to ${location}`,
      }
    }

    if (!response || !response.ok) {
      return {
        ok: false,
        status: response ? response.status : 0,
        error: `HTTP ${response ? response.status : 0}`,
      }
    }

    let data
    try {
      data = JSON.parse(text)
    } catch (error) {
      return { ok: false, status: response.status, error: 'Invalid JSON from live/web_info' }
    }


    const stream = this._findStreamObject(data)
    if (!stream) {
      return { ok: false, status: response.status, json: data, error: data.message || 'No active livestream' }
    }


    return {
      ok: true,
      status: response.status,
      json: stream
    }
  }


  _mobileLiveHeaders(referer = 'https://www.instagram.com/') {
    return {
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': 'Instagram 237.0.0.14.102 Android (25/7.1.2; 320dpi; 720x1280; samsung; SM-G973N; aosp; android_x86; en_US; 373310563)',
      'x-ig-app-id': '567067343352427',
      'x-ig-www-claim': this.xIgWWWClaim || '0',
      'x-csrftoken': this.csrfToken || '',
      'x-requested-with': 'XMLHttpRequest',
      cookie: this._cookieHeader(),
      referer,
      origin: 'https://www.instagram.com',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site'
    }
  }

  async _getLiveFromMobileTray(userId) {
    // Current public tooling still uses this mobile live-tray endpoint to
    // discover active broadcasts. Unlike usernameinfo/web_info, it can return
    // broadcasts as a collection and therefore does not require the failing
    // web_profile_info schema.
    const urls = [
      'https://i.instagram.com/api/v1/live/reels_tray_broadcasts/',
      `https://i.instagram.com/api/v1/feed/user/${encodeURIComponent(userId)}/story/`
    ]

    for (const url of urls) {
      const headers = this._mobileLiveHeaders()
      const result = await this._get(url, headers)
      if (result.response) {
      }

      if (!result.response || !result.response.ok) continue

      let data
      try {
        data = JSON.parse(result.text)
      } catch (error) {
        continue
      }

      const stream = this._findStreamForUser(data, userId)
      if (stream) {
        return stream
      }
    }
    return null
  }

  _findStreamForUser(value, userId) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this._findStreamForUser(item, userId)
        if (found) return found
      }
      return null
    }
    if (!value || typeof value !== 'object') return null

    const owner = value.broadcast_owner || value.owner || value.user || {}
    const ownerId = owner?.pk ?? owner?.id ?? value.owner_id ?? value.user_id
    const broadcastId = value.broadcast_id ?? value.broadcastId ?? value.id
    const playback = value.dash_abr_playback_url || value.dash_playback_url || value.dash_live_predictive_playback_url

    if (playback && ownerId && String(ownerId) === String(userId)) {
      return {
        ...value,
        id: String(broadcastId || value.media_id || userId),
        broadcast_id: String(broadcastId || value.media_id || ''),
        media_id: value.media_id || String(broadcastId || ''),
        dash_abr_playback_url: playback,
        dash_playback_url: value.dash_playback_url || playback,
        broadcast_status: value.broadcast_status || 'active'
      }
    }

    for (const child of Object.values(value)) {
      const found = this._findStreamForUser(child, userId)
      if (found) return found
    }
    return null
  }

  async _getProfileLiveData(userId) {
    const username = this.username
    if (!username) {
      return null
    }

    const profileUrl = `https://www.instagram.com/${encodeURIComponent(username)}/`
    const liveUrl = `https://www.instagram.com/${encodeURIComponent(username)}/live/`

    // Check both the profile page and the dedicated /live/ page.  The latter
    // can contain broadcast metadata even when the normal live/web_info API
    // is returning a same-URL 302.
    const pages = [
      { name: 'profile', url: profileUrl, referer: 'https://www.instagram.com/' },
      { name: 'live', url: liveUrl, referer: profileUrl },
    ]

    const playbackPatterns = [
      /"dash_abr_playback_url"\s*:\s*"([^"\\]+)"/gi,
      /"dash_playback_url"\s*:\s*"([^"\\]+)"/gi,
      /"dash_live_predictive_playback_url"\s*:\s*"([^"\\]+)"/gi,
    ]

    const idPatterns = [
      /"broadcast_id"\s*:\s*"?(\d+)"?/i,
      /"broadcastId"\s*:\s*"?(\d+)"?/i,
      /"live_broadcast_id"\s*:\s*"?(\d+)"?/i,
      /[?&]broadcast_id=(\d+)/i,
    ]

    const decodeValue = (value) => String(value)
      .replace(/\\u0026/gi, '&')
      .replace(/\\\//g, '/')
      .replace(/&amp;/gi, '&')

    const findPlayback = (html) => {
      for (const pattern of playbackPatterns) {
        pattern.lastIndex = 0
        const m = pattern.exec(html)
        if (m) return decodeValue(m[1])
      }
      return null
    }

    const findBroadcastId = (html) => {
      for (const pattern of idPatterns) {
        const m = pattern.exec(html)
        if (m) return m[1]
      }
      return null
    }

    let broadcastId = null
    let mediaId = ''
    let playbackUrl = null

    for (const page of pages) {
      const result = await this._get(page.url, this._webHeaders(page.referer))
      if (!result.response || !result.response.ok) continue

      const html = result.text || ''
      const foundPlayback = findPlayback(html)
      const foundBroadcast = findBroadcastId(html)
      const mediaMatch = html.match(/"media_id"\s*:\s*"([^"\\]+)"/i)
      const statusMatch = html.match(/"broadcast_status"\s*:\s*"([^"\\]+)"/i)

      if (foundBroadcast) {
        broadcastId = foundBroadcast
      }
      if (mediaMatch) mediaId = mediaMatch[1]
      if (foundPlayback) {
        playbackUrl = foundPlayback
        break
      }
    }

    // If the /live/ page exposes a broadcast id but not the playback URL,
    // query the broadcast-info endpoint.  This is a legacy-compatible route
    // and is useful once a real broadcast id is known.
    if (!playbackUrl && broadcastId) {
      const infoUrl = `https://www.instagram.com/api/v1/live/${encodeURIComponent(broadcastId)}/info/`
      const info = await this._get(infoUrl, this._webHeaders(liveUrl))
      if (info.response && info.response.ok) {
        try {
          const data = JSON.parse(info.text)
          const stream = this._findStreamObject(data) || data
          playbackUrl = stream.dash_abr_playback_url || stream.dash_playback_url || stream.dash_live_predictive_playback_url || null
          mediaId = stream.media_id || mediaId
        } catch (error) {
        }
      }
    }

    if (!playbackUrl) {
      return null
    }

    return {
      media_id: mediaId || broadcastId || '',
      id: userId,
      broadcast_id: broadcastId || mediaId || '',
      broadcast_status: 'active',
      dash_abr_playback_url: playbackUrl,
      dash_playback_url: playbackUrl
    }
  }

  _findStreamObject(value) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this._findStreamObject(item)
        if (found) return found
      }
      return null
    }
    if (!value || typeof value !== 'object') return null

    if (value.dash_abr_playback_url || value.media_id) {
      return value
    }

    for (const child of Object.values(value)) {
      const found = this._findStreamObject(child)
      if (found) return found
    }
    return null
  }

  async getMpd(mpdUrl) {
    const { response, text } = await this._get(mpdUrl, {
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': this.agent,
      referer: 'https://www.instagram.com/',
      'referrer-policy': 'strict-origin-when-cross-origin'
    })

    if (!response || !response.ok) {
      return {
        ok: false,
        status: response ? response.status : 0
      }
    }

    return {
      ok: true,
      status: response.status,
      xml: this.xmlParser.parseFromString(text, 'application/xml')
    }
  }

  async getSegment(segmentUrl, n = 5) {
    const response = await fetch(segmentUrl, {
      headers: {
        accept: '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent': this.agent,
        referer: 'https://www.instagram.com/',
        'referrer-policy': 'strict-origin-when-cross-origin'
      },
      body: null,
      method: 'GET',
      agent: this.agent,
    }).catch((error) => {
      console.error(error)
      return false
    })

    if (!response || !response.ok) {
      if (n === 0) {
        return {
          ok: false,
          status: response ? response.status : 0,
        }
      }
      console.info('retrying...', n, response ? response.status : 'no response', response ? response.statusText : '')
      return await this.getSegment(segmentUrl, n - 1)
    }
    this._handleHeaders(...response.headers)
    return {
      ok: true,
      status: response.status,
      blob: await response.blob(),
    }
  }

  downloadVideoSegment() {
    throw Error('call initializeVideoDownloader(videoUrlTemplate) first')
  }

  downloadAudioSegment() {
    throw Error('call initializeAudioDownloader(audioUrlTemplate) first')
  }

  initializeVideoDownloader(videoUrlTemplate) {
    const downloadVideoSegment = function(segment) {
      return this.getSegment(videoUrlTemplate.replace(/\$Time\$/, segment))
    }
    this.downloadVideoSegment = downloadVideoSegment.bind(this)
    return this
  }

  initializeAudioDownloader(audioUrlTemplate) {
    const downloadAudioSegment = function(segment) {
      return this.getSegment(audioUrlTemplate.replace(/\$Time\$/, segment))
    }
    this.downloadAudioSegment = downloadAudioSegment.bind(this)
    return this
  }
}
