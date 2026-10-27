import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  CiLogReplay,
  CiReplayLimitError,
  CiStreamOutputError,
  writeCiOutput,
} from '../../../../src/util/ci/streaming';

const line = { timestamp: 10, level: 'info', message: 'repeat' };

describe('CI streaming output', () => {
  it('awaits drain and removes temporary listeners', async () => {
    let flush: (() => void) | undefined;
    const stream = new Writable({
      highWaterMark: 1,
      write(_chunk, _encoding, callback) {
        flush = callback;
      },
    });
    const settled = vi.fn();
    const writing = writeCiOutput(stream, 'record\n').then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    flush!();
    await writing;
    expect(settled).toHaveBeenCalledTimes(1);
    for (const event of ['drain', 'close', 'error'])
      expect(stream.listenerCount(event)).toBe(0);
    stream.destroy();
  });

  it('rejects a closed slow destination without leaking listeners', async () => {
    const stream = new Writable({ highWaterMark: 1, write() {} });
    const writing = expect(
      writeCiOutput(stream, 'record\n')
    ).rejects.toBeInstanceOf(CiStreamOutputError);
    stream.destroy();
    await writing;
    expect(stream.listenerCount('drain')).toBe(0);
    expect(stream.listenerCount('error')).toBe(0);
  });

  it('rejects write errors and already destroyed output', async () => {
    const stream = new Writable({
      highWaterMark: 1,
      write(_chunk, _encoding, callback) {
        callback(new Error('broken'));
      },
    });
    await expect(writeCiOutput(stream, 'record\n')).rejects.toBeInstanceOf(
      CiStreamOutputError
    );
    await expect(writeCiOutput(stream, 'record\n')).rejects.toBeInstanceOf(
      CiStreamOutputError
    );
  });
});

describe('full log replay', () => {
  it('preserves multiplicity and older late arrivals even when replay is reordered', () => {
    const replay = new CiLogReplay();
    const first = replay.begin();
    expect(first(line)).toBe(true);
    expect(first(line)).toBe(true);
    const next = replay.begin();
    expect(next({ ...line, timestamp: 1, message: 'late' })).toBe(true);
    expect(next(line)).toBe(false);
    expect(next(line)).toBe(false);
    expect(next(line)).toBe(true);
    const last = replay.begin();
    expect(last(line)).toBe(false);
    expect(last(line)).toBe(false);
    expect(last(line)).toBe(false);
    expect(last({ ...line, timestamp: 1, message: 'late' })).toBe(false);
  });

  it('fails explicitly at its byte or distinct-record cap without eviction', () => {
    expect(() => new CiLogReplay(1).begin()(line)).toThrow(CiReplayLimitError);
    const replay = new CiLogReplay(1024, 1);
    expect(replay.begin()(line)).toBe(true);
    expect(() => replay.begin()({ ...line, message: 'another' })).toThrow(
      CiReplayLimitError
    );
    expect(replay.begin()(line)).toBe(false);
  });
});
