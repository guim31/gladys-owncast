// -----------------------------------------------------------------------------
// The hub against the SDK's fake Gladys and a fake Owncast: discovery, states,
// lives starting and ending (with the grace for a reconnection), viewer
// milestones, persistence across restarts, the admin status, errors, scene
// actions, the widget, quiet logs, and the reading timer of the container.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { FEATURE_KEYS } from '../src/devices.js';
import { TRIGGERS, WIDGET_KEY } from '../src/hub.js';
import {
  ADMIN_PASSWORD,
  BASE,
  FakeOwncast,
  TOKEN,
  createClock,
  createDevice,
  createWorld,
  idsOf,
} from './helpers/world.js';

const MINUTE = 60_000;
const events = (world, key) => world.fake.sceneEvents.filter((event) => event.key === key);
const state = (world, key) => world.fake.lastState(idsOf(world).feature(key));

async function captureLogs(t, level, fn) {
  const lines = [];
  const write = (chunk) => {
    lines.push(...String(chunk).split('\n').filter(Boolean));
    return true;
  };
  const before = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const stdout = t.mock.method(process.stdout, 'write', write);
  const stderr = t.mock.method(process.stderr, 'write', write);
  try {
    await fn();
  } finally {
    stdout.mock.restore();
    stderr.mock.restore();
    process.env.LOG_LEVEL = before;
  }
  return lines;
}

/** A world whose device is added, Owncast offline, then live. */
async function liveWorld(t, options = {}) {
  const world = await createWorld(options);
  t.after(() => world.app.stop());
  await createDevice(world);
  world.owncast.goLive('Saturday build');
  await world.hub.pollNow();
  return world;
}

test('one device for the server, named after it, proposed in Discovery, nothing polled by Gladys', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const devices = world.fake.discoveredDevices;
  assert.equal(devices.length, 1);
  assert.equal(devices[0].name, 'My stream');
  assert.equal(devices[0].external_id, idsOf(world).device);
  assert.equal(devices[0].should_poll, false);
  assert.equal(devices[0].poll_frequency, undefined);
  assert.deepEqual(
    devices[0].features.map((feature) => feature.external_id.split(':').at(-1)),
    ['live', 'viewers', 'peak_viewers', 'title', 'live_duration'],
    'no admin feature without the admin password',
  );
  assert.deepEqual(devices[0].params, [{ name: 'OWNCAST_URL', value: BASE }]);
  // Nothing is published for a device not added.
  assert.equal(world.fake.states.length, 0);
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('the states of the added device at once, then only the changes', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevice(world);
  assert.equal(state(world, FEATURE_KEYS.LIVE), 0);
  assert.equal(state(world, FEATURE_KEYS.VIEWERS), 0);
  assert.equal(state(world, FEATURE_KEYS.LIVE_DURATION), 0);
  assert.equal(state(world, FEATURE_KEYS.TITLE), undefined, 'no empty text');
  assert.deepEqual(world.fake.transports.at(-1), {
    device_external_id: idsOf(world).device,
    transport: 'local',
  });
  assert.ok(world.fake.widgetRefreshes.includes(WIDGET_KEY));

  const before = world.fake.states.length;
  await world.hub.pollNow();
  assert.equal(world.fake.states.length, before, 'nothing changed, nothing sent');
});

test('a live starts: states, "A live starts" with its title, the duration counts', async (t) => {
  const world = await liveWorld(t);
  assert.equal(state(world, FEATURE_KEYS.LIVE), 1);
  const titles = world.fake.states.filter(
    (entry) => entry.device_feature_external_id === idsOf(world).feature(FEATURE_KEYS.TITLE),
  );
  assert.equal(titles.at(-1).text, 'Saturday build');
  assert.deepEqual(
    events(world, TRIGGERS.STARTED).map((event) => event.data),
    [{ title: 'Saturday build', server: 'My stream' }],
  );
  world.owncast.setViewers(3);
  world.clock.advance(12 * MINUTE);
  await world.hub.pollNow();
  assert.equal(state(world, FEATURE_KEYS.VIEWERS), 3);
  assert.equal(state(world, FEATURE_KEYS.PEAK_VIEWERS), 3);
  assert.equal(state(world, FEATURE_KEYS.LIVE_DURATION), 12);
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.STARTED).length, 1, 'once per live');
});

