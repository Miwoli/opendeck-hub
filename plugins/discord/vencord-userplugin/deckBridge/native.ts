/*
 * DeckBridge - Vencord userplugin for opendeck-hub (com.miwoli.discord)
 * Copyright (c) 2026 Miwoli
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Main-process half (Electron, full Node). Owns a Unix socket for the OpenDeck plugin and relays:
//   deck -> socket -> here -> renderer (executeJavaScript into the plugin's onCommand)
//   renderer -> publishState() -> here -> every connected deck client
// Protocol: one JSON object per line. Deck sends {"cmd": "..."}; we send {"state": {...}}.

import type { IpcMainInvokeEvent, WebContents } from "electron";
import { chmodSync, existsSync, unlinkSync } from "fs";
import { createServer, Server, Socket } from "net";
import { join } from "path";

const COMMANDS = new Set(["toggleMute", "toggleDeafen", "pttDown", "pttUp", "getState"]);
const MAX_LINE = 4096;

let server: Server | null = null;
let renderer: WebContents | null = null;
let lastState = "";
const clients = new Set<Socket>();

function socketPath(): string {
    const dir = process.env.XDG_RUNTIME_DIR || `/tmp/opendeck-${process.getuid?.() ?? "user"}`;
    return join(dir, "opendeck-discord.sock");
}

function send(client: Socket, line: string) {
    if (!client.destroyed) client.write(line + "\n");
}

function forward(cmd: string) {
    if (!renderer || renderer.isDestroyed()) return;
    // cmd is validated against COMMANDS, so it is safe to embed
    renderer.executeJavaScript(`Vencord.Plugins.plugins.DeckBridge.onCommand(${JSON.stringify(cmd)})`).catch(() => { });
}

function handleClient(client: Socket) {
    clients.add(client);
    let buffer = "";
    client.setEncoding("utf8");
    if (lastState) send(client, lastState);
    client.on("data", (chunk: string) => {
        buffer += chunk;
        if (buffer.length > MAX_LINE) {
            client.destroy();
            return;
        }
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            try {
                const msg = JSON.parse(line);
                const cmd = msg && typeof msg.cmd === "string" ? msg.cmd : null;
                if (!cmd || !COMMANDS.has(cmd)) continue;
                if (cmd === "getState") {
                    if (lastState) send(client, lastState);
                } else {
                    forward(cmd);
                }
            } catch {
                // ignore malformed lines
            }
        }
    });
    const drop = () => clients.delete(client);
    client.on("close", drop);
    client.on("error", drop);
}

export function start(e: IpcMainInvokeEvent) {
    renderer = e.sender;
    if (server) return socketPath();
    const path = socketPath();
    // a stale socket file from a crashed Vesktop would make listen() fail
    if (existsSync(path)) {
        try { unlinkSync(path); } catch { }
    }
    server = createServer(handleClient);
    server.on("error", err => console.error("[DeckBridge] socket error", err));
    server.listen(path, () => {
        try { chmodSync(path, 0o600); } catch { }
    });
    return path;
}

export function stop() {
    for (const c of clients) c.destroy();
    clients.clear();
    server?.close();
    server = null;
    renderer = null;
    lastState = "";
    try { unlinkSync(socketPath()); } catch { }
}

export function publishState(_e: IpcMainInvokeEvent, state: unknown) {
    const line = JSON.stringify({ state });
    if (line === lastState) return;
    lastState = line;
    for (const c of clients) send(c, line);
}
