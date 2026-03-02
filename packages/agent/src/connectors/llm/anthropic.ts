import Anthropic from "@anthropic-ai/sdk";
import type { LlmConnector } from "./interface.js";

let client: Anthropic | null = null;

export class AnthropicLlmConnector implements LlmConnector {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(
    prompt: string,
    opts: { maxTokens: number; temperature: number },
  ): Promise<string> {
    if (!client) {
      client = new Anthropic({ apiKey: this.apiKey });
    }
    const response = await client.messages.create({
      model: this.model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content.find((item) => item.type === "text");
    return block?.text ?? "";
  }
}
