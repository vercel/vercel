import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  let body = '';
  await new Promise<void>((resolve) => {
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve());
  });
  const { provider, apiKey, prompt, messages, model, stream } = JSON.parse(body);

  if (!provider || !apiKey || !prompt) {
    return res.status(400).json({ error: 'Missing provider, apiKey, or prompt' });
  }

  try {
    if (provider === 'openai' && stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders && res.flushHeaders();
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-3.5-turbo',
          messages: messages || [{ role: 'user', content: prompt }],
          stream: true,
        }),
      });
      if (!response.body) throw new Error('No response body');
      const reader = response.body.getReader();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += new TextDecoder().decode(value);
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.replace('data: ', '').trim();
            if (data === '[DONE]') {
              res.write('event: done\ndata: [DONE]\n\n');
              res.end();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const token = parsed.choices?.[0]?.delta?.content;
              if (token) {
                res.write(`data: ${JSON.stringify(token)}\n\n`);
              }
            } catch {}
          }
        }
      }
      res.end();
      return;
    }
    // Non-streaming fallback for all providers
    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-3.5-turbo',
          messages: messages || [{ role: 'user', content: prompt }],
        }),
      });
      const data = await response.json();
      return res.status(200).json({ response: data });
    } else if (provider === 'anthropic') {
      // Anthropic Claude v1/v2 API
      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model || 'claude-3-opus-20240229',
          max_tokens: 1024,
          messages: messages || [{ role: 'user', content: prompt }],
        }),
      });
      const data = await anthropicRes.json();
      return res.status(200).json({ response: data });
    } else if (provider === 'gemini') {
      // Gemini API (Google AI Studio)
      const geminiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + encodeURIComponent(apiKey), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: prompt }] }
          ],
        }),
      });
      const data = await geminiRes.json();
      return res.status(200).json({ response: data });
    } else {
      return res.status(400).json({ error: 'Unknown provider' });
    }
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
} 