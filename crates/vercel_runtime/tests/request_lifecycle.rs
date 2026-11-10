#![cfg(unix)]

use std::{future::Future, net::SocketAddr, path::PathBuf, process::Stdio, time::Duration};

use serde_json::{Value, json};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    net::{TcpListener, TcpStream, UnixListener, UnixStream},
    process::{Child, Command},
    time::timeout,
};
use vercel_runtime::{AppState, Error, Request, run, service_fn};

const QUIET: Duration = Duration::from_millis(200);

async fn bounded(test: impl Future<Output = ()>) {
    timeout(Duration::from_secs(20), test)
        .await
        .expect("request lifecycle test timed out");
}

// Only the child mutates runtime globals or receives signals. Each task announces
// itself on a separate control connection and cannot finish before parent release.
async fn background_gate(name: &str) {
    let address = std::env::var("VERCEL_LIFECYCLE_CONTROL").unwrap();
    let mut stream = TcpStream::connect(address).await.unwrap();
    stream
        .write_all(format!("{name}\n").as_bytes())
        .await
        .unwrap();
    assert_eq!(stream.read_u8().await.unwrap(), b'R');
    stream.write_all(b"D").await.unwrap();
}

async fn handler(req: Request, state: AppState) -> Result<&'static str, Error> {
    let path = req.uri().path().to_owned();
    if path != "/empty" {
        let nested_state = state.clone();
        let task_path = path.clone();
        state.wait_until(async move {
            background_gate(&task_path).await;
            if task_path == "/a" {
                nested_state.wait_until(async {
                    background_gate("nested").await;
                    panic!("intentional background panic");
                });
            }
        });
    }
    if path == "/pending" {
        std::future::pending::<()>().await;
    }
    if path == "/b" {
        return Err("intentional handler error".into());
    }
    Ok("ok")
}

#[test]
fn runtime_child() {
    if std::env::var_os("VERCEL_LIFECYCLE_CHILD").is_none() {
        return;
    }
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(bounded(async { run(service_fn(handler)).await.unwrap() }));
}

struct Runtime {
    child: Child,
    address: SocketAddr,
    control: TcpListener,
    ipc: Option<BufReader<UnixStream>>,
    socket_path: PathBuf,
}

impl Drop for Runtime {
    fn drop(&mut self) {
        // Child::kill_on_drop also covers assertion failures and global timeouts.
        let _ = std::fs::remove_file(&self.socket_path);
    }
}

impl Runtime {
    async fn start(with_ipc: bool) -> Self {
        let reservation = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = reservation.local_addr().unwrap();
        let control = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let socket_path =
            std::env::temp_dir().join(format!("vl-{}-{}.sock", std::process::id(), address.port()));
        let listener = with_ipc.then(|| UnixListener::bind(&socket_path).unwrap());
        let mut command = Command::new(std::env::current_exe().unwrap());
        command
            .args([
                "--exact",
                "runtime_child",
                "--nocapture",
                "--test-threads=1",
            ])
            .env("VERCEL_LIFECYCLE_CHILD", "1")
            .env(
                "VERCEL_LIFECYCLE_CONTROL",
                control.local_addr().unwrap().to_string(),
            )
            .env("VERCEL_DEV_PORT", address.port().to_string())
            .env_remove("VERCEL_DEV")
            .env_remove("VERCEL_IPC_PATH")
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .kill_on_drop(true);
        if with_ipc {
            command.env("VERCEL_IPC_PATH", &socket_path);
        } else {
            command.env("VERCEL_DEV", "1");
        }
        drop(reservation);
        let mut runtime = Self {
            child: command.spawn().unwrap(),
            address,
            control,
            ipc: None,
            socket_path,
        };
        if let Some(listener) = listener {
            runtime.ipc = Some(BufReader::new(listener.accept().await.unwrap().0));
            let start = runtime.frame().await;
            assert_eq!(start["type"], "server-started");
            assert_eq!(start["payload"]["httpPort"], address.port());
        } else {
            let mut stdout = BufReader::new(runtime.child.stdout.as_mut().unwrap()).lines();
            let ready = format!("Dev server listening: {}", address.port());
            loop {
                let line = stdout
                    .next_line()
                    .await
                    .unwrap()
                    .expect("child exited before startup");
                if line.contains(&ready) {
                    break;
                }
            }
        }
        runtime
    }

    async fn request(&self, path: &str, id: u64) -> TcpStream {
        let mut stream = TcpStream::connect(self.address).await.unwrap();
        stream.write_all(format!(
            "GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nx-vercel-internal-invocation-id: invocation-{id}\r\nx-vercel-internal-request-id: {id}\r\n\r\n"
        ).as_bytes()).await.unwrap();
        stream
    }

