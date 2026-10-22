// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene outputs
// and errors. Four languages, the four of the Gladys interface; German says
// "du", Spanish "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './owncast/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your Owncast in the configuration.',
    fr: "Saisissez l'adresse de votre Owncast dans la configuration.",
    de: 'Gib die Adresse deines Owncast in der Konfiguration ein.',
    es: 'Introduzca la dirección de su Owncast en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.2:8080',
    fr: 'Adresse incomprise, ex. http://192.168.1.2:8080',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.2:8080',
    es: 'Dirección no válida, p. ej. http://192.168.1.2:8080',
  },
};

// One short explanation per error kind (src/owncast/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Owncast does not answer',
    fr: 'Owncast ne répond pas',
    de: 'Owncast antwortet nicht',
    es: 'Owncast no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: use an http:// address or a trusted certificate',
    fr: 'certificat refusé : utilisez une adresse http:// ou un certificat reconnu',
    de: 'Zertifikat abgelehnt: Nutze eine http://-Adresse oder ein vertrauenswürdiges Zertifikat',
    es: 'certificado rechazado: use una dirección http:// o un certificado reconocido',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'admin password refused by Owncast',
    fr: "mot de passe d'administration refusé par Owncast",
    de: 'Admin-Passwort von Owncast abgelehnt',
    es: 'contraseña de administración rechazada por Owncast',
  },
  [ERROR_KINDS.TOKEN]: {
    en: 'access token refused: create one with the "send system messages" right',
    fr: "jeton d'accès refusé : créez-en un avec le droit « messages système »",
    de: 'Zugriffstoken abgelehnt: Erstelle eines mit dem Recht „Systemnachrichten“',
    es: 'token de acceso rechazado: cree uno con el permiso «mensajes del sistema»',
  },
  [ERROR_KINDS.NOT_OWNCAST]: {
    en: 'no Owncast at this address',
    fr: 'aucun Owncast à cette adresse',
    de: 'kein Owncast unter dieser Adresse',
    es: 'no hay ningún Owncast en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The state of the stream, in words (widget, scene outputs).
export const STATE_TEXT = {
  live: { en: 'Live', fr: 'En direct', de: 'Live', es: 'En directo' },
  offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
};

// The "Test the connection" report and the `sentence` output of "Stream
// status".
export const REPORT_TEXT = {
  en: {
    ok: 'Connected',
    viewers: (count) => `${count} viewer(s)`,
    minutes: (count) => `for ${count} min`,
    admin: 'admin access OK',
  },
  fr: {
    ok: 'Connecté',
    viewers: (count) => `${count} spectateur(s)`,
    minutes: (count) => `depuis ${count} min`,
    admin: 'accès admin OK',
  },
  de: {
    ok: 'Verbunden',
    viewers: (count) => `${count} Zuschauer`,
    minutes: (count) => `seit ${count} Min.`,
    admin: 'Admin-Zugang OK',
  },
  es: {
    ok: 'Conectado',
    viewers: (count) => `${count} espectador(es)`,
    minutes: (count) => `desde hace ${count} min`,
    admin: 'acceso de administración OK',
  },
};

// Errors of the scene actions (shown in Gladys).
export const ACTION_TEXT = {
  noToken: {
    en: 'Enter an Owncast access token in the configuration of the integration.',
    fr: "Saisissez un jeton d'accès Owncast dans la configuration de l'intégration.",
    de: 'Gib ein Owncast-Zugriffstoken in der Konfiguration der Integration ein.',
    es: 'Introduzca un token de acceso de Owncast en la configuración de la integración.',
  },
  noMessage: {
    en: 'The message is empty.',
    fr: 'Le message est vide.',
    de: 'Die Nachricht ist leer.',
    es: 'El mensaje está vacío.',
  },
};

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
const QUOTES = { en: ['"', '"'], fr: ['« ', ' »'], de: ['„', '“'], es: ['«', '»'] };

/** A title between the quotation marks of the language. */
export const quote = (text, language) => {
  const [open, close] = QUOTES[language] ?? QUOTES.en;
  return `${open}${text}${close}`;
};

export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];
