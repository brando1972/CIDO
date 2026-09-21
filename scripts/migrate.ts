import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const schemaPath = path.join(__dirname, "../src/db/schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");

  const connStr = process.env.DATABASE_URL || "postgres://postgres.hbewdpkyumcsultgebmj:PrHLIyDIUyy3URiDIunp7MgRsWa70vXA@aws-0-us-east-2.pooler.supabase.com:5432/postgres";
  const client = new Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false }
  });

  console.log("Connecting to PostgreSQL at:", connStr.replace(/:[^:@]+@/, ":***@"));
  await client.connect();

  console.log("Applying schema...");
  await client.query(sql);
  console.log("Schema applied successfully!");

  const tables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name LIKE 'cido_%'
    ORDER BY table_name;
  `);

  console.log("Confirmed CIDO tables in Supabase:", tables.rows.map(r => r.table_name));

  await client.end();
}

main().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
