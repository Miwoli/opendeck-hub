/*
 * DeckBridge - Vencord userplugin for opendeck-hub (com.miwoli.discord)
 * Copyright (c) 2026 Miwoli
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Renderer half: reads Discord's own voice state and runs the same audio actions as Discord's UI,
// so mute/deafen from the deck are visible to everyone in the call.
// Verified in a running Vesktop 1.6.7: findByProps("toggleSelfMute",
// "toggleSelfDeaf") exposes toggleSelfMute(), toggleSelfDeaf(), setSelfMute(e, t), setTemporarySelfMute(e).

import { Logger } from "@utils/Logger";
import definePlugin, { PluginNative } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { MediaEngineStore, SelectedChannelStore, UserStore, VoiceStateStore } from "@webpack/common";

const Native = VencordNative.pluginHelpers.DeckBridge as PluginNative<typeof import("./native")>;
const AudioActions: { toggleSelfMute(): void; toggleSelfDeaf(): void; } = findByPropsLazy("toggleSelfMute", "toggleSelfDeaf");
const logger = new Logger("DeckBridge");

// set when PTT unmuted the mic, so release only re-mutes what PTT itself changed
let pttUnmuted = false;
let publishTimer: ReturnType<typeof setTimeout> | null = null;

function readState() {
    const me = UserStore.getCurrentUser();
    const voice = me ? VoiceStateStore.getVoiceStateForUser(me.id) : undefined;
    return {
        inVoice: Boolean(SelectedChannelStore.getVoiceChannelId()),
        selfMute: MediaEngineStore.isSelfMute(),
        selfDeaf: MediaEngineStore.isSelfDeaf(),
        serverMute: Boolean(voice?.mute),
        serverDeaf: Boolean(voice?.deaf),
        mode: MediaEngineStore.getMode(),
        ptt: pttUnmuted,
    };
}

// flux handlers can run before the stores apply the change, so read on the next tick
function schedulePublish() {
    if (publishTimer) return;
    publishTimer = setTimeout(() => {
        publishTimer = null;
        try {
            Native.publishState(readState());
        } catch (err) {
            logger.error("publishState failed", err);
        }
    }, 0);
}

export default definePlugin({
    name: "DeckBridge",
    description: "Lets the opendeck-hub Stream Deck plugin (com.miwoli.discord) mute, deafen and push-to-talk over a local Unix socket.",
    authors: [{ name: "Miwoli", id: 0n }],

    flux: {
        AUDIO_TOGGLE_SELF_MUTE: schedulePublish,
        AUDIO_TOGGLE_SELF_DEAF: schedulePublish,
        AUDIO_SET_SELF_MUTE: schedulePublish,
        AUDIO_SET_TEMPORARY_SELF_MUTE: schedulePublish,
        AUDIO_SET_MODE: schedulePublish,
        VOICE_CHANNEL_SELECT: schedulePublish,
        VOICE_STATE_UPDATES: schedulePublish,
        RTC_CONNECTION_STATE: schedulePublish,
    },

    async start() {
        const path = await Native.start();
        logger.info("listening on", path);
        schedulePublish();
    },

    stop() {
        if (publishTimer) clearTimeout(publishTimer);
        publishTimer = null;
        pttUnmuted = false;
        Native.stop();
    },

    /** Called from native.ts via executeJavaScript with a command validated there. */
    onCommand(cmd: string) {
        try {
            const muted = MediaEngineStore.isSelfMute();
            switch (cmd) {
                case "toggleMute":
                    pttUnmuted = false;
                    AudioActions.toggleSelfMute();
                    break;
                case "toggleDeafen":
                    pttUnmuted = false;
                    AudioActions.toggleSelfDeaf();
                    break;
                case "pttDown":
                    if (muted) {
                        pttUnmuted = true;
                        AudioActions.toggleSelfMute();
                    }
                    break;
                case "pttUp":
                    if (pttUnmuted && !muted) AudioActions.toggleSelfMute();
                    pttUnmuted = false;
                    break;
            }
        } catch (err) {
            logger.error(`command ${cmd} failed`, err);
        }
        schedulePublish();
    },
});
