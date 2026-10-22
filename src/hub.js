// -----------------------------------------------------------------------------
// The Owncast hub: the server read on a timer of the container (the interval
// chosen in the configuration); the states of the device published when they
// change, the scene events fired on transitions, and the views the widget and
// the scene actions read. (Adapted from guim31/gladys-gatus.)
//
// Gladys never polls the device (should_poll: false, see the CLAUDE.md
// polling trap of the 5.2 core): the timer of the container does.
//
// Live or not: what /api/status says, with one rule on top — the end of a
// live is confirmed once Owncast has been offline for END_GRACE_MS. A
// broadcasting software that reconnects (OBS after a network hiccup) neither
// ends the live nor starts a new one. The live in progress (since when, its
// peak, the viewer milestones reached) is kept in /data (src/store.js): a
// restart of the integration or of Gladys neither starts it again nor loses
// its end.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { buildServerDevice, serverIds, serverValues } from './devices.js';
import { ERROR_KINDS, OwncastClient, OwncastError } from './owncast/client.js';
import { hostOf, isLocalAddress, normalizeConfig as normalizeIntegrationConfig } from './config.js';
import { ProblemLog } from './problems.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  STATE_TEXT,
  labelled,
  pick,
  quote,
} from './texts.js';

const logger = createLogger({ name: 'owncast-hub' });

export const WIDGET_KEY = 'stream';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  STARTED: 'stream_started',
  ENDED: 'stream_ended',
  VIEWERS: 'viewers_reached',
});

// The viewer counts the "viewers reached" trigger offers (manifest options of
// its `threshold` field): each one fires at most once per live.
export const VIEWER_MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

export const HUB_TIMINGS = {
  // Offline for this long before a live is over.
  endGraceMs: 60_000,
  // The public configuration (name, hidden viewer count) is read this often.
  configEveryMs: 10 * 60_000,
  // An unchanged value is sent again this often: Gladys shows "no recent
  // value" after 48 hours.
  heartbeatMs: 12 * 3600_000,
  // A scene action reads Owncast again when the last read is older.
  freshMs: 10_000,
};

const MINUTE = 60_000;

const emptySaved = () => ({ known: false, live: false });

