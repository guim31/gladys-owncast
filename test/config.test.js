// -----------------------------------------------------------------------------
// The configuration: the address as users type or paste it, the local or cloud
// badge, the defaults.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLocalAddress, normalizeConfig, parseServerUrl } from '../src/config.js';

test('the address: bare host, port, https, a copied page, a sub-path', () => {
  assert.equal(parseServerUrl('192.0.2.10:8080'), 'http://192.0.2.10:8080');
  assert.equal(parseServerUrl(' https://live.example.org/ '), 'https://live.example.org');
  assert.equal(parseServerUrl('https://live.example.org/admin/'), 'https://live.example.org');
  assert.equal(parseServerUrl('http://192.0.2.10:8080/embed/video'), 'http://192.0.2.10:8080');
  assert.equal(parseServerUrl('https://example.org/owncast/'), 'https://example.org/owncast');
  assert.equal(parseServerUrl('ftp://example.org'), null);
  assert.equal(parseServerUrl('http://admin:pw@example.org'), null, 'no credentials in the URL');
  assert.equal(parseServerUrl('http://'), null);
});

test('local or cloud, from the address', () => {
  for (const url of [
    'http://192.168.1.2:8080',
    'http://10.0.0.5',
    'http://172.20.0.2',
    'http://owncast:8080',
    'http://owncast.local',
    'http://[fd00::2]:8080',
    'http://100.101.102.103',
  ]) {
    assert.equal(isLocalAddress(url), true, url);
  }
  for (const url of ['https://live.example.org', 'http://8.8.8.8:8080', 'http://172.32.0.1']) {
    assert.equal(isLocalAddress(url), false, url);
  }
});

test('normalization: defaults, trimmed token, unknown choices', () => {
  assert.deepEqual(normalizeConfig({}), {
    url: '',
    adminPassword: '',
    accessToken: '',
    pollIntervalMs: 30_000,
    language: 'fr',
  });
  const config = normalizeConfig({
    url: 'nope://',
    admin_password: ' pw ',
    access_token: ' token\n',
    poll_interval: '7',
    language: 'it',
  });
  assert.equal(config.url, null);
  assert.equal(config.adminPassword, ' pw ');
  assert.equal(config.accessToken, 'token');
  assert.equal(config.pollIntervalMs, 30_000);
  assert.equal(config.language, 'fr');
});
