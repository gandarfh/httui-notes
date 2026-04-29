// coverage:exclude file — Pure `invoke()` wrappers + IPC type
// declarations. Testing these is testing the mock harness; the real
// behavior lives in the backend. Documented in tech-debt.md and
// audit-002.

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

// --- File-backed vault config (epic 09 foundation) ---
//
// These wrap the new `WorkspaceStore` / `UserStore` surface in
// `httui-core::vault_config`. The frontend keeps using the legacy
// `getConfig`/`setConfig` for prefs until epic 19 cuts the settings
// store over.

/** `[defaults]` section of `<vault>/.httui/workspace.toml`. */
export interface WorkspaceDefaults {
  environment?: string | null;
  git_remote?: string | null;
  git_branch?: string | null;
}

/** `[ui]` section of `~/.config/httui/user.toml`. */
export interface UserUiPrefs {
  theme: string;
  font_family: string;
  font_size: number;
  density: string;
}

/** `[secrets]` section. */
export interface UserSecretsBackend {
  backend: string;
  biometric: boolean;
  prompt_timeout_s: number;
}

/** Whole `~/.config/httui/user.toml` document (per-machine). */
export interface UserConfigFile {
  version: "1";
  ui: UserUiPrefs;
  shortcuts: Record<string, string>;
  secrets: UserSecretsBackend;
  mcp: { servers: Record<string, unknown> };
  active_envs: Record<string, string>;
}

export function getWorkspaceConfig(
  vaultPath: string,
): Promise<WorkspaceDefaults> {
  return invoke("get_workspace_config", { vaultPath });
}

export function setWorkspaceConfig(
  vaultPath: string,
  defaults: WorkspaceDefaults,
): Promise<void> {
  return invoke("set_workspace_config", { vaultPath, defaults });
}

export function getUserConfig(): Promise<UserConfigFile> {
  return invoke("get_user_config");
}

export function setUserConfig(file: UserConfigFile): Promise<void> {
  return invoke("set_user_config", { file });
}

/** Outcome of `ensureVaultGitignore`. */
export type GitignoreOutcome = "created" | "augmented" | "already_present";

export function ensureVaultGitignore(
  vaultPath: string,
): Promise<GitignoreOutcome> {
  return invoke("ensure_vault_gitignore", { vaultPath });
}

// --- Vault migration (epic 12) ---

export interface MigrationReport {
  vault_path: string;
  backup_path: string | null;
  connections_migrated: number;
  connections_skipped: number;
  environments_migrated: number;
  environments_skipped: number;
  variables_migrated: number;
  variables_skipped: number;
  dry_run: boolean;
  notes: string[];
}

export function migrateVaultToV1(
  vaultPath: string,
  dryRun: boolean,
): Promise<MigrationReport> {
  return invoke("migrate_vault_to_v1", { vaultPath, dryRun });
}

// --- Filesystem ---

export function listWorkspace(vaultPath: string): Promise<FileEntry[]> {
  return invoke("list_workspace", { vaultPath });
}

export function readNote(vaultPath: string, filePath: string): Promise<string> {
  return invoke("read_note", { vaultPath, filePath });
}

export function forceReloadFile(
  vaultPath: string,
  filePath: string,
): Promise<void> {
  return invoke("force_reload_file", { vaultPath, filePath });
}

export function writeNote(
  vaultPath: string,
  filePath: string,
  content: string,
): Promise<void> {
  return invoke("write_note", { vaultPath, filePath, content });
}

export function createNote(vaultPath: string, filePath: string): Promise<void> {
  return invoke("create_note", { vaultPath, filePath });
}

export function deleteNote(vaultPath: string, filePath: string): Promise<void> {
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
  sidebar_open: boolean;
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

export function listEnvVariables(
  environmentId: string,
): Promise<EnvVariable[]> {
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

// --- Block run history (Story 24.6) ---

export interface HistoryEntry {
  id: number;
  file_path: string;
  block_alias: string;
  method: string;
  url_canonical: string;
  status: number | null;
  request_size: number | null;
  response_size: number | null;
  elapsed_ms: number | null;
  outcome: string;
  ran_at: string;
}

export interface InsertHistoryEntry {
  file_path: string;
  block_alias: string;
  method: string;
  url_canonical: string;
  status: number | null;
  request_size: number | null;
  response_size: number | null;
  elapsed_ms: number | null;
  outcome: string;
}

export function listBlockHistory(
  filePath: string,
  blockAlias: string,
): Promise<HistoryEntry[]> {
  return invoke("list_block_history", { filePath, blockAlias });
}

export function insertBlockHistory(entry: InsertHistoryEntry): Promise<void> {
  return invoke("insert_block_history", { entry });
}

export function purgeBlockHistory(
  filePath: string,
  blockAlias: string,
): Promise<number> {
  return invoke("purge_block_history", { filePath, blockAlias });
}

// --- Per-block settings (Onda 1) ---
//
// Stored in the SQLite `block_settings` table keyed by (file_path, alias).
// All flags are `undefined` when the user never overrode the default — the
// frontend treats absent values as defaults (true for follow_redirects,
// verify_ssl, encode_url, trim_whitespace; false for history_disabled).

export interface HttpBlockSettings {
  followRedirects?: boolean;
  verifySsl?: boolean;
  encodeUrl?: boolean;
  trimWhitespace?: boolean;
  historyDisabled?: boolean;
}

/** Reads settings; missing row → all-undefined object (use defaults). */
export function getBlockSettings(
  filePath: string,
  blockAlias: string,
): Promise<HttpBlockSettings> {
  return invoke("get_block_settings", { filePath, blockAlias });
}

/** Upserts settings. Pass `undefined` for any flag to revert it to default. */
export function upsertBlockSettings(
  filePath: string,
  blockAlias: string,
  settings: HttpBlockSettings,
): Promise<void> {
  return invoke("upsert_block_settings", { filePath, blockAlias, settings });
}

/** Removes the row entirely. Used as cascade when a block is deleted. */
export function purgeBlockSettings(
  filePath: string,
  blockAlias: string,
): Promise<number> {
  return invoke("purge_block_settings", { filePath, blockAlias });
}

// --- Pinned response examples (Onda 3) ---

export interface BlockExample {
  id: number;
  file_path: string;
  block_alias: string;
  name: string;
  response_json: string;
  saved_at: string;
}

/** Save (or replace by `name`) a response snapshot as an example. */
export function saveBlockExample(
  filePath: string,
  blockAlias: string,
  name: string,
  responseJson: string,
): Promise<number> {
  return invoke("save_block_example", {
    filePath,
    blockAlias,
    name,
    responseJson,
  });
}

/** List examples for a (file, alias), most recent first. */
export function listBlockExamples(
  filePath: string,
  blockAlias: string,
): Promise<BlockExample[]> {
  return invoke("list_block_examples", { filePath, blockAlias });
}

/** Delete a single example by id. */
export function deleteBlockExample(id: number): Promise<number> {
  return invoke("delete_block_example", { id });
}

/** Cascade-delete all examples for a (file, alias). Used when removing a block. */
export function purgeBlockExamples(
  filePath: string,
  blockAlias: string,
): Promise<number> {
  return invoke("purge_block_examples", { filePath, blockAlias });
}
