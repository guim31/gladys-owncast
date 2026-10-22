// -----------------------------------------------------------------------------
// Owncast client: the HTTP API of the Owncast server (MIT,
// https://github.com/owncast/owncast), checked against Owncast 0.3.0 in Docker
// (test/fixtures/owncast):
//
//   GET  /api/status                 public: `online`, `streamTitle`,
//        `lastConnectTime` (null once offline), `lastDisconnectTime`,
//        `viewerCount` (left out when 0, or when the viewer count is hidden;
//        Owncast before 0.1 also gave `sessionMaxViewerCount`)
//   GET  /api/config                 public: `name`, `summary`, `tags`,
//        `hideViewerCount`
//   GET  /api/admin/status           basic `admin` + admin password: the
//        viewers and peaks even when hidden, the incoming stream
//        (`broadcaster.streamDetails`: `videoBitrate` kbit/s, `width`, `height`)
//   POST /api/integrations/chat/system   `Authorization: Bearer <access token>`
//        (an access token created in Admin → Integrations), `{ body }`
//
// Redirects are not followed: the credentials would be sent to wherever the
// address points (an http:// address redirected to https:// is reported).
// -----------------------------------------------------------------------------

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // the admin password is refused
  TOKEN: 'token', // the access token is refused (or lacks the scope)
  NOT_OWNCAST: 'not_owncast', // something answers, not the Owncast API
  REDIRECT: 'redirect', // the address redirects (usually HTTP to HTTPS)
  HTTP: 'http', // any other HTTP error
});

export class OwncastError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'OwncastError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export const MAX_BODY_BYTES = 1024 * 1024;
// What a chat message may hold: Owncast refuses a WebSocket payload over 2 KB
// for the viewers, the system messages are not capped; 1000 stays readable.
export const MAX_MESSAGE_LENGTH = 1000;

/**
 * The one function that talks to the network (fetch). The client takes it as
 * a parameter: the tests replace it with an in-memory Owncast
 * (test/helpers/fakeOwncast.js).
 * @returns {Promise<{ status: number, body: string }>}
 */
export async function httpRequest(
  url,
  { method = 'GET', headers = {}, body, timeoutMs = 10_000 } = {},
) {
  const response = await fetch(url, {
    method,
    headers,
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) {
    await response.body?.cancel();
    throw new Error('Response too large');
  }
  const text = await response.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new Error('Response too large');
  }
  return { status: response.status, body: text };
}

const dateOf = (value) => {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
};

const count = (value) => (Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null);

const clean = (value, max) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/**
 * The public status, normalized.
 * @returns {{ online: boolean, title: string, viewers: number|null,
 *   sessionPeak: number|null, connectedAt: number|null,
 *   disconnectedAt: number|null, serverTime: number|null, version: string }}
 */
export function normalizeStatus(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.online !== 'boolean') {
    throw new OwncastError(ERROR_KINDS.NOT_OWNCAST, 'The answer is not an Owncast status');
  }
  return {
    online: raw.online,
    title: clean(raw.streamTitle, 255),
    // Left out by Owncast when 0 (omitempty) and when hidden: null here, the
    // hub tells both apart with the `hideViewerCount` of the configuration.
    viewers: count(raw.viewerCount),
    sessionPeak: count(raw.sessionMaxViewerCount),
    connectedAt: dateOf(raw.lastConnectTime),
    disconnectedAt: dateOf(raw.lastDisconnectTime),
    // The clock of Owncast, to date its connection times on ours.
    serverTime: dateOf(raw.serverTime),
    version: clean(raw.versionNumber, 40),
  };
}

/** The public configuration, normalized (what the integration uses of it). */
export function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string') {
    throw new OwncastError(ERROR_KINDS.NOT_OWNCAST, 'The answer is not an Owncast configuration');
  }
  return {
    name: clean(raw.name, 100),
    summary: clean(raw.summary, 300),
    tags: Array.isArray(raw.tags) ? raw.tags.map((tag) => clean(tag, 40)).filter(Boolean) : [],
    hideViewerCount: raw.hideViewerCount === true,
  };
}

