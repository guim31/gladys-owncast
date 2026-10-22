// -----------------------------------------------------------------------------
// The Gladys device, proposed in the Discovery tab: one per integration, the
// Owncast server configured (its id does not depend on the address, so a new
// IP or domain keeps the device and its history):
//
//   live           input/binary            1 live, 0 offline
//   viewers        counter-sensor/integer  viewers right now (0 offline)
//   peak_viewers   counter-sensor/integer  peak of the current live, or of the
//                                          last one once it is over
//   title          text/text               the stream title
//   live_duration  duration/integer min    length of the current live (0 offline)
//
// and, with the admin password, the incoming stream:
//
//   bitrate        datarate/rate kbit/s    incoming video bitrate (0 offline)
//   resolution     text/text               incoming resolution ("1920×1080")
//
// Published with should_poll: false: the integration reads Owncast on its own
// timer (src/hub.js), at the interval chosen in the configuration.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'server';
export const DEVICE_ID = 'main';
export const MODEL = 'Owncast';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  LIVE: 'live',
  VIEWERS: 'viewers',
  PEAK_VIEWERS: 'peak_viewers',
  TITLE: 'title',
  LIVE_DURATION: 'live_duration',
  BITRATE: 'bitrate',
  RESOLUTION: 'resolution',
});

export const ADMIN_KEYS = new Set([FEATURE_KEYS.BITRATE, FEATURE_KEYS.RESOLUTION]);

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.LIVE]: 'Live',
    [FEATURE_KEYS.VIEWERS]: 'Viewers',
    [FEATURE_KEYS.PEAK_VIEWERS]: 'Peak viewers',
    [FEATURE_KEYS.TITLE]: 'Stream title',
    [FEATURE_KEYS.LIVE_DURATION]: 'Live duration',
    [FEATURE_KEYS.BITRATE]: 'Incoming bitrate',
    [FEATURE_KEYS.RESOLUTION]: 'Incoming resolution',
  },
  fr: {
    [FEATURE_KEYS.LIVE]: 'En direct',
    [FEATURE_KEYS.VIEWERS]: 'Spectateurs',
    [FEATURE_KEYS.PEAK_VIEWERS]: 'Pic de spectateurs',
    [FEATURE_KEYS.TITLE]: 'Titre du direct',
    [FEATURE_KEYS.LIVE_DURATION]: 'Durée du direct',
    [FEATURE_KEYS.BITRATE]: 'Débit entrant',
    [FEATURE_KEYS.RESOLUTION]: 'Résolution entrante',
  },
  de: {
    [FEATURE_KEYS.LIVE]: 'Live',
    [FEATURE_KEYS.VIEWERS]: 'Zuschauer',
    [FEATURE_KEYS.PEAK_VIEWERS]: 'Zuschauerspitze',
    [FEATURE_KEYS.TITLE]: 'Titel des Streams',
    [FEATURE_KEYS.LIVE_DURATION]: 'Dauer des Streams',
    [FEATURE_KEYS.BITRATE]: 'Eingehende Bitrate',
    [FEATURE_KEYS.RESOLUTION]: 'Eingehende Auflösung',
  },
  es: {
    [FEATURE_KEYS.LIVE]: 'En directo',
    [FEATURE_KEYS.VIEWERS]: 'Espectadores',
    [FEATURE_KEYS.PEAK_VIEWERS]: 'Pico de espectadores',
    [FEATURE_KEYS.TITLE]: 'Título del directo',
    [FEATURE_KEYS.LIVE_DURATION]: 'Duración del directo',
    [FEATURE_KEYS.BITRATE]: 'Tasa de bits entrante',
    [FEATURE_KEYS.RESOLUTION]: 'Resolución entrante',
  },
};

// Display bounds (the core never applies them on write).
export const MAX_VIEWERS = 100_000;
export const MAX_DURATION_MINUTES = 7 * 24 * 60;
export const MAX_BITRATE_KBPS = 100_000;

export const serverIds = (gladys) => gladys.externalIds(DEVICE_TYPE, DEVICE_ID);

const sensor = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  ...extra,
});

const text = (name, externalId) =>
  sensor(name, externalId, DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT, {
    keep_history: false,
    // NOT NULL in the core, even for a text: 422 on "Add to Gladys" without them.
    min: 0,
    max: 0,
  });

