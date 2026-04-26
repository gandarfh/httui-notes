//! Quick-open state — `Ctrl+P` modal to fuzzy-match a vault file.
//!
//! Two pieces:
//! 1. [`QuickOpen`] — the modal's mutable state (query, candidates,
//!    filtered indices, current selection).
//! 2. [`fuzzy_score`] — a small subsequence matcher with adjacency and
//!    start-of-segment bonuses so `fbm` ranks `FooBar.md` above
//!    `format/buffers/markdown.md`.
//!
//! Why not a crate (`nucleo`, `skim`)? The matcher is ~50 lines and
//! scales well enough for a vault of a few thousand files. We can swap
//! in a real fuzzy lib later if performance bites.

use std::path::PathBuf;

use crate::vim::lineedit::LineEdit;

#[derive(Debug, Default)]
pub struct QuickOpen {
    /// User-typed query — backed by a [`LineEdit`] so cursor navigation
    /// (Left/Right/Home/End) works inside the search box.
    pub query: LineEdit,
    /// All `.md` paths in the vault, relative to the vault root.
    /// Populated on `Ctrl+P`; not refreshed during the session (a
    /// re-open re-scans).
    pub all_files: Vec<String>,
    /// Indices into `all_files`, ordered best → worst score.
    pub filtered: Vec<usize>,
    /// Index into `filtered`. Clamped to `filtered.len() - 1`.
    pub selected: usize,
}

impl QuickOpen {
    /// Replace the candidate set. Call when entering the modal so the
    /// vault scan happens once. Resets query and selection.
    pub fn reset(&mut self, files: Vec<String>) {
        self.all_files = files;
        self.query.clear();
        self.refilter();
    }

    pub fn push_char(&mut self, c: char) {
        self.query.insert_char(c);
        self.refilter();
    }

    pub fn pop_char(&mut self) {
        self.query.delete_before();
        self.refilter();
    }

    pub fn delete_after(&mut self) {
        if self.query.delete_after() {
            self.refilter();
        }
    }

    pub fn move_left(&mut self) {
        self.query.move_left();
    }
    pub fn move_right(&mut self) {
        self.query.move_right();
    }
    pub fn move_home(&mut self) {
        self.query.move_home();
    }
    pub fn move_end(&mut self) {
        self.query.move_end();
    }

    pub fn select_next(&mut self) {
        if !self.filtered.is_empty() {
            self.selected = (self.selected + 1).min(self.filtered.len() - 1);
        }
    }

    pub fn select_prev(&mut self) {
        if self.selected > 0 {
            self.selected -= 1;
        }
    }

    /// The selected path (relative to vault), if there is a current
    /// match. Returns `None` when the filter eliminates everything.
    pub fn chosen_path(&self) -> Option<PathBuf> {
        let idx = *self.filtered.get(self.selected)?;
        Some(PathBuf::from(self.all_files.get(idx)?))
    }

    fn refilter(&mut self) {
        if self.query.is_empty() {
            // No query — show everything in registry order.
            self.filtered = (0..self.all_files.len()).collect();
            self.selected = 0;
            return;
        }
        let needle = self.query.as_str();
        let mut scored: Vec<(usize, i32)> = self
            .all_files
            .iter()
            .enumerate()
            .filter_map(|(i, path)| fuzzy_score(path, needle).map(|s| (i, s)))
            .collect();
        // Higher score = better; ties broken by alphabetical path order.
        scored.sort_by(|a, b| {
            b.1.cmp(&a.1)
                .then_with(|| self.all_files[a.0].cmp(&self.all_files[b.0]))
        });
        self.filtered = scored.into_iter().map(|(i, _)| i).collect();
        self.selected = 0;
    }
}

