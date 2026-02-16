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
  repoKey: string;
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

export type RepoIndexState = {
  repoKey: string;
  headSha: string;
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
        repo_key TEXT,
        path TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        embedding VECTOR(${EMBEDDING_DIM}),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query(
      "ALTER TABLE repo_embeddings ADD COLUMN IF NOT EXISTS repo_key TEXT"
    );
    await client.query(
      "UPDATE repo_embeddings SET repo_key = 'default' WHERE repo_key IS NULL"
    );
    await client.query(
      "ALTER TABLE repo_embeddings ALTER COLUMN repo_key SET NOT NULL"
    );
    await client.query(`
      DROP INDEX IF EXISTS repo_embeddings_path_chunk_idx
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS repo_embeddings_repo_path_chunk_idx
      ON repo_embeddings(repo_key, path, chunk_index)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS repo_index_state (
        repo_key TEXT PRIMARY KEY,
        head_sha TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
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

export async function getRepoIndexState(
  repoKey: string
): Promise<RepoIndexState | null> {
  const client = await getPool().connect();
  try {
    const response = await client.query(
      `
      SELECT repo_key, head_sha
      FROM repo_index_state
      WHERE repo_key = $1
      `,
      [repoKey]
    );
    const row = response.rows[0];
    if (!row) {
      return null;
    }
    return { repoKey: row.repo_key as string, headSha: row.head_sha as string };
  } finally {
    client.release();
  }
}

export async function setRepoIndexState(
  repoKey: string,
  headSha: string
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(
      `
      INSERT INTO repo_index_state (repo_key, head_sha, updated_at)
      VALUES ($1, $2, now())
      ON CONFLICT (repo_key) DO UPDATE SET
        head_sha = EXCLUDED.head_sha,
        updated_at = now()
      `,
      [repoKey, headSha]
    );
  } finally {
    client.release();
  }
}

export async function hasRepoEmbeddings(repoKey: string): Promise<boolean> {
  const client = await getPool().connect();
  try {
    const response = await client.query(
      `
      SELECT 1
      FROM repo_embeddings
      WHERE repo_key = $1
      LIMIT 1
      `,
      [repoKey]
    );
    return response.rowCount > 0;
  } finally {
    client.release();
  }
}

export async function clearRepoEmbeddings(repoKey: string): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("DELETE FROM repo_embeddings WHERE repo_key = $1", [
      repoKey,
    ]);
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
          id, repo_key, path, chunk_index, content, content_hash, embedding, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
        ON CONFLICT (repo_key, path, chunk_index) DO UPDATE SET
          content = EXCLUDED.content,
          content_hash = EXCLUDED.content_hash,
          embedding = EXCLUDED.embedding,
          updated_at = now()
        `,
        [
          `${chunk.repoKey}:${chunk.path}:${chunk.chunkIndex}`,
          chunk.repoKey,
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
  repoKey: string,
  path: string,
  maxIndex: number
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(
      `
      DELETE FROM repo_embeddings
      WHERE repo_key = $1 AND path = $2 AND chunk_index > $3
      `,
      [repoKey, path, maxIndex]
    );
  } finally {
    client.release();
  }
}

export async function searchRepoChunks(
  embedding: number[],
  limit: number,
  repoKey: string,
  minScore = 0
): Promise<RepoSearchResult[]> {
  const client = await getPool().connect();
  try {
    const response = await client.query(
      `
      SELECT path, content, (1 - (embedding <-> $1)) AS score
      FROM repo_embeddings
      WHERE repo_key = $2
        AND embedding IS NOT NULL
        AND (1 - (embedding <-> $1)) >= $3
      ORDER BY embedding <-> $1
      LIMIT $4
      `,
      [toVectorParam(embedding), repoKey, minScore, limit]
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

export async function getRepoChunkHashes(
  repoKey: string,
  path: string
): Promise<Map<number, string>> {
  const client = await getPool().connect();
  try {
    const response = await client.query(
      `
      SELECT chunk_index, content_hash
      FROM repo_embeddings
      WHERE repo_key = $1 AND path = $2
      `,
      [repoKey, path]
    );
    const map = new Map<number, string>();
    for (const row of response.rows) {
      map.set(Number(row.chunk_index), row.content_hash as string);
    }
    return map;
  } finally {
    client.release();
  }
}

export async function listRepoPaths(repoKey: string): Promise<string[]> {
  const client = await getPool().connect();
  try {
    const response = await client.query(
      `
      SELECT DISTINCT path
      FROM repo_embeddings
      WHERE repo_key = $1
      `,
      [repoKey]
    );
    return response.rows.map((row) => row.path as string);
  } finally {
    client.release();
  }
}

export async function deleteRepoChunksForPath(
  repoKey: string,
  path: string
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(
      `
      DELETE FROM repo_embeddings
      WHERE repo_key = $1 AND path = $2
      `,
      [repoKey, path]
    );
  } finally {
    client.release();
  }
}
