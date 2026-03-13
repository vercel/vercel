// Stubbed uv-fs: provides normalize_url_path, normalize_absolute_path (for uv-pep508),
// Simplified trait (for uv-requirements-txt error messages), and read_to_string_transcode
// (for reading included requirements files via host-bridge).

use std::borrow::Cow;
use std::fmt;
use std::future::Future;
use std::path::{Component, Path, PathBuf};

/// Normalize the `path` component of a URL for use as a file path.
///
/// For example, on Windows, transforms `C:\Users\ferris\wheel-0.42.0.tar.gz` to
/// `/C:/Users/ferris/wheel-0.42.0.tar.gz`.
///
/// On other platforms, this is a no-op.
pub fn normalize_url_path(path: &str) -> Cow<'_, str> {
    // Apply percent-decoding to the URL.
    let path = percent_encoding::percent_decode_str(path)
        .decode_utf8()
        .unwrap_or(Cow::Borrowed(path));

    // Return the path.
    if cfg!(windows) {
        Cow::Owned(
            path.strip_prefix('/')
                .unwrap_or(&path)
                .replace('/', std::path::MAIN_SEPARATOR_STR),
        )
    } else {
        path
    }
}

/// Normalize a path, removing things like `.` and `..`.
///
/// CAUTION: Assumes that the path is already absolute.
///
/// CAUTION: This does not resolve symlinks (unlike
/// [`std::fs::canonicalize`]).
pub fn normalize_absolute_path(path: &Path) -> Result<PathBuf, std::io::Error> {
    let mut components = path.components().peekable();
    let mut ret = if let Some(c @ Component::Prefix(..)) = components.peek().copied() {
        components.next();
        PathBuf::from(c.as_os_str())
    } else {
        PathBuf::new()
    };

    for component in components {
        match component {
            Component::Prefix(..) => unreachable!(),
            Component::RootDir => {
                ret.push(component.as_os_str());
            }
            Component::CurDir => {}
            Component::ParentDir => {
                if !ret.pop() {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        format!(
                            "cannot normalize a relative path beyond the base directory: {}",
                            path.display()
                        ),
                    ));
                }
            }
            Component::Normal(c) => {
                ret.push(c);
            }
        }
    }
    Ok(ret)
}

/// Trait for simplified path display (WASM stub: delegates to `.display()`).
pub trait Simplified {
    fn simplified(&self) -> &Path;
    fn simplified_display(&self) -> impl fmt::Display;
    fn simple_canonicalize(&self) -> std::io::Result<PathBuf>;
    fn user_display(&self) -> impl fmt::Display;
    fn user_display_from(&self, _base: impl AsRef<Path>) -> impl fmt::Display;
    fn portable_display(&self) -> impl fmt::Display;
}

impl<T: AsRef<Path>> Simplified for T {
    fn simplified(&self) -> &Path {
        self.as_ref()
    }

    fn simplified_display(&self) -> impl fmt::Display {
        self.as_ref().display()
    }

    fn simple_canonicalize(&self) -> std::io::Result<PathBuf> {
        normalize_absolute_path(self.as_ref())
    }

    fn user_display(&self) -> impl fmt::Display {
        self.as_ref().display()
    }

    fn user_display_from(&self, _base: impl AsRef<Path>) -> impl fmt::Display {
        self.as_ref().display()
    }

    fn portable_display(&self) -> impl fmt::Display {
        self.as_ref().display()
    }
}

/// Read a file to string, transcoding from latin-1 if needed.
///
/// In WASM, delegates to the host-bridge `read_file` function synchronously
/// and wraps the result in `std::future::ready()`.
pub fn read_to_string_transcode(
    path: impl AsRef<Path>,
) -> impl Future<Output = std::io::Result<String>> {
    let result = host_bridge::read_file(path.as_ref().to_string_lossy().as_ref()).map_err(|e| {
        std::io::Error::new(std::io::ErrorKind::Other, e)
    });
    std::future::ready(result)
}
