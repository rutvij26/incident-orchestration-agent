export interface EmbeddingConnector {
  embed(text: string): Promise<number[]>;
}
