# Schedules command dispatcher

The container builder builds the schedule's Dockerfile with its `root` as the
build context, then derives an image that copies in this static Linux/amd64
binary and sets ENTRYPOINT to it. USER, WORKDIR, ENV and the image's layers are
kept. The function's environment sets the schedule's command as a JSON array
in `VERCEL_SCHEDULE_COMMAND`, so the image doesn't depend on the command.
Commands run without a shell; include one in the argument array if needed.

The dispatcher listens on PORT (3000 locally). `/_vercel/ping` answers without
running the command. A schedule dispatch runs the command in its own process
group and responds when it exits: 204 on success, 500 otherwise. Any other
request gets 400 without running the command. Invocations can overlap.

The command gets the image's environment plus the firing's `VERCEL_SCHEDULE_ID`,
`VERCEL_SCHEDULE_EXECUTION_ID`, `VERCEL_SCHEDULE_NAME`,
`VERCEL_SCHEDULE_NAMESPACE`, `VERCEL_SCHEDULE_SCHEDULED_AT` (UTC) and
`VERCEL_SCHEDULE_SOURCE`, and `TRACEPARENT`/`TRACESTATE` and the request's OIDC
token as `VERCEL_OIDC_TOKEN` when the dispatch has them.

- A disconnected caller kills the invocation's process group.
- SIGTERM stops new invocations and is forwarded to running ones.
- When the command exits, its process group is killed. Descendants that leave
  the group (for example with `setsid`) are not tracked. If they hold the
  command's output open, the invocation completes after 1s and drops their
  output with a warning.
- Output goes to the runtime IPC socket, attributed to its invocation. If the
  socket is unavailable (non-root image users may lack permission) or a write
  fails, output falls back to container stdout/stderr for the rest of the
  container's life, where concurrent invocations are not attributed.

Run `go test -race ./...` here. Build the package, then run
`test/schedules-command-docker.test.ts` with
`VERCEL_SCHEDULES_COMMAND_DOCKER_TEST=1` to test real images.