export class OwncastHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/owncast/client.js)
   * @param {boolean} [options.timers] the reading timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    // Defaults until start(): a handler reached after a failed start still
    // answers with a readable message.
    this.config = normalizeIntegrationConfig({});
    this.client = null;
    this.signature = null;
    this.status = null;
    this.server = null;
    this.serverAt = 0;
    this.admin = null;
    this.adminError = null;
    this.readAt = 0;
    this.error = null;
    this.polling = null;
    this.transport = null;
    this.connection = null;
    this.discovered = null;
    this.saved = emptySaved();
    this.pollTimer = null;
    this.stopped = false;
    // What fails again at every cycle (Gladys refusing, the reading loop):
    // one line when it starts, one when it ends.
    this.problems = new ProblemLog(logger);
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = saved && saved.known === true ? saved : emptySaved();
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.transport = null;
    this.connection = null;
    this.discovered = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const previous = this.signature === null ? null : JSON.parse(this.signature);
    this.config = config;
    const signature = JSON.stringify([config.url, config.adminPassword, config.accessToken]);
    if (signature !== this.signature) {
      if (previous && previous[0] !== config.url) {
        // Another server: the live saved for the previous one means nothing.
        this.saved = emptySaved();
        this.store.save(this.saved);
      }
      this.signature = signature;
      this.client = config.url
        ? new OwncastClient({
            url: config.url,
            adminPassword: config.adminPassword,
            accessToken: config.accessToken,
            request: this.request,
          })
        : null;
      this.status = null;
      this.server = null;
      this.serverAt = 0;
      this.admin = null;
      this.adminError = null;
      this.readAt = 0;
      this.error = null;
      this.polling = null;
      this.transport = null;
    }
    // A new language or admin access: new names or features for Discovery.
    this.discovered = null;
    try {
      if (this.client) {
        await this.pollNow({ publish: true });
      } else {
        await this.afterChanges(true, { publish: true });
      }
    } finally {
      this.schedulePoll();
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.store.flush();
  }

  /** The next read by the timer, after `delayMs` (the refresh interval by default). */
  schedulePoll(delayMs = this.config.pollIntervalMs) {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollNow();
        this.problems.recover('poll', 'Reading Owncast works again');
      } catch (err) {
        this.problems.fail('poll', `Poll failed: ${err.message}`, 'error');
      }
      this.schedulePoll();
    }, delayMs);
  }

  // --- Reading Owncast -------------------------------------------------------

  /** Read the server now and publish what changed. */
  async pollNow({ publish = false } = {}) {
    const changed = await this.poll();
    await this.afterChanges(changed, { publish });
  }

  /** Read again when the last read is older than `freshMs` (scene actions). */
  async refreshIfStale() {
    if (this.client && this.now() - this.readAt >= this.timings.freshMs) {
      await this.pollNow();
    }
  }

  /**
   * Read the server and apply what changed. Concurrent calls share the read.
   * @returns {Promise<boolean>} whether the widget shows something new
   */
  poll() {
    if (!this.client) {
      return Promise.resolve(false);
    }
    if (!this.polling) {
      const polling = this.read(this.client).finally(() => {
        // A read of a previous client must not drop the promise of the current one.
        if (this.polling === polling) {
          this.polling = null;
        }
      });
      this.polling = polling;
    }
    return this.polling;
  }

  async read(client) {
    let status;
    try {
      status = await client.status();
    } catch (err) {
      if (!(err instanceof OwncastError)) {
        throw err;
      }
      return client === this.client && this.applyFailure(err);
    }
    let changed = false;
    if (this.serverAt === 0 || this.now() - this.serverAt >= this.timings.configEveryMs) {
      changed = (await this.readServer(client)) || changed;
    }
    if (client.hasAdmin) {
      changed = (await this.readAdmin(client)) || changed;
    }
    // Checked after the last await: a read of a previous client never lands.
    if (client !== this.client) {
      return false;
    }
    return (await this.applySuccess(status)) || changed;
  }

  /** The public configuration: the server name, the hidden viewer count. */
  async readServer(client) {
    try {
      const server = await client.config();
      if (client !== this.client) {
        return false;
      }
      this.serverAt = this.now();
      this.problems.recover('config', 'Owncast configuration read again');
      const changed = JSON.stringify(server) !== JSON.stringify(this.server);
      this.server = server;
      return changed;
    } catch (err) {
      if (!(err instanceof OwncastError)) {
        throw err;
      }
      this.problems.fail('config', `Owncast configuration not read: ${err.message}`);
      return false;
    }
  }

  /** The admin status: viewers even when hidden, the incoming stream. */
  async readAdmin(client) {
    try {
      const admin = await client.adminStatus();
      if (client !== this.client) {
        return false;
      }
      const changed = this.adminError !== null;
      if (this.adminError) {
        logger.info('Owncast admin access works again');
      }
      this.adminError = null;
      this.admin = admin;
      return changed;
    } catch (err) {
      if (!(err instanceof OwncastError)) {
        throw err;
      }
      if (client !== this.client) {
        return false;
      }
      const changed = this.adminError !== err.kind;
      if (changed) {
        logger.warn(`Owncast admin status: ${err.message}`);
      }
      this.adminError = err.kind;
      this.admin = null;
      return changed;
    }
  }

  /** Viewers right now, null when Owncast hides them (and no admin access). */
  viewersOf(status) {
    if (!status.online) {
      return 0;
    }
    if (this.admin?.online && this.admin.viewers !== null) {
      return this.admin.viewers;
    }
    if (status.viewers !== null) {
      return status.viewers;
    }
    // Left out by Owncast: 0 viewers, or hidden by its configuration.
    return this.server?.hideViewerCount ? null : 0;
  }

  async applySuccess(status) {
    let widgetChanged = this.error !== null || this.readAt === 0;
    if (this.error) {
      logger.info('Owncast answers again');
    }
    if (this.readAt === 0) {
      logger.info(
        `Owncast ${status.version || ''} (${hostOf(this.config.url)}): ${status.online ? 'live' : 'offline'}`,
      );
    }
    this.error = null;
    this.readAt = this.now();

    const before = JSON.stringify(this.view());
    this.status = status;
    // Synchronous up to the events: a concurrent read cannot interleave.
    const events = [];
    const dirty = this.transition(status, events);
    if (dirty) {
      this.store.save(this.saved);
    }
    for (const [key, data] of events) {
      await this.fire(key, data);
    }
    await this.publishStates();
    return widgetChanged || JSON.stringify(this.view()) !== before;
  }

  applyFailure(err) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    this.readAt = this.now();
    if (wasError !== err.kind) {
      logger.warn(`Owncast: ${err.message}`);
    }
    return wasError !== err.kind;
  }

  /**
   * Compare the status with the saved live; queue the scene events.
   * @returns {boolean} whether the saved state changed
   */
  transition(status, events) {
    const now = this.now();
    const saved = this.saved;
    const viewers = this.viewersOf(status);
    const sessionPeak = Math.max(
      status.sessionPeak ?? 0,
      this.admin?.online ? (this.admin.sessionPeak ?? 0) : 0,
    );
    const name = this.serverName();

    if (!saved.known) {
      // First sight: the states, no event.
      this.saved = {
        known: true,
        live: status.online,
        since: status.online ? Math.min(now, status.connectedAt ?? now) : null,
        peak: viewers === null ? null : Math.max(viewers, sessionPeak),
        title: status.title,
        milestones: VIEWER_MILESTONES.filter((m) => viewers !== null && viewers >= m),
      };
      return true;
    }

    let dirty = false;
    if (status.title && status.title !== saved.title) {
      saved.title = status.title;
      dirty = true;
    }

    if (status.online) {
      if (saved.offlineSince !== undefined) {
        // Back before the end was confirmed: the same live goes on.
        delete saved.offlineSince;
        dirty = true;
      }
      if (!saved.live) {
        saved.live = true;
        saved.since = Math.min(now, status.connectedAt ?? now);
        saved.peak = viewers === null ? null : 0;
        saved.milestones = [];
        dirty = true;
        logger.info(`Live started: ${status.title || '(no title)'}`);
        events.push([TRIGGERS.STARTED, { title: status.title, server: name }]);
      }
      if (viewers !== null) {
        const peak = Math.max(saved.peak ?? 0, viewers, sessionPeak);
        if (peak !== saved.peak) {
          saved.peak = peak;
          dirty = true;
        }
        for (const milestone of VIEWER_MILESTONES) {
          if (viewers >= milestone && !saved.milestones.includes(milestone)) {
            saved.milestones.push(milestone);
            dirty = true;
            events.push([
              TRIGGERS.VIEWERS,
              { threshold: milestone, viewers, title: saved.title ?? '', server: name },
            ]);
          }
        }
      }
      return dirty;
    }

    if (!saved.live) {
      return dirty;
    }
    // Offline while a live was in progress: over once the grace has passed.
    const disconnectedAt =
      status.disconnectedAt !== null && status.disconnectedAt >= (saved.since ?? 0)
        ? Math.min(now, status.disconnectedAt)
        : null;
    const offlineSince = disconnectedAt ?? saved.offlineSince ?? now;
    if (saved.offlineSince !== offlineSince) {
      saved.offlineSince = offlineSince;
      dirty = true;
    }
    if (now - offlineSince < this.timings.endGraceMs) {
      return dirty;
    }
    const minutes = Math.max(
      0,
      Math.round((offlineSince - (saved.since ?? offlineSince)) / MINUTE),
    );
    saved.live = false;
    saved.lastDuration = minutes;
    delete saved.offlineSince;
    logger.info(`Live ended after ${minutes} min`);
    events.push([
      TRIGGERS.ENDED,
      {
        title: saved.title ?? '',
        duration_minutes: minutes,
        peak_viewers: saved.peak ?? 0,
        server: name,
      },
    ]);
    return true;
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Views -----------------------------------------------------------------

  serverName() {
    return this.server?.name || 'Owncast';
  }

  /** The stream as the device, the widget and the scene actions see it. */
  view() {
    const saved = this.saved;
    const status = this.status;
    const live = saved.known ? saved.live === true : status?.online === true;
    const now = this.now();
    const viewers = status ? this.viewersOf(status) : null;
    return {
      name: this.serverName(),
      live,
      // Online for Owncast, the end of the live not yet confirmed.
      ending: live && status?.online === false,
      title: status?.title || saved.title || '',
      viewers: live && viewers === null ? null : (viewers ?? 0),
      peak: saved.peak ?? null,
      durationMinutes:
        live && saved.since ? Math.max(0, Math.floor((now - saved.since) / MINUTE)) : 0,
      lastDuration: saved.lastDuration ?? null,
      admin: Boolean(this.client?.hasAdmin),
      bitrate: this.admin?.bitrate ?? null,
      resolution: this.admin?.resolution ?? '',
    };
  }

  // --- Publishing to Gladys --------------------------------------------------

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  discoveredDevices() {
    if (!this.client) {
      return [];
    }
    if (this.readAt === 0 || this.error) {
      return null; // nothing read: keep the list Gladys has
    }
    return [
      buildServerDevice(
        this.gladys,
        { name: this.server?.name, admin: this.client.hasAdmin, url: this.config.url },
        this.config.language,
      ),
    ];
  }

  /** Publish the Discovery list when it changed (a new name, admin access…). */
  async publishDevices({ force = false } = {}) {
    const devices = this.discoveredDevices();
    if (devices === null) {
      return;
    }
    const key = JSON.stringify(devices);
    if (!force && key === this.discovered) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discovered = key;
      this.problems.recover('discovered', 'Discovered devices accepted again');
    } catch (err) {
      this.problems.fail('discovered', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: read Owncast, publish the device again. */
  async rediscover() {
    this.serverAt = 0; // the name may have changed
    await this.poll();
    await this.afterChanges(true, { publish: true });
  }

  /**
   * The user added (or updated) the device: its states sent before were
   * dropped by Gladys (the SDK already forgot them), and it needs its badge.
   */
  async onDeviceCreated() {
    this.transport = null;
    await this.publishStates();
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** Gladys asks for a refresh (onPoll, only if it polls anyway). */
  async pollDevice() {
    await this.pollNow();
  }

  /** The states of the device, when added. The SDK skips the unchanged values. */
  async publishStates() {
    if (this.readAt === 0 || this.error || !this.isCreated(serverIds(this.gladys).device)) {
      return;
    }
    const states = serverValues(this.gladys, this.view()).map(({ key: _key, ...state }) => state);
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.problems.recover('states', 'States accepted again');
    } catch (err) {
      this.problems.fail('states', `States refused: ${err.message}`);
    }
  }

  async afterChanges(widgetChanged, { publish = false } = {}) {
    await this.publishDevices({ force: publish });
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  /** The badge of the device: local or cloud (from the address), or unreachable. */
  async publishTransports() {
    const externalId = serverIds(this.gladys).device;
    if (!this.client || this.readAt === 0 || !this.isCreated(externalId)) {
      return;
    }
    let transport = isLocalAddress(this.config.url)
      ? DEVICE_TRANSPORTS.LOCAL
      : DEVICE_TRANSPORTS.CLOUD;
    if (this.error) {
      transport = DEVICE_TRANSPORTS.UNREACHABLE;
    }
    if (transport === this.transport) {
      return;
    }
    try {
      await this.gladys.publishTransports([{ external_id: externalId, transport }]);
      this.transport = transport;
      this.problems.recover('transports', 'Transports accepted again');
    } catch (err) {
      this.problems.fail('transports', `Transports refused: ${err.message}`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (this.config.url === '') {
      return { connected: false, message: CONNECTION_TEXT.noUrl };
    }
    if (!this.config.url) {
      return { connected: false, message: CONNECTION_TEXT.invalidUrl };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    if (this.adminError === ERROR_KINDS.AUTH) {
      return { connected: false, message: ERROR_TEXT[ERROR_KINDS.AUTH] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.problems.recover('connection', 'Connection status accepted again');
    } catch (err) {
      this.problems.fail('connection', `Connection status refused: ${err.message}`);
    }
  }

  // --- Commands (scene actions, report) ----------------------------------------

  /** Throws the reason Owncast cannot answer, if any. */
  assertReadable() {
    if (!this.config.url || this.error) {
      throw new Error(pick(this.connectionStatus().message, this.config.language));
    }
  }

  /** Send a system message to the chat of the stream. */
  async sendChatMessage(message) {
    const language = this.config.language;
    if (!this.client) {
      this.assertReadable();
    }
    if (!this.config.accessToken) {
      throw new Error(pick(ACTION_TEXT.noToken, language));
    }
    const text = typeof message === 'string' ? message.trim() : '';
    if (!text) {
      throw new Error(pick(ACTION_TEXT.noMessage, language));
    }
    try {
      await this.client.sendSystemMessage(text);
    } catch (err) {
      throw err instanceof OwncastError ? new Error(pick(ERROR_TEXT[err.kind], language)) : err;
    }
    logger.info('Chat message sent');
  }

  /** One line about the stream, in a language. */
  sentence(language) {
    const view = this.view();
    const text = REPORT_TEXT[language] ?? REPORT_TEXT.en;
    const parts = [pick(view.live ? STATE_TEXT.live : STATE_TEXT.offline, language)];
    if (view.live) {
      if (view.title) {
        parts.push(quote(view.title, language));
      }
      if (view.viewers !== null) {
        parts.push(text.viewers(view.viewers));
      }
      parts.push(text.minutes(view.durationMinutes));
    }
    return labelled(view.name, parts.join(', '), language);
  }

  /** "Test the connection": read Owncast now, one line. */
  async testConnection() {
    this.serverAt = 0;
    await this.pollNow({ publish: true });
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      const status = this.connectionStatus();
      if (!status.connected) {
        message[language] = pick(status.message, language);
        continue;
      }
      const parts = [text.ok, this.sentence(language)];
      if (this.client.hasAdmin) {
        parts.push(text.admin);
      }
      message[language] = parts.join(' · ');
    }
    return message;
  }
}
