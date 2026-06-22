# Env Proxy Broker Service

This folder contains the broker-side pieces for `vc env run --experimental`.

Today these modules run locally inside the CLI process. The code is organized
as a service boundary because this logic is the part that owns real environment
values, performs dummy-to-real translation, and connects to upstream services.
The child process should only receive dummy values and routing/session metadata.

## Responsibilities

- Create and maintain a session-scoped dummy-to-real substitution map.
- Accept HTTP request envelopes from the injected shim.
- Replace dummy values with real values in outgoing HTTP URLs, headers, and
  bodies.
- Replace real values with dummy values in HTTP responses before returning them
  to the child process.
- Relay raw TCP connections for dummy hostnames when byte-level forwarding is
  sufficient.
- Provide protocol-specific adapters for services that cannot be handled by a
  generic TCP relay.

## Current Local Implementation

- `index.ts` starts a local HTTP broker and a local raw TCP relay.
- `postgres.ts` starts local loopback Postgres listeners and authenticates to
  the real upstream Postgres server on behalf of the child process.

The Postgres adapter exists because database credentials are exchanged inside
the Postgres protocol. A generic TCP relay cannot replace those values once the
client protocol is already running, especially when TLS is involved.

## Intended Boundary

The CLI-facing command should:

- pull or receive dummy environment values;
- start the child process with those dummy values;
- inject the shim;
- route HTTP and TCP traffic into the broker path.

The broker side should:

- own the real environment values for the session;
- decide which upstream host/service each dummy value maps to;
- perform substitution and protocol-aware upstream authentication;
- avoid returning real values to the child process.

This separation keeps the subprocess free of real secrets and makes the code
easier to evolve toward a broker implementation that does not live in the CLI
process.
