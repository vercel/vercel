import { describe, expect, it } from 'vitest';
import { diffLines, diffPreview, renderDiff } from '../src/diff';

describe('diffPreview', () => {
  it('masks secrets and folds unchanged runs into gaps', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].join('\n');
    const after = [
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'KEY=vck_supersecretvalue',
    ].join('\n');
    const lines = diffPreview(before, after, {
      secrets: ['vck_supersecretvalue'],
      context: 1,
    });
    expect(lines[0]).toEqual({ type: 'gap' });
    expect(lines).toContainEqual({ type: '+', text: 'KEY=vck_••••alue' });
    expect(JSON.stringify(lines)).not.toContain('supersecret');
  });

  it('is empty when nothing changes', () => {
    expect(diffPreview('same', 'same')).toEqual([]);
    expect(renderDiff('same', 'same')).toBe('');
  });
});

describe('renderDiff', () => {
  it('renders plain text, or styled with the given colors', () => {
    expect(renderDiff('a\nb', 'a\nc', { indent: '' })).toBe('  a\n- b\n+ c');
    const styled = renderDiff('a', 'b', {
      indent: '',
      colors: {
        dim: s => `<d>${s}`,
        added: s => `<+>${s}`,
        removed: s => `<->${s}`,
      },
    });
    expect(styled).toBe('<->- a\n<+>+ b');
  });

  it('redacts recognizable key fields it was not told about', () => {
    const out = renderDiff('{}', '{"apiKey": "vck_abcdefghijkl"}', {
      indent: '',
    });
    expect(out).toContain('"apiKey": "vck_••••ijkl"');
  });
});

describe('diffLines', () => {
  it('diffs only the middle of a large file', () => {
    const lines = Array.from(
      { length: 200_000 },
      (_, i) => `  "line${i}": ${i},`
    );
    const before = lines.join('\n');
    const after = [
      ...lines.slice(0, 5),
      '  "mcpServers": {},',
      ...lines.slice(5),
    ].join('\n');
    const changed = diffLines(before, after).filter(l => l.type !== ' ');
    expect(changed).toEqual([{ type: '+', text: '  "mcpServers": {},' }]);
  });

  it('shows a large rewrite as removed then added', () => {
    const before = Array.from({ length: 3000 }, (_, i) => `a${i}`).join('\n');
    const after = Array.from({ length: 3000 }, (_, i) => `b${i}`).join('\n');
    const lines = diffLines(before, after);
    expect(lines).toHaveLength(6000);
    expect(lines[2999]).toEqual({ type: '-', text: 'a2999' });
    expect(lines[3000]).toEqual({ type: '+', text: 'b0' });
  });

  it('keeps matching ends as context', () => {
    expect(renderDiff('a\nb\nc', 'a\nx\nc', { indent: '' })).toBe(
      '  a\n- b\n+ x\n  c'
    );
  });
});

describe('secret masking', () => {
  const old = 'sk-oldsecretvalue1234';
  it.each([
    ['sh export', `export AIDER_OPENAI_API_KEY='${old}'`],
    ['sh token export', `export ANTHROPIC_AUTH_TOKEN="${old}"`],
    ['fish export', `set -gx GROK_CODE_XAI_API_KEY '${old}'`],
    ['TOML api_key', `api_key = "${old}"`],
    ['YAML apiKey', `  apiKey: '${old}'`],
    ['JSON env key', `"OPENAI_API_KEY": "${old}"`],
    ['JSON apiKey', `"apiKey": "${old}"`],
    ['JSON key', `"key": "${old}"`],
  ])('masks a %s', (_label, line) => {
    const out = renderDiff(line, '', { indent: '' });
    expect(out).not.toContain(old);
    expect(out).toContain('sk-o••••1234');
  });

  it('masks AI Gateway keys anywhere', () => {
    const out = renderDiff('note: vck_abcdefghijklmnop', '', { indent: '' });
    expect(out).toBe('- note: vck_••••mnop');
  });

  it.each([
    `export AI_GATEWAY_API_KEY="$(security find-generic-password -s 'Vercel AI Gateway' -a vercel-ai-gateway -w)"`,
    'env_key = "AI_GATEWAY_API_KEY"',
    '"api_key": "$AI_GATEWAY_API_KEY"',
  ])('leaves references readable: %s', line => {
    expect(renderDiff(line, '', { indent: '' })).toBe(`- ${line}`);
  });
});
