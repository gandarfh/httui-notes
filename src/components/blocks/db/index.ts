/**
 * DB block public exports.
 *
 * The legacy TipTap NodeView (`DbBlockView` + `node.ts`) was removed after
 * stage 9 of the db-block-redesign — the current fenced-block path owns
 * rendering via `cm-db-block.tsx` and `DbFencedPanel`. The registry-based
 * flow lived on for HTTP / E2E blocks only; `db-*` bypasses it entirely.
 */

export type {
  DbBlockData,
  DbResponse,
  DbResult,
  DbColumn,
  DbRow,
  DbMessage,
  DbStats,
  CellValue,
} from "./types";
export {
  normalizeDbResponse,
  firstSelectResult,
  isSelectResult,
  isMutationResult,
  isErrorResult,
  isDbResponse,
} from "./types";
