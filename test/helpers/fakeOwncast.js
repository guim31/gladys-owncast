// -----------------------------------------------------------------------------
// An in-memory Owncast, rendering its answers like Owncast 0.3.0 does (checked
// against the real answers of test/fixtures/owncast in test/client.test.js):
// `viewerCount` left out of /api/status when 0 or hidden, `lastConnectTime`
// back to null once offline; the admin status behind basic `admin` + password;
// the chat system messages behind a bearer access token.
// -----------------------------------------------------------------------------

export const BASE = 'http://192.0.2.10:8080';
export const ADMIN_PASSWORD = 'admin-password-1234';
export const TOKEN = 'access-token-1234';

const iso = (time) => (time === null ? null : new Date(time).toISOString());

export class FakeOwncast {
  constructor({ now = () => Date.now(), adminPassword = ADMIN_PASSWORD, token = TOKEN } = {}) {
    this.now = now;
    this.adminPassword = adminPassword;
    this.token = token;
    this.name = 'My stream';
    this.title = '';
    this.online = false;
    this.viewers = 0;
    this.sessionPeak = 0;
    this.overallPeak = 0;
    this.hideViewerCount = false;
    this.connectedAt = null;
    this.disconnectedAt = null;
    this.width = 1920;
    this.height = 1080;
    this.bitrate = 4500;
    /** 'down': the server does not answer; a number: that HTTP status. */
    this.failure = null;
    this.messages = [];
    this.requests = [];
    this.request = this.request.bind(this);
  }

  goLive(title = this.title) {
    this.title = title;
    this.online = true;
    this.connectedAt = this.now();
    this.sessionPeak = 0;
  }

  goOffline() {
    this.online = false;
    this.connectedAt = null;
    this.disconnectedAt = this.now();
    this.viewers = 0;
  }

  setViewers(count) {
    this.viewers = count;
    this.sessionPeak = Math.max(this.sessionPeak, count);
    this.overallPeak = Math.max(this.overallPeak, count);
  }

  status() {
    const out = {
      serverTime: iso(this.now()),
      lastConnectTime: iso(this.connectedAt),
      lastDisconnectTime: iso(this.disconnectedAt),
      versionNumber: '0.3.0',
      streamTitle: this.title,
    };
    if (!this.hideViewerCount && this.online && this.viewers > 0) {
      out.viewerCount = this.viewers;
    }
    out.online = this.online;
    return out;
  }

  adminStatus() {
    return {
      broadcaster: this.online
        ? {
            time: iso(this.connectedAt),
            remoteAddr: '192.0.2.3:55564',
            streamDetails: {
              videoCodec: 'H.264',
              audioCodec: 'AAC',
              width: this.width,
              height: this.height,
              videoBitrate: this.bitrate,
              audioBitrate: 160,
              framerate: 30,
            },
          }
        : null,
      currentBroadcast: null,
      health: null,
      streamTitle: this.title,
      versionNumber: '0.3.0',
      viewerCount: this.online ? this.viewers : 0,
      overallPeakViewerCount: this.overallPeak,
      sessionPeakViewerCount: this.sessionPeak,
      online: this.online,
    };
  }

  config() {
    return {
      name: this.name,
      summary: 'A test stream.',
      tags: ['owncast', 'streaming'],
      hideViewerCount: this.hideViewerCount,
      chatDisabled: false,
    };
  }

  async request(url, { method = 'GET', headers = {}, body } = {}) {
    const { pathname } = new URL(url);
    this.requests.push({ method, path: pathname, headers, body });
    if (this.failure === 'down') {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }
    if (typeof this.failure === 'number') {
      return { status: this.failure, body: '' };
    }
    const json = (status, value) => ({ status, body: JSON.stringify(value) });
    if (method === 'GET' && pathname === '/api/status') {
      return json(200, this.status());
    }
    if (method === 'GET' && pathname === '/api/config') {
      return json(200, this.config());
    }
    if (method === 'GET' && pathname === '/api/admin/status') {
      const expected = `Basic ${Buffer.from(`admin:${this.adminPassword}`).toString('base64')}`;
      return headers.authorization === expected
        ? json(200, this.adminStatus())
        : { status: 401, body: 'Unauthorized' };
    }
    if (method === 'POST' && pathname === '/api/integrations/chat/system') {
      if (headers.authorization !== `Bearer ${this.token}`) {
        return { status: 401, body: 'Unauthorized' };
      }
      this.messages.push(JSON.parse(body).body);
      return json(200, { message: 'sent', success: true });
    }
    return { status: 404, body: '404 page not found' };
  }
}
