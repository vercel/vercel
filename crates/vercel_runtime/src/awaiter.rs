//! Background work collector for `waitUntil`-style tasks.
//!
//! Each request drains its background work before sending the `end` IPC
//! message, keeping the invocation active after the response is sent. There is
//! no dedicated IPC message for registering work. Futures are also tracked
//! globally from registration so shutdown waits for them, even without IPC or
//! while the handler is still running. In production the drain is unbounded
//! (until the function times out); in `vc dev` it is bounded by
//! [`WAIT_UNTIL_TIMEOUT`] so a hung task cannot keep the dev process alive.
//!
//! Like the Node implementation:
//! - A future registered via [`Awaiter::wait_until`] runs regardless of whether
//!   the originating handler succeeded or errored.
//! - Panics are reported by the panic hook and isolated by Tokio, so they never
//!   abort the drain or affect other background work.
//! - The drain waits until the set is empty, including futures registered by
//!   existing background work during the drain.

use std::future::Future;
use tokio_util::task::{TaskTracker, task_tracker::TrackedFuture};

/// Time (in seconds) to wait for background work to finish at shutdown before
/// giving up. Only applied in `vc dev`; production drains are unbounded. Matches
/// the `WAIT_UNTIL_TIMEOUT` dev fallback in `@vercel/node`.
pub const WAIT_UNTIL_TIMEOUT: u64 = 30;

/// Tracks background futures without retaining completed tasks. Cheaply
/// cloneable; all clones share the same underlying task set.
#[derive(Clone, Default)]
pub struct Awaiter {
    tasks: TaskTracker,
}

impl Awaiter {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a background future to be awaited by this set's owner.
    ///
    /// The future is spawned onto the current Tokio runtime immediately so it
    /// makes progress while the invocation is active. Any panic is reported by
    /// the panic hook and caught by Tokio without aborting other work.
    pub fn wait_until<F>(&self, future: F)
    where
        F: Future<Output = ()> + Send + 'static,
    {
        self.tasks.spawn(future);
    }

    /// Track a future before it is spawned, allowing request and shutdown
    /// collectors to wait for the same task independently.
    pub(crate) fn track<F: Future>(&self, future: F) -> TrackedFuture<F> {
        self.tasks.track_future(future)
    }

    /// Wait for all registered background tasks, including work they register
    /// during the drain. Cancelling a drain does not lose track of pending work.
    pub async fn awaiting(&self) {
        // Closing allows wait() to finish when empty, but still permits nested
        // registrations while existing tasks are running.
        self.tasks.close();
        self.tasks.wait().await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        Arc,
        atomic::{AtomicU32, Ordering},
    };
    use std::time::Duration;
    use tokio::sync::oneshot;

    #[tokio::test]
    async fn awaiting_completes_registered_futures() {
        let awaiter = Awaiter::new();
        let count = Arc::new(AtomicU32::new(0));
        for _ in 0..3 {
            let count = count.clone();
            awaiter.wait_until(async move {
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

    #[tokio::test]
    async fn completed_tasks_are_released_without_draining() {
        let awaiter = Awaiter::new();
        for _ in 0..1000 {
            awaiter.wait_until(async {});
        }
        tokio::time::timeout(Duration::from_secs(5), async {
            while !awaiter.tasks.is_empty() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert!(!awaiter.tasks.is_closed());
    }

    #[tokio::test]
    async fn a_future_is_tracked_by_both_collectors_before_it_runs() {
        let global = Awaiter::new();
        let request = Awaiter::new();
        let (release, gate) = oneshot::channel();
        request.wait_until(global.track(async move {
            gate.await.unwrap();
        }));
        assert_eq!(global.tasks.len(), 1);
        assert_eq!(request.tasks.len(), 1);

        let drain = global.awaiting();
        tokio::pin!(drain);
        tokio::select! {
            biased;
            _ = &mut drain => panic!("drain returned before the task finished"),
            _ = std::future::ready(()) => {}
        }
        release.send(()).unwrap();
        tokio::join!(drain, request.awaiting());
        assert!(global.tasks.is_empty());
        assert!(request.tasks.is_empty());
    }
}
