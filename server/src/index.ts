import { Pool } from "pg";
import { createApp, type NodeRole } from "./app";

function createPool() {
  return new Pool({
    host: process.env.DB_HOST ?? "localhost",
    port: parseInt(process.env.DB_PORT ?? "35432"),
    database: process.env.DB_NAME ?? "core_db",
    user: process.env.DB_USER ?? "admin",
    password: process.env.DB_PASSWORD ?? "admin",
    max: 50,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

const pool = createPool();
const edgeId = process.env.EDGE_ID ?? "core";
const role = (process.env.NODE_ROLE as NodeRole) ?? "all";
const app = createApp(pool, { edgeId, role });

app.listen(parseInt(process.env.PORT ?? "3000"), () => {
  console.log(
    `🦊 Elysia @ ${app.server?.hostname}:${app.server?.port} | role=${role} | edge_id=${edgeId} | db=${process.env.DB_NAME ?? "core_db"}`,
  );
});


