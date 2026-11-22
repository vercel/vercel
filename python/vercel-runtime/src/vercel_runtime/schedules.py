"""Run schedule entrypoints as scripts, one process per firing.

A schedule fires as a binary-mode CloudEvent with no body: the schedule's
metadata travels as `ce-*` request headers. This module is the only place that
reads them. It validates the dispatch, maps the metadata to the versioned
`VERCEL_SCHEDULE_*` environment contract, and runs the entrypoint as a fresh
`__main__` program. Exit status 0 is success; anything else fails the firing.

One function can serve several schedules, each with its own script. The
dispatch's schedule name selects which script runs.

The script's stdout and stderr are forwarded line by line from inside the
request, so the platform attributes them to the invocation that produced
them, including when firings overlap. `logging` records keep their level via a
private pipe set up by `vercel_runtime.schedule_bootstrap`.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import signal
import sys
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping
from datetime import UTC, datetime
from typing import Any, cast

from vercel_runtime import deadline, schedule_bootstrap

type _ASGIMessage = dict[str, Any]
type _ASGIReceive = Callable[[], Awaitable[_ASGIMessage]]
type _ASGISend = Callable[[_ASGIMessage], Awaitable[None]]

SCHEDULE_CLOUD_EVENT_TYPE = "com.vercel.schedule.v1beta"
SCHEDULE_EVENT_VERSION = "1"
"""Version of the `VERCEL_SCHEDULE_*` contract passed to entrypoints."""

SCHEDULE_ENV_PREFIX = "VERCEL_SCHEDULE_"

_SUPPORTED_SPEC_VERSION = "1.0"

# Dispatch header -> contract variable. All are required.
_HEADER_ENV: tuple[tuple[str, str], ...] = (
    ("ce-vssscheduleid", "VERCEL_SCHEDULE_ID"),
    ("ce-id", "VERCEL_SCHEDULE_EXECUTION_ID"),
    ("ce-vssschedulename", "VERCEL_SCHEDULE_NAME"),
    ("ce-vssnamespace", "VERCEL_SCHEDULE_NAMESPACE"),
    ("ce-vssscheduledat", "VERCEL_SCHEDULE_SCHEDULED_AT"),
    ("ce-vssschedulesource", "VERCEL_SCHEDULE_SOURCE"),
)
_TRACE_HEADERS = ("traceparent", "tracestate")

# Stop the script this long before the invocation deadline, then wait
# `_KILL_GRACE_SECONDS` before SIGKILL, so the failure is reported before
# the platform ends the invocation.
_TERM_MARGIN_SECONDS = 5.0
_KILL_GRACE_SECONDS = 3.0
# After the script exits, wait this long for its pipes to reach EOF.
_DRAIN_SECONDS = 1.0

# Forward script output without a newline once it grows this long, so one
# long line cannot stall forwarding.
_MAX_LINE_BYTES = 64 * 1024
_READ_CHUNK_BYTES = 64 * 1024

_schedule_log = logging.getLogger("vercel.schedules")
_script_log = logging.getLogger("vercel.schedules.script")


class ScheduleDispatchError(ValueError):
    """The request is not a valid schedule dispatch."""


def _require(headers: Mapping[str, str], name: str) -> str:
    value = headers.get(name)
    if not value:
        raise ScheduleDispatchError(
            f'request is missing header "{name}": not a schedule dispatch'
        )
    return value


def _normalize_scheduled_at(value: str) -> str:
    try:
        scheduled_at = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ScheduleDispatchError(
            f'invalid schedule time "{value}": not ISO 8601'
        ) from exc
    if scheduled_at.utcoffset() is None:
        raise ScheduleDispatchError(
            f'invalid schedule time "{value}": missing timezone offset'
        )
    utc = scheduled_at.astimezone(UTC)
    return utc.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def schedule_env_from_headers(headers: Mapping[str, str]) -> dict[str, str]:
    """Map lower-cased dispatch headers to the `VERCEL_SCHEDULE_*` contract."""
    spec_version = headers.get("ce-specversion")
    if spec_version != _SUPPORTED_SPEC_VERSION:
        raise ScheduleDispatchError(
            f'unrecognized CloudEvent spec version "{spec_version}": '
            f'expected "{_SUPPORTED_SPEC_VERSION}"'
        )
    event_type = headers.get("ce-type")
    if event_type != SCHEDULE_CLOUD_EVENT_TYPE:
        raise ScheduleDispatchError(
            f'unrecognized CloudEvent type "{event_type}": '
            f'expected "{SCHEDULE_CLOUD_EVENT_TYPE}"'
        )
    _require(headers, "ce-source")

    env = {"VERCEL_SCHEDULE_EVENT_VERSION": SCHEDULE_EVENT_VERSION}
    for header, variable in _HEADER_ENV:
        env[variable] = _require(headers, header)
    env["VERCEL_SCHEDULE_SCHEDULED_AT"] = _normalize_scheduled_at(
        env["VERCEL_SCHEDULE_SCHEDULED_AT"]
    )
    return env


def _child_env(
    schedule_env: Mapping[str, str], headers: Mapping[str, str]
) -> dict[str, str]:
    env = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith(SCHEDULE_ENV_PREFIX)
        and key.upper() not in {"TRACEPARENT", "TRACESTATE"}
    }
    env.update(schedule_env)
    for header in _TRACE_HEADERS:
        value = headers.get(header)
        if value:
            env[header.upper()] = value
    # Give the script the import path this function was loaded with, so
    # project modules and installed dependencies resolve the same way.
    env["PYTHONPATH"] = os.pathsep.join(p for p in sys.path if p)
    # stdout is a pipe, which Python would block-buffer: output would arrive
    # after `logging` records, and anything still buffered at the deadline
    # SIGKILL would be lost.
    env["PYTHONUNBUFFERED"] = "1"
    return env


class _ScheduleScriptApp:
    """Platform-owned ASGI supervisor for a function's schedule entrypoints."""

    def __init__(self, scripts: Mapping[str, str]) -> None:
        self._scripts = dict(scripts)

    def _script_for(self, name: str) -> str:
        script = self._scripts.get(name)
        if script is None:
            served = ", ".join(f'"{n}"' for n in sorted(self._scripts))
            raise ScheduleDispatchError(
                f'unrecognized schedule "{name}": this function runs {served}'
            )
        return script

    async def __call__(
        self,
        scope: dict[str, Any],
        receive: _ASGIReceive,
        send: _ASGISend,
    ) -> None:
        scope_type = scope.get("type")
        if scope_type == "lifespan":
            await _handle_lifespan(receive, send)
            return
        if scope_type != "http":
            raise RuntimeError(
                f'unsupported schedule ASGI scope type "{scope_type}"'
            )
        if scope.get("method") != "POST":
            await _send_status(send, 405)
            return

        headers = _headers_from_scope(scope)
        try:
            schedule_env = schedule_env_from_headers(headers)
            script = self._script_for(schedule_env["VERCEL_SCHEDULE_NAME"])
        except ScheduleDispatchError as exc:
            _schedule_log.warning("schedule dispatch rejected: %s", exc)
            await _send_status(send, 400)
            return

        try:
            returncode = await _run(script, _child_env(schedule_env, headers))
        except Exception:
            _schedule_log.exception(
                'could not run schedule entrypoint "%s"', script
            )
            await _send_status(send, 500)
            return

        if returncode == 0:
            await _send_status(send, 200)
            return
        if returncode < 0:
            _schedule_log.error(
                'schedule entrypoint "%s" was terminated by signal %d',
                script,
                -returncode,
            )
        else:
            _schedule_log.error(
                'schedule entrypoint "%s" exited with status %d',
                script,
                returncode,
            )
        await _send_status(send, 500)


