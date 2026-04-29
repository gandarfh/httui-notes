#!/usr/bin/env bash
# scripts/coverage-check.sh
#
# Touched-files coverage gate. For each .rs/.ts/.tsx file changed in
# the configured diff range, require ≥80% line coverage on that file
# as a whole.
#
# Usage:
#   scripts/coverage-check.sh                # diff: HEAD~1..HEAD
#   BASE_REF=origin/main scripts/coverage-check.sh   # diff: origin/main...HEAD
#   MODE=report scripts/coverage-check.sh    # never exit non-zero
#
# Files with `// coverage:exclude file` on line 1 are reported as
# EXCLUDED and don't count against the gate.
#
# Exits 0 when every touched file meets the threshold (or there are
# no touched code files). Exits 1 otherwise (unless MODE=report).

set -euo pipefail

THRESHOLD="${THRESHOLD:-80}"
MODE="${MODE:-enforce}"
BASE_REF="${BASE_REF:-}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# ---------- changed file set --------------------------------------------------

if [ -n "$BASE_REF" ]; then
    DIFF_RANGE="$BASE_REF...HEAD"
else
    DIFF_RANGE="HEAD~1..HEAD"
fi

if ! git rev-parse --verify HEAD~1 >/dev/null 2>&1 && [ -z "$BASE_REF" ]; then
    echo "coverage-check: only one commit in branch; nothing to check"
    exit 0
fi

CHANGED_FILES=()
while IFS= read -r line; do
    [ -n "$line" ] && CHANGED_FILES+=("$line")
done < <(git diff --name-only "$DIFF_RANGE" 2>/dev/null \
    | grep -E '\.(rs|ts|tsx)$' \
    | grep -v -E '/(__tests__|tests)/' \
    | grep -v -E '\.(test|spec|browser\.test|browser\.spec)\.(ts|tsx)$' \
    | grep -v -E '/test/' \
    || true)

if [ ${#CHANGED_FILES[@]} -eq 0 ]; then
    echo "coverage-check: no .rs/.ts/.tsx changes; gate skipped"
    exit 0
fi

# Filter out files that have been deleted in the working copy
KEPT=()
for f in "${CHANGED_FILES[@]}"; do
    [ -f "$f" ] && KEPT+=("$f")
done
CHANGED_FILES=("${KEPT[@]}")

if [ ${#CHANGED_FILES[@]} -eq 0 ]; then
    echo "coverage-check: all touched files were deleted; gate skipped"
    exit 0
fi

HAS_RS=0
HAS_FE=0
for f in "${CHANGED_FILES[@]}"; do
    case "$f" in
        *.rs) HAS_RS=1 ;;
        *.ts | *.tsx) HAS_FE=1 ;;
    esac
done

# ---------- run coverage tools ------------------------------------------------

mkdir -p target/coverage

RUST_LCOV=target/coverage/rust.lcov
FE_LCOV=httui-desktop/coverage/lcov.info

if [ "$HAS_RS" -eq 1 ]; then
    if ! command -v cargo-llvm-cov >/dev/null 2>&1; then
        echo "coverage-check: cargo-llvm-cov is not installed."
        echo "  rustup component add llvm-tools-preview"
        echo "  cargo install cargo-llvm-cov"
        exit 2
    fi
    echo "coverage-check: running cargo llvm-cov ..."
    cargo llvm-cov --workspace --lcov --output-path "$RUST_LCOV" >/dev/null
fi

if [ "$HAS_FE" -eq 1 ]; then
    echo "coverage-check: running vitest --coverage ..."
    (cd httui-desktop && npm run --silent test -- --project unit --coverage \
        --coverage.reporter=lcov --coverage.reporter=text-summary >/dev/null)
fi

# ---------- per-file lcov parser ---------------------------------------------

# extract_coverage <lcov_file> <repo_relative_path>
# Prints the line coverage percentage with 1 decimal, or "N/A" if the
# file is not present in the report.
extract_coverage() {
    local lcov="$1" target="$2"
    local abs
    abs="$(cd "$REPO_ROOT" && readlink -f "$target" 2>/dev/null || echo "$target")"

    awk -v t="$target" -v abs="$abs" '
        /^SF:/ {
            sf = substr($0, 4)
            match_now = (sf == t || sf == abs || sf ~ "(^|/)" t "$")
            lf = 0; lh = 0
        }
        /^LF:/ { if (match_now) lf = substr($0, 4) }
        /^LH:/ { if (match_now) lh = substr($0, 4) }
        /^end_of_record/ {
            if (match_now && lf > 0) {
                printf("%.1f\n", (lh / lf) * 100)
                exit
            }
            match_now = 0
        }
    ' "$lcov"
}

# ---------- evaluate ---------------------------------------------------------

printf "\n%-70s  %-9s  %-7s\n" "FILE" "COVERAGE" "STATUS"
printf "%-70s  %-9s  %-7s\n" "----" "--------" "------"

FAILED=0
for f in "${CHANGED_FILES[@]}"; do
    # Escape hatch
    if head -n 1 "$f" 2>/dev/null | grep -q "coverage:exclude file"; then
        printf "%-70s  %-9s  %-7s\n" "$f" "—" "EXCLUDED"
        continue
    fi

    case "$f" in
        *.rs) lcov="$RUST_LCOV" ;;
        *.ts | *.tsx) lcov="$FE_LCOV" ;;
        *) continue ;;
    esac

    if [ ! -f "$lcov" ]; then
        printf "%-70s  %-9s  %-7s\n" "$f" "?" "NO REPORT"
        FAILED=1
        continue
    fi

    pct="$(extract_coverage "$lcov" "$f" || echo "N/A")"
    if [ -z "$pct" ] || [ "$pct" = "N/A" ]; then
        printf "%-70s  %-9s  %-7s\n" "$f" "N/A" "MISSING"
        FAILED=1
        continue
    fi

    # bash arithmetic doesn't do floats; multiply by 10 and compare ints
    pct_int="${pct%.*}${pct##*.}"
    threshold_int="$((THRESHOLD * 10))"
    if [ "$pct_int" -ge "$threshold_int" ]; then
        printf "%-70s  %-9s  %-7s\n" "$f" "$pct%" "PASS"
    else
        printf "%-70s  %-9s  %-7s\n" "$f" "$pct%" "FAIL"
        FAILED=1
    fi
done

echo
if [ "$FAILED" -eq 0 ]; then
    echo "coverage-check: all touched files meet ${THRESHOLD}% line coverage."
    exit 0
fi

echo "coverage-check: at least one touched file is below ${THRESHOLD}% line coverage."
echo "  - Add tests until the file reaches the threshold, OR"
echo "  - Add '// coverage:exclude file' on line 1 (use sparingly; document in tech-debt.md)"

if [ "$MODE" = "report" ]; then
    echo "  (MODE=report — exiting 0)"
    exit 0
fi

exit 1
