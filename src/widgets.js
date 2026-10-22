// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `stream`.
//
// The use case: a glance at the wall tablet tells whether the stream is live,
// under which title, and how many people watch. Live: the title, three tiles
// (viewers, peak, minutes), the incoming resolution and bitrate with the admin
// password. Offline: the length and peak of the last live. A Refresh button,
// and a Watch button opening the stream page when its address is https (the
// only links the core accepts).
//
// The figures are sent as values, not bound to device features: the widget
// works before the device is added.
//
// Budget (8 components, 2 texts, 1 status): one heading, three tiles, one
// text when Owncast does not answer, the status list, two buttons.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from './hub.js';
import { CONNECTION_TEXT, ERROR_TEXT, STATE_TEXT, pick } from './texts.js';

// Action key of the button: permanent once published.
export const ACTIONS = Object.freeze({ REFRESH: 'refresh' });

export const TEXT = {
  pick: {
    en: 'Enter the address of your Owncast in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre Owncast dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines Owncast in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su Owncast en la configuración de la integración.',
  },
  viewers: { en: 'Viewers', fr: 'Spectateurs', de: 'Zuschauer', es: 'Espectadores' },
  peak: { en: 'Peak', fr: 'Pic', de: 'Spitze', es: 'Pico' },
  duration: { en: 'Live for', fr: 'Durée', de: 'Dauer', es: 'Duración' },
  lastLive: { en: 'Last live', fr: 'Dernier direct', de: 'Letzter Stream', es: 'Último directo' },
  lastPeak: {
    en: 'Peak of the last live',
    fr: 'Pic du dernier direct',
    de: 'Spitze des letzten Streams',
    es: 'Pico del último directo',
  },
  incoming: { en: 'Incoming', fr: 'Entrée', de: 'Eingang', es: 'Entrada' },
  hidden: { en: 'hidden', fr: 'masqué', de: 'verborgen', es: 'oculto' },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  watch: { en: 'Watch', fr: 'Regarder', de: 'Ansehen', es: 'Ver' },
  refreshed: {
    en: 'Owncast read again.',
    fr: 'Owncast relu.',
    de: 'Owncast neu gelesen.',
    es: 'Owncast leído de nuevo.',
  },
};

const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: pick(text, language) }],
  };
}

async function get(hub, { language = 'en' } = {}) {
  if (!hub.client) {
    return message(hub.config.url === null ? CONNECTION_TEXT.invalidUrl : TEXT.pick, language);
  }
  const view = hub.view();
  const components = [];
  if (view.title) {
    components.push({ type: 'text', variant: 'heading', text: fit(view.title, 40) });
  }
  if (hub.error) {
    components.push({
      type: 'text',
      variant: 'body',
      text: pick(ERROR_TEXT[hub.error.kind], language),
    });
  }
  const rows = [
    {
      label: fit(view.name, 40),
      value: pick(view.live ? STATE_TEXT.live : STATE_TEXT.offline, language),
      icon: view.live ? 'radio' : 'video-off',
      color: view.live ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (view.live) {
    components.push(
      {
        type: 'value',
        value: view.viewers ?? pick(TEXT.hidden, language),
        label: pick(TEXT.viewers, language),
        icon: 'eye',
        color: WIDGET_COLORS.PRIMARY,
      },
      {
        type: 'value',
        value: view.peak ?? '–',
        label: pick(TEXT.peak, language),
        icon: 'trending-up',
        color: WIDGET_COLORS.NEUTRAL,
      },
      {
        type: 'value',
        value: view.durationMinutes,
        unit: 'min',
        label: pick(TEXT.duration, language),
        icon: 'clock',
        color: WIDGET_COLORS.NEUTRAL,
      },
    );
    if (view.admin && view.resolution) {
      rows.push({
        label: pick(TEXT.incoming, language),
        value:
          view.bitrate !== null ? `${view.resolution} · ${view.bitrate} kbit/s` : view.resolution,
        icon: 'upload',
        color: WIDGET_COLORS.INFO,
      });
    }
  } else if (view.lastDuration !== null) {
    rows.push({
      label: pick(TEXT.lastLive, language),
      value: `${view.lastDuration} min`,
      icon: 'clock',
      color: WIDGET_COLORS.NEUTRAL,
    });
    if (view.peak !== null) {
      rows.push({
        label: pick(TEXT.lastPeak, language),
        value: view.peak,
        icon: 'trending-up',
        color: WIDGET_COLORS.NEUTRAL,
      });
    }
  }
  components.push({ type: 'status', items: rows });
  components.push({
    type: 'button',
    label: pick(TEXT.refresh, language),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: ACTIONS.REFRESH },
  });
  if (hub.config.url.startsWith('https://')) {
    components.push({
      type: 'button',
      label: pick(TEXT.watch, language),
      icon: 'play',
      style: 'secondary',
      link: { url: hub.config.url },
    });
  }
  // A live moves: refresh sooner.
  return { ttl_seconds: view.live || hub.error ? 30 : 120, components };
}

async function action(hub, { actionKey }) {
  if (actionKey !== ACTIONS.REFRESH) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  await hub.pollNow();
  if (hub.error) {
    return { message: ERROR_TEXT[hub.error.kind] };
  }
  return { message: TEXT.refreshed };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
