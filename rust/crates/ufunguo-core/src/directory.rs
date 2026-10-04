use std::{
    fmt, fs, io,
    path::{Path, PathBuf},
};

use thiserror::Error;

const WALLET_EXTENSION: &str = "sqlite";
const MAX_NAME_LENGTH: usize = 32;

/// A wallet name that is safe to turn into a file name.
///
/// Names are 1–32 characters of `a-z`, `0-9`, `-` and `_`, starting with a
/// letter or digit. This rules out path separators, `..`, absolute paths,
/// hidden files and NUL bytes, so a name can never escape its directory.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct WalletName(String);

#[derive(Debug, Error, PartialEq, Eq)]
pub enum WalletNameError {
    #[error("wallet name must not be empty")]
    Empty,

    #[error("wallet name must be at most {MAX_NAME_LENGTH} characters")]
    TooLong,

    #[error("wallet name must start with a lowercase letter or digit")]
    InvalidStart,

    #[error("wallet name may only contain lowercase letters, digits, '-' and '_'")]
    InvalidCharacter,
}

impl WalletName {
    pub fn parse(name: &str) -> Result<Self, WalletNameError> {
        let mut characters = name.chars();

        let Some(first) = characters.next() else {
            return Err(WalletNameError::Empty);
        };

        if name.len() > MAX_NAME_LENGTH {
            return Err(WalletNameError::TooLong);
        }

        if !(first.is_ascii_lowercase() || first.is_ascii_digit()) {
            return Err(WalletNameError::InvalidStart);
        }

        if !characters.all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || character == '-'
                || character == '_'
        }) {
            return Err(WalletNameError::InvalidCharacter);
        }

        Ok(Self(name.to_owned()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for WalletName {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

/// One directory holding independent wallets as `<name>.sqlite` files.
#[derive(Debug, Clone)]
pub struct WalletDirectory {
    root: PathBuf,
}

impl WalletDirectory {
    /// Creates the directory if needed and canonicalizes it.
    pub fn open(root: impl AsRef<Path>) -> io::Result<Self> {
        fs::create_dir_all(root.as_ref())?;

        Ok(Self {
            root: root.as_ref().canonicalize()?,
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn path_for(&self, name: &WalletName) -> PathBuf {
        let path = self
            .root
            .join(format!("{}.{WALLET_EXTENSION}", name.as_str()));

        // Guaranteed by `WalletName`; asserted so a future change to the
        // validation rules cannot silently allow traversal.
        debug_assert_eq!(path.parent(), Some(self.root.as_path()));

        path
    }

    pub fn contains(&self, name: &WalletName) -> bool {
        self.path_for(name).is_file()
    }

    /// Wallet files in the directory, sorted by name. Files whose stem is not
    /// a valid wallet name (or that are not regular files) are ignored.
    pub fn list(&self) -> io::Result<Vec<WalletName>> {
        let mut names = Vec::new();

        for entry in fs::read_dir(&self.root)? {
            let entry = entry?;
            if !entry.file_type()?.is_file() {
                continue;
            }

            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some(WALLET_EXTENSION) {
                continue;
            }

            if let Some(name) = path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .and_then(|stem| WalletName::parse(stem).ok())
            {
                names.push(name);
            }
        }

        names.sort();
        Ok(names)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_simple_wallet_names() {
        for name in ["alice", "bob", "presentation", "wallet-2", "a_b", "0", "x"] {
            assert!(WalletName::parse(name).is_ok(), "{name} should be valid");
        }

        assert!(WalletName::parse(&"a".repeat(32)).is_ok());
    }

    #[test]
    fn rejects_invalid_wallet_names() {
        assert_eq!(WalletName::parse(""), Err(WalletNameError::Empty));
        assert_eq!(
            WalletName::parse(&"a".repeat(33)),
            Err(WalletNameError::TooLong)
        );
        assert_eq!(
            WalletName::parse("Alice"),
            Err(WalletNameError::InvalidStart)
        );
        assert_eq!(
            WalletName::parse("-alice"),
            Err(WalletNameError::InvalidStart)
        );
        assert_eq!(
            WalletName::parse("_alice"),
            Err(WalletNameError::InvalidStart)
        );
        assert_eq!(
            WalletName::parse("alice bob"),
            Err(WalletNameError::InvalidCharacter)
        );
        assert_eq!(
            WalletName::parse("alicé"),
            Err(WalletNameError::InvalidCharacter)
        );
    }

    #[test]
    fn rejects_path_traversal_attempts() {
        for name in [
            "..",
            ".",
            "../alice",
            "..\\alice",
            "/etc/passwd",
            "alice/../../bob",
            "wallets/alice",
            ".hidden",
            "alice.sqlite",
            "alice\0",
            "~",
            "%2e%2e",
        ] {
            assert!(
                WalletName::parse(name).is_err(),
                "{name:?} must be rejected"
            );
        }
    }

    #[test]
    fn resolves_wallet_paths_inside_the_directory() {
        let temp = tempfile::tempdir().expect("temp directory");
        let directory = WalletDirectory::open(temp.path()).expect("directory");
        let name = WalletName::parse("alice").expect("valid name");

        let path = directory.path_for(&name);

        assert_eq!(path.parent(), Some(directory.root()));
        assert_eq!(
            path.file_name().and_then(|f| f.to_str()),
            Some("alice.sqlite")
        );
    }

    #[test]
    fn lists_only_valid_wallet_files() {
        let temp = tempfile::tempdir().expect("temp directory");
        let directory = WalletDirectory::open(temp.path()).expect("directory");

        for file in ["bob.sqlite", "alice.sqlite", "notes.txt", "Bad Name.sqlite"] {
            fs::write(temp.path().join(file), b"").expect("write file");
        }
        fs::create_dir(temp.path().join("folder.sqlite")).expect("create dir");

        let names: Vec<String> = directory
            .list()
            .expect("list")
            .into_iter()
            .map(|name| name.to_string())
            .collect();

        assert_eq!(names, ["alice", "bob"]);
    }
}
