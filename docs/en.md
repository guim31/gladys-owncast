# Owncast

[Owncast](https://owncast.online) is a self-hosted live streaming server: your
own Twitch, with its chat. This integration brings your Owncast into Gladys:
whether you are live, how many people watch, the title of the stream, and
scenes that react when a live starts, ends, or reaches a number of viewers.
Scenes can also write in the chat.

Owncast can run at home or on a rented server: the integration works with
both (the device badge says "local" or "cloud" from the address).

Tested against a real Owncast in Docker (version 0.3.0, October 2026), with a
test pattern streamed by ffmpeg: going live, viewers, the end of the live, the
admin status, a chat message. Feedback welcome on
[the issues](https://github.com/guim31/gladys-owncast/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- An Owncast server reachable from Gladys (port 8080 by default, or its
  https:// address).
- Optional: the password of the Owncast admin, for the incoming bitrate and
  resolution, and the viewers when Owncast hides them.
- Optional: an Owncast access token, to write in the chat from a scene.

## Getting started

### 1. Find the address of Owncast

It is the address of the page your viewers open, for example
`http://192.168.1.2:8080` or `https://live.example.org`. A URL copied from the
browser works too (`…/admin`): the integration keeps the start of it.

### 2. Configure the integration

In Gladys, open the integration and fill in:

- **Owncast address**.
- **Admin password (optional)**: the one you use to open `/admin` (user
  `admin`). It adds two features to the device: incoming bitrate and incoming
  resolution.
- **Access token (optional)**: in Owncast, open Admin → Integrations → Access
  Tokens, create a token with the right to send system messages, and paste it
  here. Only for the action "Send a message to the chat".
- **Refresh interval**: 30 seconds by default. One light request each time
  (two with the admin password).
- **Language of the names**: the language of the feature names and of the
  scene results.

Then use **Test the connection**: it reads Owncast and says whether you are
live.

### 3. Add the device

Open the **Discover** tab and add the device, named after your server. If you
enter the admin password later, the tab offers to update the device with the
two new features.

## The device

| Feature             | What it says                                                 |
| ------------------- | ------------------------------------------------------------ |
| Live                | Yes while you are live                                       |
| Viewers             | People watching right now (0 offline)                        |
| Peak viewers        | The most viewers of the current live, or of the last one     |
| Stream title        | The title set in Owncast                                     |
| Live duration       | Minutes since the live started (0 offline)                   |
| Incoming bitrate    | With the admin password: video bitrate sent by your software |
| Incoming resolution | With the admin password: the resolution sent, e.g. 1920×1080 |

A live ends once Owncast has been offline for one minute: when your
broadcasting software reconnects after a short network cut, the live goes on. A later reconnection, even between two readings, ends the live and starts a new one.

## Dashboard

The **Owncast stream** widget shows the title, then live or offline. Live: the
viewers, the peak and the minutes, and the incoming resolution and bitrate with
the admin password. Offline: the length and peak of the last live. The
**Refresh** button reads Owncast at once; the **Watch** button opens the
stream page when its address is https://.

## Scenes

### Triggers

- **A live starts**: with the stream title and the server name.
- **A live ends**: with the title, the duration in minutes and the peak of
  viewers.
- **Viewers reach a threshold**: choose 1, 5, 10, 25, 50, 100, 250, 500 or
  1000; fires once per live when the viewers reach it. 1 means "someone is
  watching".

The start, the end and the thresholds are kept in the integration: a restart
of Gladys during a live does not announce it again, and a live that ended
while Gladys was stopped is still announced, once.

### Actions

- **Stream status**: reads the stream for the next actions: live or not,
  title, viewers, peak, duration in minutes, and a ready-made sentence ("My
  stream: Live, "Saturday build", 12 viewer(s), for 45 min").
- **Send a message to the chat**: posts a system message in the chat of the
  stream. Needs the access token of the configuration.

### Scene ideas

- **On air light**: "A live starts" turns the lamp by the office door red;
  "A live ends" turns it off.
- **Do not disturb**: "A live starts" mutes the doorbell chime; when someone
  rings anyway, "Send a message to the chat" tells the viewers you are back in
  2 minutes.
- **Audience**: "Viewers reach a threshold" (50) sends you a notification with
  the title; "A live ends" sends the duration and the peak.

## Troubleshooting

- **Owncast does not answer**: check the address and the port from the
  machine running Gladys.
- **No Owncast at this address**: the address points to another service, or
  to a sub-path that is not Owncast.
- **The address redirects**: enter the https:// address.
- **Admin password refused by Owncast**: enter the password of `/admin`; the
  live state is still read meanwhile.
- **Access token refused**: create the token again with the right to send
  system messages.
- **Viewers stay at 0 while you are live**: Owncast may hide the viewer count
  (Admin → Configuration); enter the admin password to read it anyway.

## Limits

- One Owncast server per integration.
- The duration and the peak are measured by the integration; a peak between
  two readings is caught by the admin status only.
- Developed for Owncast 0.1 and later; tested on 0.3.0.
- While Owncast does not answer, the device keeps its last state; a live cut meanwhile ends at the last reading that saw it.
- When Owncast hides the viewers and the admin password is not set, the viewers and the peak read 0 in the scenes.
- Not affiliated with the Owncast project.
