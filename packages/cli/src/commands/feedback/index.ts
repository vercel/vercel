import rawBody from 'raw-body';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { help } from '../help';
import { feedbackCommand } from './command';
import fetch, { toNodeReadable } from '../../util/fetch';
import pkg from '../../util/pkg';
import ua from '../../util/ua';
import output from '../../output-manager';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { FeedbackTelemetryClient } from '../../util/telemetry/commands/feedback';
import { recordCliError } from '../../util/telemetry/cli-error';
import { readStdinText } from '../../util/input/read-standard-input';

export const FEEDBACK_URL = 'https://vercel.com/api/feedback/cli';
export const MAX_FEEDBACK_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

export default async function feedback(client: Client): Promise<number> {
  const fail = (reason: string, message: string, code: 1 | 2): number => {
    recordCliError({ code: reason });
    output.error(message);
    return code;
  };

  let parsed;
  try {
    parsed = parseArguments(
      client.argv.slice(2),
      getFlagsSpecification(feedbackCommand.options)
    );
  } catch {
    // Parser messages can contain submitted data. Never echo them.
    return fail(
      AGENT_REASON.INVALID_ARGUMENTS,
      'Invalid feedback arguments. Run vercel feedback --help for usage.',
      2
    );
  }
  const notes = parsed.args.slice(1);
  const fields = parsed.flags['--field'] ?? [];
  if (notes.length === 0 && fields.length === 0) {
    client.stdout.write(
      help(feedbackCommand, {
        stream: client.stdout,
        columns: client.stdout.columns ?? client.stderr.columns,
      })
    );
    return 0;
  }
  if (notes.length > 1) {
    return fail(
      AGENT_REASON.INVALID_ARGUMENTS,
      'Pass one note. Quote notes containing spaces, or use vercel feedback - to read stdin.',
      2
    );
  }

  const telemetry = new FeedbackTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  telemetry.trackCliArgumentNote(notes[0]);
  telemetry.trackCliOptionField(fields);

  // A null prototype preserves arbitrary named fields, including __proto__.
  const data: Record<string, string> = Object.create(null);
  for (const field of fields) {
    const separator = field.indexOf('=');
    const key = field.slice(0, separator).trim();
    if (separator < 1 || key === '') {
      return fail(
        AGENT_REASON.INVALID_ARGUMENTS,
        'Each --field needs a non-empty key followed by =value. Example: vercel feedback --field topic=deploy.',
        2
      );
    }
    data[key] = field.slice(separator + 1);
  }
  if (notes.length && Object.hasOwn(data, 'note')) {
    return fail(
      AGENT_REASON.INVALID_ARGUMENTS,
      'Provide the note once: use a positional note or --field note=..., rather than both.',
      2
    );
  }
  if (notes[0] === '-') {
    if (client.stdin.isTTY) {
      return fail(
        AGENT_REASON.INVALID_ARGUMENTS,
        'No input was piped to stdin. Pipe a note with: cat notes.md | vercel feedback -',
        2
      );
    }
    try {
      data.note = await readStdinText(client.stdin, MAX_FEEDBACK_BYTES);
    } catch (error) {
      return (error as { type?: string }).type === 'entity.too.large'
        ? fail(
            AGENT_REASON.INVALID_ARGUMENTS,
            'Feedback is too large. Keep the complete submission below 1 MiB.',
            2
          )
        : fail(
            AGENT_REASON.STDIN_ERROR,
            'Could not read the feedback note from stdin. Check the input pipe and try again.',
            1
          );
    }
  } else if (notes[0] !== undefined) {
    data.note = notes[0];
  }
  for (const key of Object.keys(data)) {
    if (!data[key].trim()) delete data[key];
  }
  if (!Object.keys(data).length) {
    return fail(
      AGENT_REASON.INVALID_ARGUMENTS,
      'Provide a note or at least one named field. Run vercel feedback --help for examples.',
      2
    );
  }

  const canSendTelemetry = client.telemetryEventStore?.enabled ?? false;

  const body = JSON.stringify({
    metadata: canSendTelemetry
      ? {
          agent: client.isAgent,
          agent_name: client.isAgent ? client.agentName : undefined,
          cli_version: pkg.version,
          operating_system: process.platform,
          team_id: client.config.currentTeam ?? null,
          user_id: client.authConfig.userId ?? null,
          invocation_id:
            client.telemetryEventStore?.currentInvocationId ?? null,
          session_id: client.telemetryEventStore?.currentSessionId ?? null,
        }
      : null,
    data,
  });
  if (Buffer.byteLength(body) > MAX_FEEDBACK_BYTES) {
    return fail(
      AGENT_REASON.INVALID_ARGUMENTS,
      'Feedback is too large. Keep the complete submission below 1 MiB.',
      2
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  timeout.unref?.();
  try {
    // No redirects, auth lookup, or automatic retries. A failed
    // connection may have already submitted the feedback.
    const response = await fetch(FEEDBACK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': ua },
      body,
      redirect: 'manual',
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      return fail(
        response.status === 429
          ? AGENT_REASON.RATE_LIMITED
          : AGENT_REASON.API_ERROR,
        `Feedback could not be submitted (HTTP ${response.status}). Try again later.`,
        1
      );
    }
    const responseBody = toNodeReadable(response.body);
    const result = JSON.parse(
      await rawBody(responseBody, {
        limit: 64 * 1024,
        encoding: 'utf8',
      }).finally(() => responseBody.destroy())
    );
    if (result?.success !== true) {
      return fail(
        AGENT_REASON.UNKNOWN_OUTCOME,
        'Could not confirm that Vercel accepted the feedback. It may have been submitted; no automatic retry was made.',
        1
      );
    }
    client.stdout.write('Feedback sent\n');
    return 0;
  } catch {
    return fail(
      AGENT_REASON.UNKNOWN_OUTCOME,
      'Could not confirm that Vercel accepted the feedback. Check your connection. It may have been submitted; no automatic retry was made.',
      1
    );
  } finally {
    clearTimeout(timeout);
  }
}