async def _run(script: str, env: dict[str, str]) -> int:
    # Our own pipes rather than `asyncio.subprocess.PIPE`: with those,
    # `Process.wait()` also waits for EOF, so a background process that
    # inherited stdout would hold the firing open after the script exits.
    stdout_read, stdout_write = os.pipe()
    stderr_read, stderr_write = os.pipe()
    log_read, log_write = os.pipe()
    env[schedule_bootstrap.LOG_FD_ENV] = str(log_write)
    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "vercel_runtime.schedule_bootstrap",
            script,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=stdout_write,
            stderr=stderr_write,
            pass_fds=(log_write,),
            env=env,
            # Own process group, so a timeout or exit also stops
            # anything the script spawned.
            start_new_session=True,
        )
    except BaseException:
        for fd in (stdout_read, stderr_read, log_read):
            os.close(fd)
        raise
    finally:
        for fd in (stdout_write, stderr_write, log_write):
            os.close(fd)

    # Tasks copy this request's context, so forwarded lines are
    # attributed to this invocation.
    forwarders = [
        asyncio.create_task(_forward_stream(stdout_read, 1)),
        asyncio.create_task(_forward_stream(stderr_read, 2)),
        asyncio.create_task(_forward_records(log_read)),
    ]
    try:
        returncode = await _wait_until_deadline(proc)
    finally:
        # Stragglers would otherwise hold the pipes open.
        _kill_group(proc.pid, signal.SIGKILL)
        await _drain(forwarders)
    return returncode


async def _drain(forwarders: list[asyncio.Task[None]]) -> None:
    """Forward what is left in the pipes, then stop reading them.

    A process that left the script's process group survives the kill and
    can hold the pipes open indefinitely, so the wait for EOF is bounded.
    """
    _, pending = await asyncio.wait(forwarders, timeout=_DRAIN_SECONDS)
    if pending:
        _schedule_log.warning(
            "schedule entrypoint left a process running outside its "
            "process group: dropping its output"
        )
        for task in pending:
            task.cancel()
    await asyncio.gather(*forwarders, return_exceptions=True)