const counter = (name, externalId) =>
  sensor(
    name,
    externalId,
    DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    { keep_history: true, min: 0, max: MAX_VIEWERS },
  );

/**
 * The discovery payload of the server.
 * @param {object} gladys
 * @param {{ name?: string, admin?: boolean, url?: string }} server
 * @param {string} [language]
 */
export function buildServerDevice(gladys, { name, admin = false, url = '' } = {}, language = 'en') {
  const ids = serverIds(gladys);
  const names = NAMES[language] ?? NAMES.en;
  const features = [
    sensor(
      names[FEATURE_KEYS.LIVE],
      ids.feature(FEATURE_KEYS.LIVE),
      DEVICE_FEATURE_CATEGORIES.INPUT,
      DEVICE_FEATURE_TYPES.SENSOR.BINARY,
      { keep_history: true, min: 0, max: 1 },
    ),
    counter(names[FEATURE_KEYS.VIEWERS], ids.feature(FEATURE_KEYS.VIEWERS)),
    counter(names[FEATURE_KEYS.PEAK_VIEWERS], ids.feature(FEATURE_KEYS.PEAK_VIEWERS)),
    text(names[FEATURE_KEYS.TITLE], ids.feature(FEATURE_KEYS.TITLE)),
    sensor(
      names[FEATURE_KEYS.LIVE_DURATION],
      ids.feature(FEATURE_KEYS.LIVE_DURATION),
      DEVICE_FEATURE_CATEGORIES.DURATION,
      DEVICE_FEATURE_TYPES.DURATION.INTEGER,
      {
        unit: DEVICE_FEATURE_UNITS.MINUTES,
        keep_history: true,
        min: 0,
        max: MAX_DURATION_MINUTES,
      },
    ),
  ];
  if (admin) {
    features.push(
      sensor(
        names[FEATURE_KEYS.BITRATE],
        ids.feature(FEATURE_KEYS.BITRATE),
        DEVICE_FEATURE_CATEGORIES.DATARATE,
        DEVICE_FEATURE_TYPES.DATARATE.RATE,
        {
          unit: DEVICE_FEATURE_UNITS.KILOBITS_PER_SECOND,
          keep_history: true,
          min: 0,
          max: MAX_BITRATE_KBPS,
        },
      ),
      text(names[FEATURE_KEYS.RESOLUTION], ids.feature(FEATURE_KEYS.RESOLUTION)),
    );
  }
  const params = url ? [{ name: 'OWNCAST_URL', value: url.slice(0, 255) }] : [];
  return {
    name: name || MODEL,
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params,
    features,
  };
}

/**
 * The value of every known feature: `{ key, device_feature_external_id, state | text }`.
 * @param {object} gladys
 * @param {object} view the stream as the hub sees it (src/hub.js `view()`)
 */
export function serverValues(gladys, view) {
  const ids = serverIds(gladys);
  const values = [{ key: FEATURE_KEYS.LIVE, state: view.live ? 1 : 0 }];
  if (view.viewers !== null) {
    values.push({ key: FEATURE_KEYS.VIEWERS, state: Math.min(view.viewers, MAX_VIEWERS) });
  }
  if (view.peak !== null) {
    values.push({ key: FEATURE_KEYS.PEAK_VIEWERS, state: Math.min(view.peak, MAX_VIEWERS) });
  }
  // A text state is never empty, or Gladys ignores it.
  if (view.title) {
    values.push({ key: FEATURE_KEYS.TITLE, text: view.title });
  }
  values.push({
    key: FEATURE_KEYS.LIVE_DURATION,
    state: Math.min(view.durationMinutes, MAX_DURATION_MINUTES),
  });
  if (view.admin) {
    values.push({
      key: FEATURE_KEYS.BITRATE,
      state: Math.min(view.live ? (view.bitrate ?? 0) : 0, MAX_BITRATE_KBPS),
    });
    if (view.resolution) {
      values.push({ key: FEATURE_KEYS.RESOLUTION, text: view.resolution });
    }
  }
  return values.map(({ key, ...value }) => ({
    key,
    device_feature_external_id: ids.feature(key),
    ...value,
  }));
}