test('a live ends after a minute offline, with its duration and peak', async (t) => {
  const world = await liveWorld(t);
  world.owncast.setViewers(8);
  world.clock.advance(40 * MINUTE);
  await world.hub.pollNow();
  world.owncast.setViewers(2);
  world.clock.advance(5 * MINUTE);
  await world.hub.pollNow();
  world.owncast.goOffline();
  world.clock.advance(30_000);
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.ENDED).length, 0, 'not yet: a reconnection may follow');
  assert.equal(state(world, FEATURE_KEYS.LIVE), 1);
  world.clock.advance(30_000);
  await world.hub.pollNow();
  assert.deepEqual(
    events(world, TRIGGERS.ENDED).map((event) => event.data),
    [{ title: 'Saturday build', duration_minutes: 45, peak_viewers: 8, server: 'My stream' }],
  );
  assert.equal(state(world, FEATURE_KEYS.LIVE), 0);
  assert.equal(state(world, FEATURE_KEYS.VIEWERS), 0);
  assert.equal(state(world, FEATURE_KEYS.LIVE_DURATION), 0);
  assert.equal(state(world, FEATURE_KEYS.PEAK_VIEWERS), 8, 'the peak of the last live stays');
});

test('a broadcaster that reconnects within the minute neither ends nor restarts the live', async (t) => {
  const world = await liveWorld(t);
  world.clock.advance(20 * MINUTE);
  world.owncast.goOffline();
  await world.hub.pollNow();
  world.clock.advance(20_000);
  world.owncast.goLive();
  world.clock.advance(10_000);
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.ENDED).length, 0);
  assert.equal(events(world, TRIGGERS.STARTED).length, 1);
  assert.equal(state(world, FEATURE_KEYS.LIVE_DURATION), 20, 'counted from the first start');
});

test('a live that stops and a new one that starts between two readings: both announced', async (t) => {
  const world = await liveWorld(t);
  world.owncast.setViewers(20);
  world.clock.advance(30 * MINUTE);
  await world.hub.pollNow();
  world.clock.advance(10_000);
  world.owncast.goOffline();
  world.clock.advance(90_000);
  world.owncast.goLive('Second part');
  world.owncast.setViewers(1);
  world.clock.advance(20_000);
  await world.hub.pollNow();
  assert.deepEqual(
    world.fake.sceneEvents.slice(-3).map((event) => [event.key, event.data.title]),
    [
      [TRIGGERS.ENDED, 'Saturday build'],
      [TRIGGERS.STARTED, 'Second part'],
      [TRIGGERS.VIEWERS, 'Second part'],
    ],
  );
  const ended = events(world, TRIGGERS.ENDED)[0].data;
  assert.equal(ended.duration_minutes, 30, 'up to the last reading that saw it');
  assert.equal(ended.peak_viewers, 20);
  assert.equal(state(world, FEATURE_KEYS.LIVE_DURATION), 0);
  assert.equal(state(world, FEATURE_KEYS.PEAK_VIEWERS), 1, 'a new peak for the new live');
});

test('a new live started while the integration was stopped: the old one ends, the new one starts', async (t) => {
  const clock = createClock();
  const owncast = new FakeOwncast({ now: clock.now });
  const first = await createWorld({ clock, owncast });
  owncast.goLive('Old');
  await first.hub.pollNow();
  owncast.setViewers(30);
  await first.hub.pollNow();
  await first.app.stop();
  clock.advance(60 * MINUTE);
  owncast.goOffline();
  clock.advance(5 * 60 * MINUTE);
  owncast.goLive('New');
  owncast.setViewers(2);
  clock.advance(10 * MINUTE);
  const second = await createWorld({ clock, owncast, dataDir: first.dataDir });
  t.after(() => second.app.stop());
  await createDevice(second);
  assert.deepEqual(
    second.fake.sceneEvents.map((event) => [event.key, event.data.title]),
    [
      [TRIGGERS.ENDED, 'Old'],
      [TRIGGERS.STARTED, 'New'],
      [TRIGGERS.VIEWERS, 'New'],
    ],
  );
  assert.equal(state(second, FEATURE_KEYS.LIVE_DURATION), 10);
  assert.equal(state(second, FEATURE_KEYS.PEAK_VIEWERS), 2);
});

