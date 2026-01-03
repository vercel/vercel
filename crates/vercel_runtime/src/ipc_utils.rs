#![cfg(unix)]

use base64::prelude::*;
use serde::Serialize;
use std::collections::VecDeque;
use std::io::prelude::*;
use std::os::unix::net::UnixStream;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::types::Error;

pub static IPC_READY: AtomicBool = AtomicBool::new(false);
static INIT_LOG_BUF_MAX_BYTES: usize = 1_000_000;

lazy_static::lazy_static! {
    pub static ref INIT_LOG_BUFFER: Arc<Mutex<(VecDeque<String>, usize)>> = {
        register_exit_handler();
        Arc::new(Mutex::new((VecDeque::new(), 0)))
    };
}

// Register exit handler to flush buffered messages
fn register_exit_handler() {
    extern "C" fn exit_handler() {
        flush_init_log_buf_to_stderr();
    }
    unsafe {
        libc::atexit(exit_handler);
    }
}

pub fn send_message<T: Serialize>(stream: &Arc<Mutex<UnixStream>>, message: T) -> Result<(), Error> {
    let json_str = serde_json::to_string(&message)?;
    let msg = format!("{json_str}\0");

    let mut stream = stream.lock().map_err(|e| {
        Box::new(std::io::Error::other(format!(
            "Failed to acquire stream lock: {}",
            e
        ))) as Error
    })?;

    stream.write_all(msg.as_bytes())?;
    stream.flush()?;
    Ok(())
}

pub fn enqueue_or_send_message<T: Serialize>(
    stream: &Option<Arc<Mutex<UnixStream>>>,
    message: T,
) -> Result<(), Error> {
    if IPC_READY.load(Ordering::Relaxed)
        && let Some(stream) = stream
    {
        return send_message(stream, message);
    }

    // Buffer the message if IPC is not ready
    let json_str = serde_json::to_string(&message)?;
    let msg_len = json_str.len();

    if let Ok(mut buffer) = INIT_LOG_BUFFER.lock() {
        if buffer.1 + msg_len <= INIT_LOG_BUF_MAX_BYTES {
            buffer.0.push_back(json_str);
            buffer.1 += msg_len;
        } else {
            // Fallback to stderr if buffer is full - decode base64
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_str)
                && let Some(payload) = parsed.get("payload")
                && let Some(msg) = payload.get("message")
                && let Some(msg_str) = msg.as_str()
                && let Ok(decoded) = BASE64_STANDARD.decode(msg_str)
                && let Ok(text) = String::from_utf8(decoded)
            {
                eprint!("{}", text);
            }
        }
    }

    Ok(())
}

pub fn flush_init_log_buffer(stream: &Option<Arc<Mutex<UnixStream>>>) {
    if let Some(stream) = stream {
        if let Ok(mut buffer) = INIT_LOG_BUFFER.lock() {
            while let Some(json_str) = buffer.0.pop_front() {
                if let Ok(message) = serde_json::from_str::<serde_json::Value>(&json_str)
                    && let Err(_e) = send_message(stream, message)
                {
                    // Failed to send buffered message
                    break;
                }
            }
            buffer.1 = 0; // Reset byte count
        }
    } else {
        flush_init_log_buf_to_stderr();
    }
}

pub fn flush_init_log_buf_to_stderr() {
    if let Ok(mut buffer) = INIT_LOG_BUFFER.lock() {
        let mut combined: Vec<String> = Vec::new();

        while let Some(json_str) = buffer.0.pop_front() {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&json_str)
                && let Some(payload) = parsed.get("payload")
                && let Some(msg) = payload.get("message")
                && let Some(msg_str) = msg.as_str()
                && let Ok(decoded) = BASE64_STANDARD.decode(msg_str)
                && let Ok(text) = String::from_utf8(decoded)
            {
                combined.push(text);
            }
        }

        if !combined.is_empty() {
            eprint!("{}", combined.join(""));
        }

        buffer.1 = 0;
    }
}
