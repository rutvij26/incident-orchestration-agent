import pg from "pg";

const { Pool } = pg;

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: pg.Pool | undefined;
}

// Lazy singleton — created on first use, not at module load (avoids build-time errors)
export function getPool(): pg.Pool {
  if (globalThis._pgPool) return globalThis._pgPool;
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("POSTGRES_URL environment variable is not set");
  }
  globalThis._pgPool = new Pool({ connectionString, max: 5 });
  return globalThis._pgPool;
}

// Shorthand for the most common usage pattern
export const pool = {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<pg.QueryResult<T>> {
    return getPool().query<T>(text, values);
  },
};