test('the clock of Owncast minutes off: a short reconnection stays a reconnection', async (t) => {
  const clock = createClock();
  const owncast = new FakeOwncast({ now: clock.now });
  owncast.skewMs = -3 * MINUTE;
  const world = await createWorld({ clock, owncast });
  t.after(() => world.app.stop());
  await createDevice(world);
  owncast.goLive('Skewed');
  await world.hub.pollNow();
  clock.advance(20 * MINUTE);
  await world.hub.pollNow();
  assert.equal(state(world, FEATURE_KEYS.LIVE_DURATION), 20);
  owncast.goOffline();
  clock.advance(10_000);
  await world.hub.pollNow();
  owncast.goLive();
  clock.advance(10_000);
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.ENDED).length, 0);
  assert.equal(events(world, TRIGGERS.STARTED).length, 1);
});

test('"Viewers reach a threshold": each milestone once per live, the next live again', async (t) => {
  const world = await liveWorld(t);
  world.owncast.setViewers(1);
  await world.hub.pollNow();
  world.owncast.setViewers(12);
  await world.hub.pollNow();
  world.owncast.setViewers(4);
  await world.hub.pollNow();
  world.owncast.setViewers(11);
  await world.hub.pollNow();
  assert.deepEqual(
    events(world, TRIGGERS.VIEWERS).map((event) => [event.data.threshold, event.data.viewers]),
    [
      [1, 1],
      [5, 12],
      [10, 12],
    ],
  );
  world.owncast.goOffline();
  world.clock.advance(2 * MINUTE);
  await world.hub.pollNow();
  world.owncast.goLive('Sunday build');
  world.owncast.setViewers(2);
  await world.hub.pollNow();
  assert.deepEqual(events(world, TRIGGERS.VIEWERS).at(-1).data, {
    threshold: 1,
    viewers: 2,
    title: 'Sunday build',
    server: 'My stream',
  });
});

test('no event at the first read, even during a live', async (t) => {
  const clock = createClock();
  const owncast = new FakeOwncast({ now: clock.now });
  owncast.goLive('Already live');
  owncast.setViewers(30);
  clock.advance(15 * MINUTE);
  const world = await createWorld({ clock, owncast });
  t.after(() => world.app.stop());
  await createDevice(world);
  assert.deepEqual(world.fake.sceneEvents, []);
  assert.equal(state(world, FEATURE_KEYS.LIVE_DURATION), 15, 'from the connection time');
  owncast.setViewers(55);
  await world.hub.pollNow();
  assert.deepEqual(
    events(world, TRIGGERS.VIEWERS).map((event) => event.data.threshold),
    [50],
    'the milestones already passed are not announced',
  );
});

test('a live that ended while the integration was stopped is announced once, at the right length', async (t) => {
  const clock = createClock();
  const owncast = new FakeOwncast({ now: clock.now });
  const first = await createWorld({ clock, owncast });
  owncast.goLive('Night stream');
  await first.hub.pollNow();
  owncast.setViewers(6);
  await first.hub.pollNow();
  await first.app.stop();

  clock.advance(90 * MINUTE);
  owncast.goOffline();
  clock.advance(60 * MINUTE);
  const second = await createWorld({ clock, owncast, dataDir: first.dataDir });
  t.after(() => second.app.stop());
  assert.deepEqual(
    events(second, TRIGGERS.ENDED).map((event) => event.data),
    [{ title: 'Night stream', duration_minutes: 90, peak_viewers: 6, server: 'My stream' }],
  );
  assert.deepEqual(events(second, TRIGGERS.STARTED), [], 'the start was announced before');
  await second.hub.pollNow();
  assert.equal(events(second, TRIGGERS.ENDED).length, 1);
});

test('restarted during a live: no new start, the duration keeps counting', async (t) => {
  const clock = createClock();
  const owncast = new FakeOwncast({ now: clock.now });
  const first = await createWorld({ clock, owncast });
  owncast.goLive('Long one');
  await first.hub.pollNow();
  await first.app.stop();
  clock.advance(30 * MINUTE);
  const second = await createWorld({ clock, owncast, dataDir: first.dataDir });
  t.after(() => second.app.stop());
  await createDevice(second);
  assert.deepEqual(second.fake.sceneEvents, []);
  assert.equal(state(second, FEATURE_KEYS.LIVE_DURATION), 30);
});