async def _wait_until_deadline(proc: asyncio.subprocess.Process) -> int:
    invocation_deadline = deadline.get_deadline()
    if invocation_deadline is None:
        return await proc.wait()

    remaining = (invocation_deadline - datetime.now(UTC)).total_seconds()
    try:
        return await asyncio.wait_for(
            proc.wait(), max(remaining - _TERM_MARGIN_SECONDS, 0)
        )
    except TimeoutError:
        pass

    _schedule_log.error(
        "schedule entrypoint reached the function deadline: stopping it"
    )
    _kill_group(proc.pid, signal.SIGTERM)
    try:
        return await asyncio.wait_for(proc.wait(), _KILL_GRACE_SECONDS)
    except TimeoutError:
        _kill_group(proc.pid, signal.SIGKILL)
        return await proc.wait()


def _kill_group(pid: int, sig: signal.Signals) -> None:
    with contextlib.suppress(ProcessLookupError, PermissionError):
        os.killpg(pid, sig)


async def _read_lines(
    reader: asyncio.StreamReader, max_line: int | None
) -> AsyncIterator[bytes]:
    """Yield newline-terminated lines, splitting any longer than `max_line`.

    `StreamReader.readline` raises once a line outgrows the reader's limit
    and leaves the pipe undrained, which would drop the rest of the output
    and could block the script on a full pipe.
    """
    pending = b""
    while chunk := await reader.read(_READ_CHUNK_BYTES):
        pending += chunk
        while (newline := pending.find(b"\n")) != -1:
            yield pending[: newline + 1]
            pending = pending[newline + 1 :]
        if max_line is not None and len(pending) >= max_line:
            yield pending + b"\n"
            pending = b""
    if pending:
        yield pending


@contextlib.asynccontextmanager
async def _pipe_reader(fd: int) -> AsyncIterator[asyncio.StreamReader]:
    """Read the pipe `fd` until the block exits, then close it."""
    loop = asyncio.get_running_loop()
    reader = asyncio.StreamReader()
    transport, _ = await loop.connect_read_pipe(
        lambda: asyncio.StreamReaderProtocol(reader),
        os.fdopen(fd, "rb"),
    )
    try:
        yield reader
    finally:
        transport.close()


async def _forward_stream(pipe_fd: int, fd: int) -> None:
    async with _pipe_reader(pipe_fd) as reader:
        async for line in _read_lines(reader, _MAX_LINE_BYTES):
            text = line.decode("utf-8", errors="replace")
            # Resolved per line: the runtime wraps these to tag the
            # invocation.
            stream = sys.stdout if fd == 1 else sys.stderr
            stream.write(text)
            stream.flush()


async def _forward_records(fd: int) -> None:
    async with _pipe_reader(fd) as reader:
        # Records are our own JSON lines, so never split one.
        async for line in _read_lines(reader, None):
            try:
                record = cast("dict[str, Any]", json.loads(line))
                level = int(record["level"])
                message = str(record["message"])
            except (ValueError, KeyError, TypeError):
                continue
            _script_log.log(level, "%s", message)


async def _handle_lifespan(receive: _ASGIReceive, send: _ASGISend) -> None:
    while True:
        message = await receive()
        message_type = message.get("type")
        if message_type == "lifespan.startup":
            await send({"type": "lifespan.startup.complete"})
        elif message_type == "lifespan.shutdown":
            await send({"type": "lifespan.shutdown.complete"})
            return


def _headers_from_scope(scope: Mapping[str, Any]) -> dict[str, str]:
    raw_headers = cast("list[tuple[bytes, bytes]]", scope.get("headers", []))
    return {
        name.decode("latin-1").lower(): value.decode("latin-1")
        for name, value in raw_headers
    }


async def _send_status(send: _ASGISend, status: int) -> None:
    headers = [(b"allow", b"POST")] if status == 405 else []
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": headers,
        }
    )
    await send({"type": "http.response.body", "body": b""})


def is_schedule_scripts_app(app: object) -> bool:
    """Whether `app` is a supervisor from `create_schedule_scripts_app`."""
    return isinstance(app, _ScheduleScriptApp)


def create_schedule_scripts_app(scripts: Mapping[str, str]) -> object:
    """Create the supervisor that runs a schedule's script once per firing.

    `scripts` maps each schedule name this function serves to its
    entrypoint's path, relative to the function's working directory or
    absolute.
    """
    if not scripts:
        raise ValueError("invalid schedule scripts: no schedules given")
    resolved: dict[str, str] = {}
    for name, script in scripts.items():
        if not name:
            raise ValueError("invalid schedule scripts: name is empty")
        if not script:
            raise ValueError(f'invalid schedule "{name}": path is empty')
        resolved[name] = os.path.abspath(script)
    return _ScheduleScriptApp(resolved)