    async fn gate(&self, expected: &str) -> TcpStream {
        let mut stream = BufReader::new(self.control.accept().await.unwrap().0);
        let mut name = String::new();
        stream.read_line(&mut name).await.unwrap();
        assert_eq!(name.trim_end(), expected);
        stream.into_inner()
    }

    async fn frame(&mut self) -> Value {
        let mut frame = Vec::new();
        self.ipc
            .as_mut()
            .unwrap()
            .read_until(0, &mut frame)
            .await
            .unwrap();
        assert_eq!(frame.pop(), Some(0), "missing NUL-terminated IPC frame");
        serde_json::from_slice(&frame).unwrap()
    }

    async fn end(&mut self, id: u64) {
        assert_eq!(
            self.frame().await,
            json!({
                "type": "end",
                "payload": {
                    "context": {"invocationId": format!("invocation-{id}"), "requestId": id},
                    "error": null
                }
            })
        );
    }

    async fn no_end(&mut self) {
        // fill_buf is cancellation-safe and leaves any unexpected frame intact.
        assert!(
            timeout(QUIET, self.ipc.as_mut().unwrap().fill_buf())
                .await
                .is_err(),
            "IPC activity while request work is still blocked"
        );
    }

    fn terminate(&self) {
        let pid = self.child.id().expect("child already reaped");
        assert_eq!(unsafe { libc::kill(pid as libc::pid_t, libc::SIGTERM) }, 0);
    }

    async fn exited(&mut self) {
        assert!(self.child.wait().await.unwrap().success(), "child failed");
        if let Some(ipc) = &mut self.ipc {
            let mut remaining = Vec::new();
            ipc.read_to_end(&mut remaining).await.unwrap();
            assert!(
                remaining.is_empty(),
                "unexpected/duplicate IPC: {remaining:?}"
            );
        }
    }
}

async fn response(mut stream: TcpStream, status: u16, body: &str) {
    let mut response = String::new();
    stream.read_to_string(&mut response).await.unwrap();
    assert!(
        response.starts_with(&format!("HTTP/1.1 {status} ")),
        "{response}"
    );
    assert_eq!(response.split_once("\r\n\r\n").unwrap().1, body);
}

async fn release(mut gate: TcpStream) {
    gate.write_all(b"R").await.unwrap();
    assert_eq!(gate.read_u8().await.unwrap(), b'D', "work did not finish");
}

#[tokio::test]
async fn responses_and_request_completion_are_independent() {
    bounded(async {
        let mut runtime = Runtime::start(true).await;
        response(runtime.request("/a", 101).await, 200, "ok").await;
        let a = runtime.gate("/a").await;
        response(
            runtime.request("/b", 202).await,
            500,
            "{\"error\": \"intentional handler error\"}",
        )
        .await;
        let b = runtime.gate("/b").await;

        // A taskless request must complete while both other requests have work.
        response(runtime.request("/empty", 303).await, 200, "ok").await;
        runtime.end(303).await;
        runtime.no_end().await;
        release(b).await;
        runtime.end(202).await;
        runtime.no_end().await;

        release(a).await;
        let nested = runtime.gate("nested").await;
        runtime.no_end().await;
        release(nested).await;
        runtime.end(101).await;
        runtime.terminate();
        runtime.exited().await;
    })
    .await;
}

async fn shutdown_drains(with_ipc: bool, pending_handler: bool) {
    let mut runtime = Runtime::start(with_ipc).await;
    let path = if pending_handler {
        "/pending"
    } else {
        "/background"
    };
    let mut request = runtime.request(path, 404).await;
    let gate = runtime.gate(path).await;
    if pending_handler {
        assert!(
            timeout(QUIET, request.read_u8()).await.is_err(),
            "handler returned"
        );
        runtime.no_end().await;
    } else {
        response(request, 200, "ok").await;
    }
    runtime.terminate();
    assert!(
        timeout(QUIET, runtime.child.wait()).await.is_err(),
        "SIGTERM did not wait for registered background work"
    );
    release(gate).await;
    if with_ipc && !pending_handler {
        runtime.end(404).await;
    }
    runtime.exited().await;
}

#[tokio::test]
async fn sigterm_after_response_without_ipc_drains_work() {
    bounded(shutdown_drains(false, false)).await;
}

#[tokio::test]
async fn sigterm_after_response_with_ipc_drains_work_and_end() {
    bounded(shutdown_drains(true, false)).await;
}

#[tokio::test]
async fn sigterm_during_handler_with_ipc_drains_registered_work() {
    bounded(shutdown_drains(true, true)).await;
}