test('another Owncast address: the live saved for the previous one is dropped', async (t) => {
  const world = await liveWorld(t);
  world.owncast.goOffline();
  await world.fake.configUpdated({ url: 'http://192.0.2.20:8080', language: 'en' });
  world.clock.advance(5 * MINUTE);
  await world.hub.pollNow();
  assert.deepEqual(events(world, TRIGGERS.ENDED), [], 'no end for a live of another server');
});

test('hidden viewer count: nothing published without the admin password, read with it', async (t) => {
  const hidden = await liveWorld(t);
  hidden.owncast.hideViewerCount = true;
  hidden.owncast.setViewers(7);
  await hidden.hub.rediscover();
  assert.equal(hidden.hub.view().viewers, null);
  assert.equal(state(hidden, FEATURE_KEYS.VIEWERS), 0, 'the last value known, 0 before the live');
  assert.deepEqual(events(hidden, TRIGGERS.VIEWERS), []);

  const admin = await liveWorld(t, {
    config: { url: BASE, language: 'en', admin_password: ADMIN_PASSWORD },
  });
  admin.owncast.hideViewerCount = true;
  admin.owncast.setViewers(7);
  await admin.hub.pollNow();
  assert.equal(state(admin, FEATURE_KEYS.VIEWERS), 7);
});

test('the admin password adds the incoming bitrate and resolution', async (t) => {
  const world = await createWorld({
    config: { url: BASE, language: 'fr', admin_password: ADMIN_PASSWORD },
  });
  t.after(() => world.app.stop());
  const [device] = world.fake.discoveredDevices;
  assert.deepEqual(
    device.features.slice(-2).map((feature) => [feature.name, feature.unit]),
    [
      ['Débit entrant', 'kilobits-per-second'],
      ['Résolution entrante', undefined],
    ],
  );
  await createDevice(world);
  world.owncast.goLive('Test');
  await world.hub.pollNow();
  assert.equal(state(world, FEATURE_KEYS.BITRATE), 4500);
  const resolution = world.fake.states.filter(
    (entry) => entry.device_feature_external_id === idsOf(world).feature(FEATURE_KEYS.RESOLUTION),
  );
  assert.equal(resolution.at(-1).text, '1920×1080');
  world.owncast.goOffline();
  world.clock.advance(2 * MINUTE);
  await world.hub.pollNow();
  assert.equal(state(world, FEATURE_KEYS.BITRATE), 0);
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('a wrong admin password is reported, the public data still read', async (t) => {
  const world = await createWorld({
    config: { url: BASE, language: 'fr', admin_password: 'nope' },
  });
  t.after(() => world.app.stop());
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /mot de passe d'administration refusé/);
  await createDevice(world);
  world.owncast.goLive('Still read');
  await world.hub.pollNow();
  assert.equal(state(world, FEATURE_KEYS.LIVE), 1);
});

test('Owncast unreachable: status, badge, one warning, no event', async (t) => {
  const world = await liveWorld(t);
  world.owncast.failure = 'down';
  const lines = await captureLogs(t, 'info', async () => {
    for (let i = 0; i < 3; i += 1) {
      world.clock.advance(MINUTE);
      await world.hub.pollNow();
    }
  });
  assert.equal(lines.length, 1, 'one line for an outage, not one per read');
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.equal(world.fake.connectionStatus.message.en, 'Owncast does not answer');
  assert.equal(world.fake.transports.at(-1).transport, 'unreachable');
  assert.equal(events(world, TRIGGERS.ENDED).length, 0, 'unreachable is not offline');
  world.owncast.failure = null;
  await world.hub.pollNow();
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.fake.transports.at(-1).transport, 'local');
});

test('Owncast down for hours then restarted: the live ends at the last reading that saw it', async (t) => {
  const world = await liveWorld(t);
  world.clock.advance(30 * MINUTE);
  await world.hub.pollNow();
  world.owncast.failure = 'down';
  world.clock.advance(120 * MINUTE);
  await world.hub.pollNow();
  world.owncast.failure = null;
  world.owncast.restart();
  await world.hub.pollNow();
  assert.deepEqual(
    events(world, TRIGGERS.ENDED).map((event) => event.data.duration_minutes),
    [30],
  );
});

test('no address, a wrong address, a public address', async (t) => {
  const empty = await createWorld({ config: { language: 'de' } });
  t.after(() => empty.app.stop());
  assert.equal(empty.fake.connectionStatus.connected, false);
  assert.match(empty.fake.connectionStatus.message.de, /Gib die Adresse/);
  assert.deepEqual(empty.fake.discoveredDevices, []);

  const notOwncast = await createWorld();
  t.after(() => notOwncast.app.stop());
  notOwncast.owncast.failure = 404;
  await notOwncast.hub.pollNow();
  assert.equal(notOwncast.fake.connectionStatus.message.en, 'no Owncast at this address');

  const owncast = new FakeOwncast();
  const remote = await createWorld({
    owncast,
    config: { url: 'https://live.example.org', language: 'en' },
  });
  t.after(() => remote.app.stop());
  await createDevice(remote);
  assert.equal(remote.fake.transports.at(-1).transport, 'cloud');
});

test('"Stream status": the stream in outputs and a sentence, in the language of the configuration', async (t) => {
  const world = await liveWorld(t, { config: { url: BASE, language: 'fr' } });
  world.owncast.setViewers(12);
  world.clock.advance(45 * MINUTE);
  const ack = await world.fake.sceneAction('get_stream_status', {});
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    live: true,
    title: 'Saturday build',
    viewers: 12,
    peak_viewers: 12,
    duration_minutes: 45,
    sentence: 'My stream : En direct, « Saturday build », 12 spectateur(s), depuis 45 min',
  });
});

