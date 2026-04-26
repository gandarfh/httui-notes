/// Errors raised by the TUI binary.
///
/// Wraps [`httui_core::CoreError`] for any domain-level failure and adds
/// surface-specific variants (terminal lifecycle, config IO).
#[derive(Debug, thiserror::Error)]
pub enum TuiError {
    #[error("core error: {0}")]
    Core(#[from] httui_core::CoreError),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("config error: {0}")]
    Config(String),

    #[error("terminal error: {0}")]
    Terminal(String),

    #[error("invalid CLI argument: {0}")]
    InvalidArg(String),
}

pub type TuiResult<T> = Result<T, TuiError>;
