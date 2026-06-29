//! Background work collector for `waitUntil`-style tasks.
//!
//! This mirrors the behavior of the Node.js runtime's `Awaiter`
//! (`packages/node/src/awaiter.ts`). Crucially, `waitUntil` is implemented
//! entirely in-process: there is **no** dedicated IPC message. The per-request
//! `end` IPC message is sent immediately after the handler responds and is
//! **never** delayed by background work. Registered futures are drained only at
//! process shutdown (SIGTERM). In production the drain is unbounded (background
//! work runs until it resolves or the function times out); in `vc dev` it is
//! bounded by [`WAIT_UNTIL_TIMEOUT`] so a hung task cannot keep the dev process
//! alive.
//!
//! Like the Node implementation:
//! - A future registered via [`Awaiter::wait_until`] runs regardless of whether
//!   the originating handler succeeded or errored.
//! - Errors/panics in a background future are swallowed (logged) and never abort
//!   the drain or affect other background work (the analog of `.catch(onError)`).
//! - The drain loops until the set is empty so futures that schedule further
//!   `wait_until` work are also awaited (the analog of the two-batch drain).

use std::future::Future;
use std::sync::{Arc, Mutex};

use tokio::task::JoinHandle;

/// Time (in seconds) to wait for background work to finish at shutdown before
/// giving up. Only applied in `vc dev`; production drains are unbounded. Matches
/// the `WAIT_UNTIL_TIMEOUT` dev fallback in `@vercel/node`.
pub const WAIT_UNTIL_TIMEOUT: u64 = 30;

/// Collects background futures registered via `waitUntil` and drains them at
/// shutdown. Cheaply cloneable; all clones share the same underlying task set.
#[derive(Clone, Default)]
pub struct Awaiter {
    handles: Arc<Mutex<Vec<JoinHandle<()>>>>,
}

impl Awaiter {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a background future to be awaited at shutdown.
    ///
    /// The future is spawned onto the current Tokio runtime immediately so it
    /// makes progress between requests. Any panic in the future is caught by the
    /// runtime and logged when the handle is joined during the drain, mirroring
    /// the Node runtime's error swallowing.
    pub fn wait_until<F>(&self, future: F)
    where
        F: Future<Output = ()> + Send + 'static,
    {
        let handle = tokio::spawn(future);
        if let Ok(mut handles) = self.handles.lock() {
            handles.push(handle);
        }
    }

    /// Drain all currently-registered background tasks, looping until none
    /// remain so that tasks which register further `wait_until` work are also
    /// awaited.
    pub async fn awaiting(&self) {
        loop {
            let batch = {
                let Ok(mut handles) = self.handles.lock() else {
                    return;
                };
                if handles.is_empty() {
                    return;
                }
                std::mem::take(&mut *handles)
            };

            for handle in batch {
                // A panic in the task surfaces as a JoinError; swallow it so one
                // failing task cannot abort the drain.
                if let Err(e) = handle.await {
                    eprintln!("waitUntil task failed: {e}");
                }
            }
        }
    }
}
