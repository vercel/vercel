//! Background work collector for `waitUntil`-style tasks.
//!
//! This mirrors the behavior of the Node.js runtime's `Awaiter`
//! (`packages/node/src/awaiter.ts`). `waitUntil` is implemented in-process:
//! there is no dedicated IPC message for registering work. Instead, each
//! request owns an `Awaiter` (on `AppState`), and the per-request `end` IPC
//! message is withheld until that request's registered futures settle. Keeping
//! the invocation open is what keeps the instance from being suspended, so
//! background work actually runs to completion after the response is sent
//! (bounded by the function's `maxDuration`), matching the Node.js runtime's
//! extended-lifecycle behavior. A global `Awaiter` additionally drains
//! outstanding work at process shutdown (SIGTERM): unbounded in production, and
//! bounded by [`WAIT_UNTIL_TIMEOUT`] in `vc dev` so a hung task cannot keep the
//! dev process alive.
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

    /// Register a background future to be awaited by this set's owner — the
    /// per-request drain that precedes the `end` IPC message, or the process
    /// shutdown drain for the global set.
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    #[tokio::test]
    async fn awaiting_completes_registered_futures() {
        let awaiter = Awaiter::new();
        let count = Arc::new(AtomicU32::new(0));
        for _ in 0..3 {
            let count = count.clone();
            awaiter.wait_until(async move {
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                count.fetch_add(1, Ordering::SeqCst);
            });
        }
        awaiter.awaiting().await;
        assert_eq!(count.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn awaiting_drains_futures_registered_during_the_drain() {
        let awaiter = Awaiter::new();
        let count = Arc::new(AtomicU32::new(0));
        let nested_awaiter = awaiter.clone();
        let nested_count = count.clone();
        awaiter.wait_until(async move {
            let count = nested_count.clone();
            nested_awaiter.wait_until(async move {
                count.fetch_add(1, Ordering::SeqCst);
            });
            nested_count.fetch_add(1, Ordering::SeqCst);
        });
        awaiter.awaiting().await;
        assert_eq!(count.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn a_panicking_future_does_not_abort_the_drain() {
        let awaiter = Awaiter::new();
        let count = Arc::new(AtomicU32::new(0));
        awaiter.wait_until(async { panic!("waitUntil task panic") });
        let survivor = count.clone();
        awaiter.wait_until(async move {
            survivor.fetch_add(1, Ordering::SeqCst);
        });
        awaiter.awaiting().await;
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }
}
