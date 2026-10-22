# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-22

### Added

- The Owncast server as a Gladys device: live or not, viewers, peak viewers,
  stream title, live duration; with the admin password, the incoming bitrate
  and resolution.
- Scene triggers: a live starts, a live ends (with its duration and peak), the
  viewers reach a threshold (once per live). A broadcaster that reconnects
  within a minute does not end the live.
- Scene actions: stream status with a ready-made sentence, and a system
  message sent to the chat (with an Owncast access token).
- The "Owncast stream" dashboard widget.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-owncast/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-owncast/releases/tag/v1.0.0
