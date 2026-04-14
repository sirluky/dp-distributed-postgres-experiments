import { Pool } from 'pg';

export const getDb = (connectionString: string) => {
  return new Pool({
    connectionString,
    connectionTimeoutMillis: 5000,
  });
};
