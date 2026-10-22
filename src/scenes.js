// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// "Is the stream live?" is already a scene condition on the device feature.
// The actions are about what a condition cannot do: put the stream in a
// message ("My stream: Live, "Saturday build", 12 viewer(s), for 45 min"), and
// talk to the viewers — a system message in the chat of the stream (an
// Owncast access token in the configuration).
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  async get_stream_status(hub) {
    // An error of the last reading is not final: read again first.
    if (!hub.client) {
      hub.assertReadable();
    }
    await hub.refreshIfStale();
    hub.assertReadable();
    const view = hub.view();
    return {
      live: view.live,
      title: view.title,
      viewers: view.viewers ?? 0,
      peak_viewers: view.peak ?? 0,
      duration_minutes: view.durationMinutes,
      sentence: hub.sentence(hub.config.language),
    };
  },

  async send_chat_message(hub, { fields = {} }) {
    await hub.sendChatMessage(fields.message);
  },
};
