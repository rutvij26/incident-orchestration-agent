import OpenAI from "openai";
import type { LlmConnector } from "./interface.js";

let client: OpenAI | null = null;

export class OpenAILlmConnector implements LlmConnector {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(
    prompt: string,
    opts: { maxTokens: number; temperature: number },
  ): Promise<string> {
    if (!client) {
      client = new OpenAI({ apiKey: this.apiKey });
    }
    const response = await client.chat.completions.create({
      model: this.model,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      messages: [
        { role: "system", content: "Return JSON only." },
        { role: "user", content: prompt },
      ],
    });
    return response.choices[0]?.message?.content ?? "";
  }
}
