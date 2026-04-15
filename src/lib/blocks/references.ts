export interface Reference {
  raw: string;
  alias: string;
  path: string[];
  start: number;
  end: number;
}

export interface BlockContext {
  alias: string;
  pos: number;
  content: string;
  cachedResult: {
    status: string;
    response: string;
  } | null;
}

export interface ReferenceError {
  raw: string;
  message: string;
}

const REF_REGEX = /\{\{([^}]+)\}\}/g;

/**
 * Extract all {{...}} references from text.
 */
export function parseReferences(text: string): Reference[] {
  const refs: Reference[] = [];
  let match: RegExpExecArray | null;
  REF_REGEX.lastIndex = 0;

  while ((match = REF_REGEX.exec(text)) !== null) {
    const inner = match[1].trim();
    const parts = inner.split(".");
    const alias = parts[0];
    const path = parts.slice(1);

    refs.push({
      raw: match[0],
      alias,
      path,
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return refs;
}

/**
 * Navigate a JSON value by dot-notation path.
 * Supports array indexing: "items.0.id"
 */
export function navigateJson(data: unknown, path: string[]): unknown {
  let current = data;

  for (const key of path) {
    if (current == null) {
      throw new Error(`Cannot access "${key}" on null/undefined`);
    }

    if (Array.isArray(current)) {
      const index = parseInt(key, 10);
      if (isNaN(index)) {
        throw new Error(`Expected numeric index for array, got "${key}"`);
      }
      if (index < 0 || index >= current.length) {
        throw new Error(`Index ${index} out of bounds (length: ${current.length})`);
      }
      current = current[index];
    } else if (typeof current === "object") {
      const obj = current as Record<string, unknown>;
      if (!(key in obj)) {
        throw new Error(`Key "${key}" not found. Available: ${Object.keys(obj).join(", ")}`);
      }
      current = obj[key];
    } else {
      throw new Error(`Cannot access "${key}" on ${typeof current}`);
    }
  }

  return current;
}

/**
 * Resolve a single reference against block contexts.
 */
export function resolveReference(
  ref: Reference,
  blocks: BlockContext[],
  currentPos: number,
): string {
  const block = blocks.find((b) => b.alias === ref.alias);

  if (!block) {
    throw new Error(`Alias "${ref.alias}" not found in document`);
  }

  if (block.pos >= currentPos) {
    throw new Error(`Alias "${ref.alias}" is below current block (blocks can only reference blocks above)`);
  }

  if (!block.cachedResult) {
    throw new Error(`Alias "${ref.alias}" has no cached result. Run it first.`);
  }

  let responseData: unknown;
  try {
    responseData = JSON.parse(block.cachedResult.response);
  } catch {
    throw new Error(`Alias "${ref.alias}" has invalid cached response`);
  }

  // Build the navigation context: { response: parsedData, status: "success" }
  const context: Record<string, unknown> = {
    response: responseData,
    status: block.cachedResult.status,
  };

  const value = navigateJson(context, ref.path);

  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Resolve all {{...}} references in text.
 * Returns resolved text and any errors (does not abort on first error).
 */
export function resolveAllReferences(
  text: string,
  blocks: BlockContext[],
  currentPos: number,
): { resolved: string; errors: ReferenceError[] } {
  const refs = parseReferences(text);
  if (refs.length === 0) {
    return { resolved: text, errors: [] };
  }

  const errors: ReferenceError[] = [];
  let resolved = text;

  // Replace from end to start to preserve positions
  for (let i = refs.length - 1; i >= 0; i--) {
    const ref = refs[i];
    try {
      const value = resolveReference(ref, blocks, currentPos);
      resolved = resolved.slice(0, ref.start) + value + resolved.slice(ref.end);
    } catch (err) {
      errors.push({
        raw: ref.raw,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { resolved, errors };
}