test('"Send a message to the chat": the access token of the configuration', async (t) => {
  const without = await createWorld();
  t.after(() => without.app.stop());
  const refused = await without.fake.sceneAction('send_chat_message', { message: 'Hi' });
  assert.equal(refused.success, false);
  assert.match(refused.error, /access token/);

  const world = await createWorld({ config: { url: BASE, language: 'en', access_token: TOKEN } });
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('send_chat_message', { message: ' Back in 2 min! ' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(world.owncast.messages, ['Back in 2 min!']);
  const empty = await world.fake.sceneAction('send_chat_message', { message: '  ' });
  assert.match(empty.error, /empty/);

  const wrong = await createWorld({ config: { url: BASE, language: 'en', access_token: 'nope' } });
  t.after(() => wrong.app.stop());
  const bad = await wrong.fake.sceneAction('send_chat_message', { message: 'Hi' });
  assert.match(bad.error, /access token refused/);
  // The token appears in no request but the chat one.
  assert.ok(
    wrong.owncast.requests
      .filter((request) => !request.path.endsWith('/chat/system'))
      .every((request) => !JSON.stringify(request).includes('nope')),
  );
});

test('the widget: live with title, viewers, peak and duration; offline with the last live', async (t) => {
  const world = await liveWorld(t, {
    config: { url: BASE, language: 'en', admin_password: ADMIN_PASSWORD },
  });
  world.owncast.setViewers(9);
  world.clock.advance(25 * MINUTE);
  await world.hub.pollNow();
  const live = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' });
  assert.equal(live.success, true, live.error);
  const content = live.data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].text, 'Saturday build');
  assert.deepEqual(
    content.components.filter((c) => c.type === 'value').map((c) => [c.label, c.value]),
    [
      ['Viewers', 9],
      ['Peak', 9],
      ['Live for', 25],
    ],
  );
  const rows = content.components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    rows.map((row) => [row.label, row.value]),
    [
      ['My stream', 'Live'],
      ['Incoming', '1920×1080 · 4500 kbit/s'],
    ],
  );
  assert.equal(content.ttl_seconds, 30);

  world.owncast.goOffline();
  world.clock.advance(2 * MINUTE);
  await world.hub.pollNow();
  const offline = (await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'fr' })).data
    .content;
  assert.deepEqual(validateWidgetContent(offline), []);
  assert.deepEqual(
    offline.components.find((c) => c.type === 'status').items.map((row) => [row.label, row.value]),
    [
      ['My stream', 'Hors ligne'],
      ['Dernier direct', '25 min'],
      ['Pic du dernier direct', 9],
    ],
  );
  assert.equal(offline.components.filter((c) => c.type === 'value').length, 0);
  const refresh = await world.fake.widgetAction(WIDGET_KEY, 'refresh', {});
  assert.equal(refresh.success, true, refresh.error);
});

