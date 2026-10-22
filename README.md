# Owncast for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that brings an [Owncast](https://owncast.online) server — self-hosted live
streaming with chat — into Gladys.

- **One device**: live or not, viewers, peak viewers, stream title, live
  duration in minutes; with the admin password, the incoming bitrate and
  resolution.
- **Scene triggers**: a live starts (with its title), a live ends (with its
  duration and peak), the viewers reach a threshold (1 to 1000, once per
  live).
- **Scene actions**: stream status (with a ready-made sentence), send a
  system message to the chat (with an Owncast access token).
- **Dashboard widget**: live or offline, title, viewers, peak and duration, or
  the last live; a Watch button for an https:// server.
- Texts in English, French, German and Spanish.

Tested against a real Owncast in Docker (0.3.0, October 2026) with a test
pattern streamed by ffmpeg. Feedback welcome on
[the issues](https://github.com/guim31/gladys-owncast/issues).

## Requirements

- Gladys Assistant 5.1.0 or later.
- An Owncast server reachable from Gladys, at home (port 8080 by default) or
  on the Internet (https://).
- Optional: the Owncast admin password; an Owncast access token with the right
  to send system messages.

## Installation

In Gladys, open **Integrations → Install from GitHub** and enter
`https://github.com/guim31/gladys-owncast`. Then open its configuration, enter
the address of Owncast, and add the device from the Discover tab.

The full guide: [docs/en.md](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)).

## How it works

The container reads the public `GET /api/status` at the chosen interval (30
seconds by default), `GET /api/config` (server name, hidden viewer count)
every 10 minutes, and `GET /api/admin/status` when the admin password is set.
It publishes the states of the device when they change and fires the scene
events on the transitions. A live ends once Owncast has been offline for one
minute, so a broadcaster that reconnects does not end it. The live in progress
is kept in `/data`: a restart neither announces it again nor loses its end.
Chat messages go through `POST /api/integrations/chat/system`. Redirects are
not followed, so the credentials are never sent to another host.

## Limits

- One Owncast server per configuration.
- The peak is measured at each reading; with the admin password, Owncast's own
  peak is used too.
- When Owncast hides the viewer count, the viewers need the admin password.
- A self-signed HTTPS certificate is not accepted (use `http://` on the local
  network).

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

See [CLAUDE.md](CLAUDE.md) for the project rules and the notes on the Owncast
API.

## Credits

- [Owncast](https://github.com/owncast/owncast) by Gabe Kangas and
  contributors (MIT): the API answers in `test/fixtures/owncast` come from its
  Docker image; the logo on the cover is its official logo
  (`web/assets/images/logo.svg` of its repository, MIT).
- Built from the official
  [Gladys integration template](https://github.com/GladysAssistant/integration-template-js)
  and on the architecture of
  [gladys-gatus](https://github.com/guim31/gladys-gatus).

Not affiliated with Owncast or its authors.

## License

Apache-2.0, see [LICENSE](LICENSE).
