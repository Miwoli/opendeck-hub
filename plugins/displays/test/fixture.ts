// kscreen-doctor -j shape from a real two-output setup, trimmed to the fields the plugin reads.
export function kscreenJson(state: { dp: boolean; hdmi: boolean; hdmiConnected?: boolean; dpPriority?: number; hdmiPriority?: number }): object {
  return {
    outputs: [
      {
        id: 1, name: 'DP-2', connected: true, enabled: state.dp, pos: { x: 0, y: 631 }, size: { width: 3440, height: 1440 },
        scale: 1, priority: state.dp ? (state.dpPriority ?? 1) : 0, currentModeId: '2',
        modes: [{ id: '1', name: '3440x1440@60' }, { id: '2', name: '3440x1440@240' }],
      },
      {
        id: 2, name: 'HDMI-A-1', connected: state.hdmiConnected ?? true, enabled: state.hdmi, pos: { x: 3440, y: 0 },
        size: { width: 2560, height: 2880 }, scale: 1.1, priority: state.hdmi ? (state.hdmiPriority ?? 2) : 0, currentModeId: '33',
        modes: [{ id: '33', name: '2560x2880@60' }],
      },
      { id: 3, name: 'bad name; rm -rf', connected: true, enabled: true },
    ],
  };
}