test('the widget says what to do without address, and when Owncast does not answer; Watch on https', async (t) => {
  const empty = await createWorld({ config: { language: 'en' } });
  t.after(() => empty.app.stop());
  const nothing = (await empty.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' })).data
    .content;
  assert.match(nothing.components[0].text, /Enter the address/);

  const world = await createWorld();
  t.after(() => world.app.stop());
  world.owncast.failure = 'down';
  await world.hub.pollNow();
  const down = (await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' })).data
    .content;
  assert.deepEqual(validateWidgetContent(down), []);
  assert.ok(down.components.some((c) => c.text === 'Owncast does not answer'));
  assert.ok(!down.components.some((c) => c.link), 'no link to an http:// address');

  const remote = await createWorld({
    owncast: new FakeOwncast(),
    config: { url: 'https://live.example.org', language: 'en' },
  });
  t.after(() => remote.app.stop());
  const page = (await remote.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' })).data
    .content;
  assert.deepEqual(validateWidgetContent(page), []);
  assert.deepEqual(page.components.at(-1).link, { url: 'https://live.example.org' });
});

test('a new language renames the features proposed', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(world.fake.discoveredDevices[0].features[0].name, 'Live');
  await world.fake.configUpdated({ url: BASE, language: 'es' });
  assert.equal(world.fake.discoveredDevices[0].features[0].name, 'En directo');
});

test('the state file is written only when something changed', async (t) => {
  const world = await liveWorld(t);
  await world.app.hub.store.flush();
  const save = t.mock.method(world.hub.store, 'save');
  world.clock.advance(MINUTE);
  await world.hub.pollNow();
  await world.hub.pollNow();
  assert.equal(save.mock.callCount(), 0);
  world.owncast.setViewers(2);
  await world.hub.pollNow();
  assert.equal(save.mock.callCount(), 1);
});

test('Gladys restarted: everything is sent again', async (t) => {
  const world = await liveWorld(t);
  const before = world.fake.states.length;
  await world.gladys.disconnect();
  await world.gladys.connect();
  assert.ok(world.fake.states.length > before);
});

test('"Test the connection" reads Owncast and reports in the four languages', async (t) => {
  const world = await liveWorld(t, {
    config: { url: BASE, language: 'en', admin_password: ADMIN_PASSWORD },
  });
  world.owncast.setViewers(4);
  const ack = await world.fake.action('test_connection', {});
  assert.equal(ack.success, true, ack.error);
  assert.equal(
    ack.data.message.en,
    'Connected · My stream: Live, "Saturday build", 4 viewer(s), for 0 min · admin access OK',
  );
  assert.deepEqual(Object.keys(ack.data.message), ['en', 'fr', 'de', 'es']);

  world.owncast.adminPassword = 'changed';
  const refused = await world.fake.action('test_connection', {});
  assert.match(refused.data.message.en, /admin password refused/);
  world.owncast.failure = 'down';
  const down = await world.fake.action('test_connection', {});
  assert.equal(down.data.message.fr, 'Owncast ne répond pas');
});

test('a normal reading cycle writes nothing at the info level', async (t) => {
  const world = await liveWorld(t);
  const sent = world.fake.states.length;
  const lines = await captureLogs(t, 'info', async () => {
    for (let cycle = 0; cycle < 6; cycle += 1) {
      world.owncast.setViewers(cycle);
      world.clock.advance(MINUTE);
      await world.hub.pollNow();
    }
  });
  assert.ok(world.fake.states.length > sent, 'states were published');
  assert.deepEqual(lines, []);
});

test('the internal timer reads Owncast and publishes the changes, without any poll from Gladys', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({ timers: true });
  t.after(() => world.app.stop());
  await createDevice(world);
  const reads = world.owncast.requests.length;
  world.owncast.goLive('Timer');
  t.mock.timers.tick(30_000);
  // Let the read and the publications settle.
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(world.owncast.requests.length > reads);
  assert.equal(state(world, FEATURE_KEYS.LIVE), 1);
});