/** The admin status, normalized. */
export function normalizeAdminStatus(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.online !== 'boolean') {
    throw new OwncastError(ERROR_KINDS.NOT_OWNCAST, 'The answer is not an Owncast admin status');
  }
  const details = raw.broadcaster?.streamDetails;
  const width = count(details?.width);
  const height = count(details?.height);
  return {
    online: raw.online,
    viewers: count(raw.viewerCount),
    sessionPeak: count(raw.sessionPeakViewerCount),
    overallPeak: count(raw.overallPeakViewerCount),
    // kbit/s, as sent by the broadcasting software.
    bitrate: raw.online ? count(details?.videoBitrate) : null,
    resolution: raw.online && width && height ? `${width}×${height}` : '',
  };
}

export class OwncastClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, `http(s)://host[:port][/path]`
   * @param {string} [options.adminPassword] for the admin status
   * @param {string} [options.accessToken] for the chat messages
   * @param {typeof httpRequest} [options.request] test seam
   * @param {number} [options.timeoutMs]
   */
  constructor({ url, adminPassword = '', accessToken = '', request = httpRequest, timeoutMs }) {
    this.url = url;
    // The admin user of Owncast is always "admin".
    this.adminAuthorization = adminPassword
      ? `Basic ${Buffer.from(`admin:${adminPassword}`).toString('base64')}`
      : null;
    this.accessToken = accessToken;
    this.request = request;
    this.timeoutMs = timeoutMs ?? 10_000;
  }

  get hasAdmin() {
    return this.adminAuthorization !== null;
  }

  async call(path, { method = 'GET', headers = {}, body } = {}) {
    try {
      return await this.request(`${this.url}${path}`, {
        method,
        headers: { accept: 'application/json', ...headers },
        body,
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      const code = err.cause?.code ?? err.code;
      if (TLS_CODES.has(code)) {
        throw new OwncastError(ERROR_KINDS.TLS, `Certificate refused (${code})`);
      }
      throw new OwncastError(ERROR_KINDS.UNREACHABLE, code ?? err.name ?? err.message);
    }
  }

  check({ status }, refused = ERROR_KINDS.HTTP) {
    if (status === 401 || status === 403) {
      throw new OwncastError(refused, `Refused (HTTP ${status})`, { status });
    }
    if (status >= 300 && status < 400) {
      throw new OwncastError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    if (status === 404) {
      throw new OwncastError(ERROR_KINDS.NOT_OWNCAST, 'No Owncast API at this address (HTTP 404)', {
        status,
      });
    }
    if (status < 200 || status >= 300) {
      throw new OwncastError(ERROR_KINDS.HTTP, `Unexpected answer (HTTP ${status})`, { status });
    }
  }

  async json(path, options, refused) {
    const response = await this.call(path, options);
    this.check(response, refused);
    try {
      return JSON.parse(response.body);
    } catch {
      throw new OwncastError(ERROR_KINDS.NOT_OWNCAST, `The answer of ${path} is not JSON`);
    }
  }

  /** @throws {OwncastError} */
  async status() {
    return normalizeStatus(await this.json('/api/status'));
  }

  /** @throws {OwncastError} */
  async config() {
    return normalizeConfig(await this.json('/api/config'));
  }

  /** @throws {OwncastError} AUTH when the admin password is refused */
  async adminStatus() {
    return normalizeAdminStatus(
      await this.json(
        '/api/admin/status',
        { headers: { authorization: this.adminAuthorization } },
        ERROR_KINDS.AUTH,
      ),
    );
  }

  /**
   * Send a system message to the chat.
   * @param {string} text
   * @throws {OwncastError} TOKEN when the access token is refused
   */
  async sendSystemMessage(text) {
    await this.json(
      '/api/integrations/chat/system',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ body: text.slice(0, MAX_MESSAGE_LENGTH) }),
      },
      ERROR_KINDS.TOKEN,
    );
  }
}
