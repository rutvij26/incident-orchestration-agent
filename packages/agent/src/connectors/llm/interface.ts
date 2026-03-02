export interface LlmConnector {
  complete(
    prompt: string,
    opts: { maxTokens: number; temperature: number },
  ): Promise<string>;
}
