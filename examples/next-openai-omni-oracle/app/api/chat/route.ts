import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getKLAXThermalRisk, getCoinGeckoPrice, getSwarmPulse } from 'x402-omni-oracle';

export async function POST(req: Request) {
    const { messages } = await req.json() as { messages: any[] };

    const result = await streamText({
        model: openai('gpt-4-turbo'),
        messages,
        system: `You are an Agentic Assistant. You have access to the Omni-Oracle.`,
        tools: {
            getKLAXThermalRisk,
            getCoinGeckoPrice,
            getSwarmPulse
        }
    });

    return result.toTextStreamResponse();
}
