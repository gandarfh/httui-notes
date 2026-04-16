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

// --- Session restore (single IPC call) ---

export interface SessionTabContent {
  file_path: string;
  vault_path: string;
  content: string | null;
}

export interface SessionState {
  vaults: string[];
  active_vault: string | null;
  vim_enabled: boolean;
  pane_layout: string | null;
  active_pane_id: string | null;
  active_file: string | null;
  scroll_positions: string | null;
  file_tree: FileEntry[];
  tab_contents: SessionTabContent[];
}

export function restoreSession(): Promise<SessionState> {
  return invoke("restore_session");
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

export interface ContentSearchResult {
  file_path: string;
  snippet: string;
}

export function rebuildSearchIndex(vaultPath: string): Promise<void> {
  return invoke("rebuild_search_index", { vaultPath });
}

export function searchContent(query: string): Promise<ContentSearchResult[]> {
  return invoke("search_content", { query });
}

export function updateSearchEntry(
  filePath: string,
  content: string,
): Promise<void> {
  return invoke("update_search_entry", { filePath, content });
}

// --- Environments ---

export interface Environment {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface EnvVariable {
  id: string;
  environment_id: string;
  key: string;
  value: string;
  is_secret: boolean;
  created_at: string;
}

export function listEnvironments(): Promise<Environment[]> {
  return invoke("list_environments");
}

export function createEnvironment(name: string): Promise<Environment> {
  return invoke("create_environment", { name });
}

export function deleteEnvironment(id: string): Promise<void> {
  return invoke("delete_environment", { id });
}

export function duplicateEnvironment(
  sourceId: string,
  newName: string,
): Promise<Environment> {
  return invoke("duplicate_environment", { sourceId, newName });
}

export function setActiveEnvironment(id: string | null): Promise<void> {
  return invoke("set_active_environment", { id });
}

export function listEnvVariables(environmentId: string): Promise<EnvVariable[]> {
  return invoke("list_env_variables", { environmentId });
}

export function setEnvVariable(
  environmentId: string,
  key: string,
  value: string,
  isSecret?: boolean,
): Promise<EnvVariable> {
  return invoke("set_env_variable", { environmentId, key, value, isSecret });
}

export function deleteEnvVariable(id: string): Promise<void> {
  return invoke("delete_env_variable", { id });
}

// --- Block execution ---

export interface BlockResult {
  status: string;
  data: Record<string, unknown>;
  duration_ms: number;
}

export function executeBlock(
  blockType: string,
  params: unknown,
): Promise<BlockResult> {
  return invoke("execute_block", { blockType, params });
}

// --- Block result cache ---

export interface CachedBlockResult {
  status: string;
  response: string;
  total_rows: number | null;
  elapsed_ms: number;
  executed_at: string;
}

export function getBlockResult(
  filePath: string,
  blockHash: string,
): Promise<CachedBlockResult | null> {
  return invoke("get_block_result", { filePath, blockHash });
}

export function saveBlockResult(
  filePath: string,
  blockHash: string,
  status: string,
  response: string,
  elapsedMs: number,
  totalRows?: number | null,
): Promise<void> {
  return invoke("save_block_result", {
    filePath,
    blockHash,
    status,
    response,
    elapsedMs,
    totalRows: totalRows ?? null,
  });
}
