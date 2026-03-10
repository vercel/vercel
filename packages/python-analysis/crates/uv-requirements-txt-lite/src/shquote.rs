//! POSIX Shell Compatible Argument Parser
//!
//! This implementation is vendored from the [`r-shquote`](https://github.com/r-util/r-shquote)
//! crate under the Apache 2.0 license:
//!
//! ```text
//! Licensed under the Apache License, Version 2.0 (the "License");
//! you may not use this file except in compliance with the License.
//! You may obtain a copy of the License at
//!
//!         https://www.apache.org/licenses/LICENSE-2.0
//!
//! Unless required by applicable law or agreed to in writing, software
//! distributed under the License is distributed on an "AS IS" BASIS,
//! WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//! See the License for the specific language governing permissions and
//! limitations under the License.
//! ```
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub(crate) enum UnquoteError {
    UnterminatedSingleQuote {
        char_cursor: usize,
        byte_cursor: usize,
    },
    UnterminatedDoubleQuote {
        char_cursor: usize,
        byte_cursor: usize,
    },
}

impl std::fmt::Display for UnquoteError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "{self:?}")
    }
}

impl std::error::Error for UnquoteError {}

fn unquote_open_single(
    acc: &mut String,
    cursor: &mut std::iter::Enumerate<std::str::CharIndices>,
) -> bool {
    for i in cursor {
        match i {
            (_, (_, '\'')) => return true,
            (_, (_, c)) => acc.push(c),
        }
    }

    false
}

fn unquote_open_double(
    acc: &mut String,
    cursor: &mut std::iter::Enumerate<std::str::CharIndices>,
) -> bool {
    loop {
        match cursor.next() {
            Some((_, (_, '"'))) => {
                return true;
            }
            Some((_, (_, '\\'))) => match cursor.next() {
                Some((_, (_, esc_ch)))
                    if esc_ch == '"'
                        || esc_ch == '\\'
                        || esc_ch == '`'
                        || esc_ch == '$'
                        || esc_ch == '\n' =>
                {
                    acc.push(esc_ch);
                }
                Some((_, (_, esc_ch))) => {
                    acc.push('\\');
                    acc.push(esc_ch);
                }
                None => {
                    return false;
                }
            },
            Some((_, (_, inner_ch))) => {
                acc.push(inner_ch);
            }
            None => {
                return false;
            }
        }
    }
}

fn unquote_open_escape(acc: &mut String, cursor: &mut std::iter::Enumerate<std::str::CharIndices>) {
    if let Some((_, (_, esc_ch))) = cursor.next()
        && esc_ch != '\n'
    {
        acc.push(esc_ch);
    }
}

/// Unquote a single string according to POSIX Shell quoting and escaping rules.
///
/// If the string does not require any quoting or escaping, returns `Ok(None)`.
pub(crate) fn unquote(source: &str) -> Result<Option<String>, UnquoteError> {
    if memchr::memchr3(b'\'', b'"', b'\\', source.as_bytes()).is_none() {
        return Ok(None);
    }

    let mut acc = String::with_capacity(source.len());

    let mut cursor = source.char_indices().enumerate();
    loop {
        match cursor.next() {
            Some((next_idx, (next_pos, '\''))) => {
                if !unquote_open_single(&mut acc, &mut cursor) {
                    break Err(UnquoteError::UnterminatedSingleQuote {
                        char_cursor: next_idx,
                        byte_cursor: next_pos,
                    });
                }
            }
            Some((next_idx, (next_pos, '"'))) => {
                if !unquote_open_double(&mut acc, &mut cursor) {
                    break Err(UnquoteError::UnterminatedDoubleQuote {
                        char_cursor: next_idx,
                        byte_cursor: next_pos,
                    });
                }
            }
            Some((_, (_, '\\'))) => {
                unquote_open_escape(&mut acc, &mut cursor);
            }
            Some((_, (_, next_ch))) => {
                acc.push(next_ch);
            }
            None => {
                break Ok(Some(acc));
            }
        }
    }
}
