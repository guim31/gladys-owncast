// -----------------------------------------------------------------------------
// The Owncast client against the real answers of Owncast 0.3.0 in Docker
// (test/fixtures/owncast, captured with a test pattern streamed by ffmpeg):
// normalization, error kinds, and the fake Owncast of the tests rendering the
// same keys as the real one.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ERROR_KINDS,
  OwncastClient,
  normalizeAdminStatus,
  normalizeConfig,
  normalizeStatus,
} from '../src/owncast/client.js';
import { FakeOwncast } from './helpers/fakeOwncast.js';

const fixture = async (name) =>
  JSON.parse(await readFile(new URL(`./fixtures/owncast/${name}.json`, import.meta.url), 'utf8'));

const BASE = 'http://192.0.2.10:8080';

test('the public status: offline, live with viewers, live without (left out at 0), ended', async () => {
  assert.deepEqual(normalizeStatus(await fixture('status-offline-new')), {
    online: false,
    title: '',
    viewers: null,
    sessionPeak: null,
    connectedAt: null,
    disconnectedAt: null,
    version: '0.3.0',
  });
  const live = normalizeStatus(await fixture('status-online'));
  assert.equal(live.online, true);
  assert.equal(live.title, 'Morning test stream');
  assert.equal(live.viewers, 4);
  assert.equal(live.connectedAt, Date.UTC(2026, 9, 22, 0, 39, 22));
  assert.equal(normalizeStatus(await fixture('status-online-no-viewer')).viewers, null);
  const ended = normalizeStatus(await fixture('status-offline-after'));
  assert.equal(ended.connectedAt, null, 'Owncast forgets the start once offline');
  assert.equal(ended.disconnectedAt, Date.UTC(2026, 9, 22, 0, 41, 21));
  assert.equal(ended.title, 'Morning test stream');
});

test('the admin status: viewers, peaks, incoming stream while live', async () => {
  assert.deepEqual(normalizeAdminStatus(await fixture('admin-status-online')), {
    online: true,
    viewers: 4,
    sessionPeak: 4,
    overallPeak: 4,
    bitrate: 585,
    resolution: '640×360',
  });
  const offline = normalizeAdminStatus(await fixture('admin-status-offline'));
  assert.equal(offline.bitrate, null);
  assert.equal(offline.resolution, '');
});

test('the public configuration: name, hidden viewer count', async () => {
  const config = normalizeConfig(await fixture('config'));
  assert.equal(config.name, 'New Owncast Server');
  assert.equal(config.hideViewerCount, false);
  assert.deepEqual(config.tags, ['owncast', 'streaming']);
});

test('the fake Owncast renders the keys of the real one', async () => {
  const fake = new FakeOwncast();
  assert.deepEqual(
    Object.keys(fake.status()).sort(),
    Object.keys(await fixture('status-offline-new')).sort(),
  );
  fake.goLive('Morning test stream');
  fake.setViewers(4);
  assert.deepEqual(
    Object.keys(fake.status()).sort(),
    Object.keys(await fixture('status-online')).sort(),
  );
  assert.deepEqual(
    Object.keys(fake.adminStatus()).sort(),
    Object.keys(await fixture('admin-status-online')).sort(),
  );
  fake.goOffline();
  assert.equal(fake.status().lastConnectTime, null);
});

test('error kinds: refused, redirect, not Owncast, unreachable, certificate', async () => {
  const kind = async (response, call = (client) => client.status()) => {
    const client = new OwncastClient({
      url: BASE,
      adminPassword: 'pw',
      accessToken: 'token',
      request: async () => {
        if (response instanceof Error) {
          throw response;
        }
        return response;
      },
    });
    try {
      await call(client);
    } catch (err) {
      return err.kind;
    }
    return null;
  };
  assert.equal(await kind({ status: 401, body: '' }, (c) => c.adminStatus()), ERROR_KINDS.AUTH);
  assert.equal(
    await kind({ status: 401, body: '' }, (c) => c.sendSystemMessage('hi')),
    ERROR_KINDS.TOKEN,
  );
  assert.equal(await kind({ status: 302, body: '' }), ERROR_KINDS.REDIRECT);
  assert.equal(await kind({ status: 404, body: '' }), ERROR_KINDS.NOT_OWNCAST);
  assert.equal(await kind({ status: 200, body: '<html>' }), ERROR_KINDS.NOT_OWNCAST);
  assert.equal(await kind({ status: 200, body: '{"ok":true}' }), ERROR_KINDS.NOT_OWNCAST);
  assert.equal(await kind({ status: 500, body: '' }), ERROR_KINDS.HTTP);
  const refused = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  assert.equal(await kind(refused), ERROR_KINDS.UNREACHABLE);
  const tls = Object.assign(new TypeError('fetch failed'), {
    cause: { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' },
  });
  assert.equal(await kind(tls), ERROR_KINDS.TLS);
});

test('requests: the admin password only on the admin route, the token only on the chat route', async () => {
  const seen = [];
  const client = new OwncastClient({
    url: BASE,
    adminPassword: 'pw',
    accessToken: 'token',
    request: async (url, options) => {
      seen.push({ url, ...options });
      return { status: 200, body: '{"online":false,"name":"x","message":"sent"}' };
    },
  });
  await client.status();
  await client.config();
  await client.adminStatus();
  await client.sendSystemMessage('x'.repeat(2000));
  assert.deepEqual(
    seen.map((request) => [request.method, request.url, request.headers.authorization]),
    [
      ['GET', `${BASE}/api/status`, undefined],
      ['GET', `${BASE}/api/config`, undefined],
      ['GET', `${BASE}/api/admin/status`, `Basic ${Buffer.from('admin:pw').toString('base64')}`],
      ['POST', `${BASE}/api/integrations/chat/system`, 'Bearer token'],
    ],
  );
  assert.equal(JSON.parse(seen[3].body).body.length, 1000);
});
