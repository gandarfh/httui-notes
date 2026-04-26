//! Yank / delete register. Round 2 only ships the unnamed register;
//! named registers (`"a-"z`, `"0-"9`, `"+`, `"*`) arrive with round 3.
//!
//! `linewise` matters at paste time: a linewise register pasted via `p`
//! goes on the line **below** the cursor; a charwise register goes
//! immediately **after** the cursor.

#[derive(Debug, Default, Clone)]
pub struct Register {
    pub text: String,
    pub linewise: bool,
}

impl Register {
    pub fn empty() -> Self {
        Self::default()
    }

    pub fn set_charwise(&mut self, text: String) {
        self.text = text;
        self.linewise = false;
    }

    pub fn set_linewise(&mut self, text: String) {
        self.text = text;
        self.linewise = true;
    }

    pub fn is_empty(&self) -> bool {
        self.text.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_register_starts_empty() {
        let r = Register::empty();
        assert!(r.is_empty());
        assert!(!r.linewise);
    }

    #[test]
    fn set_charwise_clears_linewise_flag() {
        let mut r = Register::empty();
        r.set_linewise("a\n".into());
        r.set_charwise("hi".into());
        assert_eq!(r.text, "hi");
        assert!(!r.linewise);
    }

    #[test]
    fn set_linewise_marks_flag() {
        let mut r = Register::empty();
        r.set_linewise("line\n".into());
        assert!(r.linewise);
        assert_eq!(r.text, "line\n");
    }
}
