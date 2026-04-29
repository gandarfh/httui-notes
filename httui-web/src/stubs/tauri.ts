// Stub for @tauri-apps/api/* — all Tauri IPC calls are no-ops in the landing page
export function invoke() {
  return Promise.resolve(null);
}
export function listen() {
  return Promise.resolve(() => {});
}
export function emit() {}
export class Channel {
  onmessage = () => {};
}
export function Command() {}

// @tauri-apps/plugin-dialog
export function open() {
  return Promise.resolve(null);
}
export function save() {
  return Promise.resolve(null);
}

// @tauri-apps/plugin-fs
export function writeFile() {
  return Promise.resolve();
}
export function readFile() {
  return Promise.resolve(new Uint8Array());
}

// @tauri-apps/api/core extras
export function convertFileSrc(path: string) {
  return path;
}

// @tauri-apps/api/webview
export function getCurrentWebview() {
  return { onDragDropEvent: () => Promise.resolve(() => {}) };
}
