import { invoke } from "@tauri-apps/api/core";

// --- Types ---

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileEntry[] | null;
}

// --- Config ---

export function getConfig(key: string): Promise<string | null> {
  return invoke("get_config", { key });
}

export function setConfig(key: string, value: string): Promise<void> {
  return invoke("set_config", { key, value });
}

// --- Filesystem ---

export function listWorkspace(vaultPath: string): Promise<FileEntry[]> {
  return invoke("list_workspace", { vaultPath });
}

export function readNote(
  vaultPath: string,
  filePath: string,
): Promise<string> {
  return invoke("read_note", { vaultPath, filePath });
}

export function writeNote(
  vaultPath: string,
  filePath: string,
  content: string,
): Promise<void> {
  return invoke("write_note", { vaultPath, filePath, content });
}

export function createNote(
  vaultPath: string,
  filePath: string,
): Promise<void> {
  return invoke("create_note", { vaultPath, filePath });
}

export function deleteNote(
  vaultPath: string,
  filePath: string,
): Promise<void> {
  return invoke("delete_note", { vaultPath, filePath });
}

export function renameNote(
  vaultPath: string,
  oldPath: string,
  newPath: string,
): Promise<void> {
  return invoke("rename_note", { vaultPath, oldPath, newPath });
}

export function createFolder(
  vaultPath: string,
  folderPath: string,
): Promise<void> {
  return invoke("create_folder", { vaultPath, folderPath });
}

// --- Vault management ---

export async function listVaults(): Promise<string[]> {
  const raw = await getConfig("vaults");
  if (!raw) return [];
  return JSON.parse(raw) as string[];
}

export async function addVault(path: string): Promise<void> {
  const vaults = await listVaults();
  if (!vaults.includes(path)) {
    vaults.push(path);
    await setConfig("vaults", JSON.stringify(vaults));
  }
}

export async function removeVault(path: string): Promise<void> {
  const vaults = await listVaults();
  const filtered = vaults.filter((v) => v !== path);
  await setConfig("vaults", JSON.stringify(filtered));
}

export async function getActiveVault(): Promise<string | null> {
  return getConfig("active_vault");
}

export async function setActiveVault(path: string): Promise<void> {
  await addVault(path);
  await setConfig("active_vault", path);
}

// --- File watcher ---

export function startWatching(vaultPath: string): Promise<void> {
  return invoke("start_watching", { vaultPath });
}

export function stopWatching(): Promise<void> {
  return invoke("stop_watching");
}

// --- Search ---

export interface SearchResult {
  path: string;
  name: string;
  score: number;
}

export function searchFiles(
  vaultPath: string,
  query: string,
): Promise<SearchResult[]> {
  return invoke("search_files", { vaultPath, query });
}