/// Score `pattern` against `target`. Returns `None` when `pattern` is
/// not a subsequence of `target`. Higher is better.
///
/// Heuristics (tuned for filename matching):
/// - Each pattern char that matches a *consecutive* target char gets
///   +5 (adjacency reward — fzf-style).
/// - Each pattern char that matches at the start of a path segment
///   (post-`/`, post-`-`, post-`_`, post-`.`) gets +3.
/// - Otherwise +1 per match.
/// - Subtract 1 for each unmatched target char between matches.
///
/// Case is folded to lowercase for both sides, like vim's
/// `ignorecase` default. (Smartcase is a future polish.)
pub fn fuzzy_score(target: &str, pattern: &str) -> Option<i32> {
    if pattern.is_empty() {
        return Some(0);
    }
    let target_lower = target.to_lowercase();
    let pattern_lower = pattern.to_lowercase();
    let target_bytes: Vec<char> = target_lower.chars().collect();
    let pattern_bytes: Vec<char> = pattern_lower.chars().collect();

    let mut score = 0i32;
    let mut t_idx = 0usize;
    let mut last_match: Option<usize> = None;

    for &p in &pattern_bytes {
        let mut found = None;
        while t_idx < target_bytes.len() {
            if target_bytes[t_idx] == p {
                found = Some(t_idx);
                break;
            }
            t_idx += 1;
        }
        let pos = found?;
        let prev_char = if pos == 0 {
            None
        } else {
            Some(target_bytes[pos - 1])
        };
        let adjacency = matches!(last_match, Some(prev) if prev + 1 == pos);
        let segment_start = matches!(prev_char, Some('/' | '-' | '_' | '.' | ' '));

        let inc = if adjacency {
            5
        } else if segment_start || pos == 0 {
            3
        } else {
            1
        };
        score += inc;

        // Penalty for skipped chars between this and the previous match.
        if let Some(prev) = last_match {
            let gap = pos.saturating_sub(prev + 1);
            score -= gap as i32;
        }

        last_match = Some(pos);
        t_idx = pos + 1;
    }

    // Slight bonus for shorter targets (so `foo.md` outranks `foo/bar/foo.md`).
    score -= target_bytes.len() as i32 / 8;

    Some(score)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_query_keeps_all() {
        let mut q = QuickOpen::default();
        q.reset(vec!["a.md".into(), "b.md".into()]);
        assert_eq!(q.filtered.len(), 2);
        assert_eq!(q.selected, 0);
    }

    #[test]
    fn fuzzy_picks_subsequence() {
        let mut q = QuickOpen::default();
        q.reset(vec![
            "alpha.md".into(),
            "bravo.md".into(),
            "charlie.md".into(),
        ]);
        q.push_char('b');
        q.push_char('r');
        // Only "bravo.md" matches `br`.
        let chosen = q.chosen_path().unwrap();
        assert_eq!(chosen.to_string_lossy(), "bravo.md");
    }

    #[test]
    fn adjacency_outranks_scattered() {
        // Both contain f, b, m as a subsequence — but `fbm.md` has them
        // adjacent, so it should rank first.
        let mut q = QuickOpen::default();
        q.reset(vec![
            "fooBARmaybe.md".into(),
            "fbm.md".into(),
            "format/buffers/markdown.md".into(),
        ]);
        q.push_char('f');
        q.push_char('b');
        q.push_char('m');
        let chosen = q.chosen_path().unwrap();
        assert_eq!(chosen.to_string_lossy(), "fbm.md");
    }

    #[test]
    fn segment_start_outranks_mid_word() {
        let mut q = QuickOpen::default();
        q.reset(vec!["chmod.md".into(), "ch/m/d.md".into()]);
        q.push_char('c');
        q.push_char('m');
        q.push_char('d');
        // The path-segment match should win.
        let chosen = q.chosen_path().unwrap();
        assert_eq!(chosen.to_string_lossy(), "ch/m/d.md");
    }

    #[test]
    fn no_match_yields_empty_filtered() {
        let mut q = QuickOpen::default();
        q.reset(vec!["abc.md".into()]);
        q.push_char('z');
        assert!(q.filtered.is_empty());
        assert!(q.chosen_path().is_none());
    }

    #[test]
    fn select_clamps_to_bounds() {
        let mut q = QuickOpen::default();
        q.reset(vec!["a".into(), "b".into(), "c".into()]);
        q.select_next();
        q.select_next();
        q.select_next(); // would be 3, clamps to 2
        assert_eq!(q.selected, 2);
        q.select_prev();
        assert_eq!(q.selected, 1);
        q.select_prev();
        q.select_prev();
        q.select_prev(); // would be -1, clamps to 0
        assert_eq!(q.selected, 0);
    }

    #[test]
    fn case_insensitive_matching() {
        let mut q = QuickOpen::default();
        q.reset(vec!["Foo.md".into(), "bar.md".into()]);
        q.push_char('F');
        q.push_char('O');
        q.push_char('O');
        let chosen = q.chosen_path().unwrap();
        assert_eq!(chosen.to_string_lossy(), "Foo.md");
    }

    #[test]
    fn fuzzy_score_reports_none_when_no_match() {
        assert!(fuzzy_score("alpha", "z").is_none());
        assert!(fuzzy_score("alpha", "ah").is_some());
    }

    #[test]
    fn fuzzy_score_higher_for_better_match() {
        let exact = fuzzy_score("test", "test").unwrap();
        let scattered = fuzzy_score("the_super_team", "tst").unwrap();
        assert!(exact > scattered);
    }
}
