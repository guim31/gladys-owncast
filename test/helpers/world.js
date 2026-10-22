// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Owncast, a temporary
// /data and a manual clock, with the integration wired on top through
// registerHandlers. No timer runs: the tests read Owncast with
// `world.hub.pollNow()`. (Adapted from guim31/gladys-gatus.)
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { serverIds } from '../../src/devices.js';
import { Store } from '../../src/store.js';
import { ADMIN_PASSWORD, BASE, FakeOwncast, TOKEN } from './fakeOwncast.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

/** A manual clock, shared by the hub, the fake Owncast and the tests. */
export function createClock(start = Date.UTC(2026, 9, 22, 18, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export async function createWorld({
  clock = createClock(),
  owncast,
  config = { url: BASE, language: 'en' },
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-owncast-')),
  timings = {},
  timers = false,
} = {}) {
  const server = owncast ?? new FakeOwncast({ now: clock.now });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: server.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, owncast: server, app, hub: app.hub, clock, dataDir };
}

/** The external ids of the server device. */
export const idsOf = (world) => serverIds(world.gladys);

/** Add the discovered device in Gladys, as the user would. */
export async function createDevice(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export { ADMIN_PASSWORD, BASE, FakeOwncast, TOKEN };
