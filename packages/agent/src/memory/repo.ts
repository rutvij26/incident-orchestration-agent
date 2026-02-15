import pg from "pg";
import { getConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const { POSTGRES_URL } = getConfig();
    pool = new Pool({ connectionString: POSTGRES_URL });
  }
  return pool;
}

export type RepoChunk = {
  path: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  embedding: number[] | null;
};

export type RepoSearchResult = {
  path: string;
  content: string;
  score: number;
};

function toVectorParam(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export async function initRepoMemory(): Promise<void> {
  const client = await getPool().connect();
  const { EMBEDDING_DIM } = getConfig();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    await client.query(`
      CREATE TABLE IF NOT EXISTS repo_embeddings (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        embedding VECTOR(${EMBEDDING_DIM}),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS repo_embeddings_path_chunk_idx
      ON repo_embeddings(path, chunk_index)
    `);
    if (EMBEDDING_DIM <= 2000) {
      await client.query(`
        CREATE INDEX IF NOT EXISTS repo_embeddings_embedding_idx
        ON repo_embeddings
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
      `);
    } else {
      logger.warn("Skipping ivfflat index; embedding dim > 2000", {
        embeddingDim: EMBEDDING_DIM,
      });
    }
  } finally {
    client.release();
  }
}

export async function upsertRepoChunks(chunks: RepoChunk[]): Promise<void> {
  if (chunks.length === 0) {
    return;
  }
  const client = await getPool().connect();
  try {
    for (const chunk of chunks) {
      await client.query(
        `
        INSERT INTO repo_embeddings (
          id, path, chunk_index, content, content_hash, embedding, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, now())
        ON CONFLICT (path, chunk_index) DO UPDATE SET
          content = EXCLUDED.content,
          content_hash = EXCLUDED.content_hash,
          embedding = EXCLUDED.embedding,
          updated_at = now()
        `,
        [
          `${chunk.path}:${chunk.chunkIndex}`,
          chunk.path,
          chunk.chunkIndex,
          chunk.content,
          chunk.contentHash,
          chunk.embedding ? toVectorParam(chunk.embedding) : null,
        ]
      );
    }
  } finally {
    client.release();
  }
}

export async function cleanupRepoChunks(
  path: string,
  maxIndex: number
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(
      `
      DELETE FROM repo_embeddings
      WHERE path = $1 AND chunk_index > $2
      `,
      [path, maxIndex]
    );
  } finally {
    client.release();
  }
}

export async function searchRepoChunks(
  embedding: number[],
  limit: number
): Promise<RepoSearchResult[]> {
  const client = await getPool().connect();
  try {
    const response = await client.query(
      `
      SELECT path, content, (1 - (embedding <-> $1)) AS score
      FROM repo_embeddings
      WHERE embedding IS NOT NULL
      ORDER BY embedding <-> $1
      LIMIT $2
      `,
      [toVectorParam(embedding), limit]
    );
    return response.rows.map((row) => ({
      path: row.path as string,
      content: row.content as string,
      score: Number(row.score),
    }));
  } finally {
    client.release();
  }
}
