import fetch from 'node-fetch'

export default class NodeInstaRequests {
  constructor({ csrfToken, xmlParser, sessionId, agent, cookieString }) {
    this.csrfToken = csrfToken
    this.cookies = cookieString
    this.sessionId = sessionId
    this.xIgWWWClaim = '0'
    this.xmlParser = xmlParser
    this.xIgAppId = '936619743392459'   // chrome browser
    this.agent = agent
  }

  _handleHeaders(...headers) {
    for (const [header, value] of headers) {
      if (header === 'x-ig-set-www-claim') {
        this.xIgWWWClaim = value
      }
    }
  }

  async getUsernameInfo(username) {
    if (!this.csrfToken) {
      throw new Error('Error: csrfToken is requered for getUsernameInfo request')
    }

    const cookieHeader = this.cookies || `sessionid=${this.sessionId}; csrftoken=${this.csrfToken};`

    const headers = {
      "accept": "*/*",
      "accept-language": "en-US,en;q=0.9,ru;q=0.8",
      "x-asbd-id": "198387",
      "x-csrftoken": this.csrfToken,
      "x-ig-app-id": this.xIgAppId,
      "x-ig-www-claim": this.xIgWWWClaim,
      "cookie": cookieHeader,
      "User-Agent": this.agent,
      "Referer": "https://www.instagram.com/",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    }

    // web_profile_info currently returns HTTP 400 for some accounts.
    // Try usernameinfo first; it returns a user object directly.
    const usernameInfoUrl =
      `https://i.instagram.com/api/v1/users/${encodeURIComponent(username)}/usernameinfo/`

    try {
      const response = await fetch(usernameInfoUrl, {
        headers,
        method: 'GET',
        agent: this.agent,
      })

      if (response.ok) {
        this._handleHeaders(...response.headers)
        const data = await response.json()
        const user = data?.user || data?.data?.user
        const userId = user?.pk ?? user?.id

        if (userId) {
          // Keep the exact structure expected by LiveVideoRecorder:
          // userInfo.data.user.id
          return {
            ok: true,
            status: response.status,
            json: {
              data: {
                user: {
                  ...user,
                  id: String(userId),
                  pk: userId
                }
              }
            }
          }
        }
      }
    } catch (error) {
      // Continue to the username-feed fallback below.
      console.warn(`usernameinfo failed for ${username}: ${error.message}`)
    }

    // Fallback: fetch the feed directly by username. This avoids
    // /users/web_profile_info/, which is currently returning HTTP 400
    // ("ig_business_category_subvertical") for some accounts.
    const feedUrl =
      `https://i.instagram.com/api/v1/feed/user/${encodeURIComponent(username)}/username/?count=1`

    try {
      const response = await fetch(feedUrl, {
        headers,
        method: 'GET',
        agent: this.agent,
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        return {
          ok: false,
          status: response.status,
          error: text
        }
      }

      this._handleHeaders(...response.headers)
      const data = await response.json()

      // Depending on the current Instagram response, the user can be
      // present at data.user or on the first feed item as item.user.
      const user =
        data?.user ||
        data?.data?.user ||
        data?.items?.find(item => item?.user)?.user

      const userId =
        user?.pk ??
        user?.id ??
        data?.user_id ??
        data?.data?.user_id

      if (!userId) {
        return {
          ok: false,
          status: response.status,
          error: 'Username feed returned no user id'
        }
      }

      return {
        ok: true,
        status: response.status,
        json: {
          data: {
            user: {
              ...(user || {}),
              id: String(userId),
              pk: userId
            }
          }
        }
      }
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error.message
      }
    }
  }

  getStreamInfo(userId) {
    if (!this.csrfToken) {
      throw new Error('Error: csrfToken is requered for getStreamInfo request')
    }

    if (!this.sessionId) {
      throw new Error('Error: sessionId is requered for getStreamInfo request')
    }

    return fetch(`https://i.instagram.com/api/v1/live/web_info/?target_user_id=${userId}`, {
      "headers": {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9,ru;q=0.8",
        "sec-ch-ua": "\" Not A;Brand\";v=\"99\", \"Chromium\";v=\"102\", \"Google Chrome\";v=\"102\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "x-asbd-id": "198387",
        "x-csrftoken": this.csrfToken,
        "x-ig-app-id": this.xIgAppId,
        "x-ig-www-claim": this.xIgWWWClaim,
        "cookie": `sessionid=${this.sessionId};`,
        "Referer": "https://www.instagram.com/",
        "Referrer-Policy": "strict-origin-when-cross-origin"
      },
      "body": null,
      "method": "GET",
      agent: this.agent
    }).then(async (response) => {
      if (!response.ok) {
        return {
            ok: false,
            status: response.status,
        }
      }
      this._handleHeaders(...response.headers)
      return {
          ok: true,
          status: response.status,
          json: await response.json(),
      }
    })
  }

  getMpd(mpdUrl) {
    return fetch(mpdUrl, {
      "headers": {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9,ru;q=0.8",
        "sec-ch-ua": "\" Not A;Brand\";v=\"99\", \"Chromium\";v=\"102\", \"Google Chrome\";v=\"102\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "Referer": "https://www.instagram.com/",
        "Referrer-Policy": "strict-origin-when-cross-origin"
      },
      "body": null,
      "method": "GET",
      agent: this.agent
    }).then(async (response) => {
      if (!response.ok) {
        return {
            ok: false,
            status: response.status
        }
      }
      this._handleHeaders(...response.headers)
      const text = await response.text()
      return {
          ok: true,
          status: response.status,
          xml: this.xmlParser.parseFromString(text, "application/xml")
      }
    })
  }

  async getSegment(segmentUrl, n = 5) {
    const response = await fetch(segmentUrl, {
      "headers": {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9,ru;q=0.8",
        "sec-ch-ua": "\" Not A;Brand\";v=\"99\", \"Chromium\";v=\"102\", \"Google Chrome\";v=\"102\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "Referer": "https://www.instagram.com/",
        "Referrer-Policy": "strict-origin-when-cross-origin"
      },
      "body": null,
      "method": "GET",
      agent: this.agent,
    }).catch((error) => {
      console.error(error);
      return false;
    });
    if (!response || !response.ok) {
      if (n === 0) {
        return {
          ok: false,
          status: response.status,
        };
      };
      console.info("retrying...", n, response.status, response.statusText);
      return await this.getSegment(segmentUrl, n - 1);
    }
    this._handleHeaders(...response.headers);
    return {
      ok: true,
      status: response.status,
      blob: await response.blob(),
    };
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