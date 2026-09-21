import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AuthService } from "../src/auth/auth.service.js";
import { CidoDatabaseRepository } from "../src/db/db.js";

const { Client, Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CIDO_DB_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres.hbewdpkyumcsultgebmj:PrHLIyDIUyy3URiDIunp7MgRsWa70vXA@aws-0-us-east-2.pooler.supabase.com:5432/cido_db";

async function main() {
  console.log("=== CIDO Isolated Database Migration & User Seeding ===");
  console.log("Target Database:", CIDO_DB_URL.replace(/:[^:@]+@/, ":***@"));

  // 1. Connect and apply schema
  const schemaPath = path.join(__dirname, "../src/db/cido-schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf-8");

  const client = new Client({
    connectionString: CIDO_DB_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("Connected to cido_db. Applying schema...");
  await client.query(schemaSql);
  console.log("Schema applied successfully.");

  // Verify tables
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log("Confirmed tables in cido_db:", tablesRes.rows.map((r) => r.table_name));
  await client.end();

  // 2. Seed users
  const pool = new Pool({
    connectionString: CIDO_DB_URL,
    ssl: { rejectUnauthorized: false },
  });

  const repo = new CidoDatabaseRepository(pool);
  const auth = new AuthService(repo);

  const USERS_TO_SEED = [
    {
      username: "brandonlray",
      email: "brandonlray@cido.local",
      password: "Cido-Brandon-2026!#",
    },
    {
      username: "jmccool",
      email: "jmccool@cido.local",
      password: "Cido-JMcCool-2026!#",
    },
  ];

  console.log("\nSeeding user accounts with 2FA enabled...");
  const results = [];

  for (const u of USERS_TO_SEED) {
    const existing = await repo.findUserByUsername(u.username);
    let secret: string | undefined = undefined;
    if (existing?.totp_secret) {
      // Retain existing TOTP secret if already provisioned
      secret = existing.totp_secret;
    }

    const { user, secret: userSecret, uri } = await auth.seedUser({
      username: u.username,
      email: u.email,
      password: u.password,
      totpSecret: secret,
      totpEnabled: true,
    });

    results.push({
      username: user.username,
      email: user.email,
      password: u.password,
      totp_secret: userSecret,
      totp_uri: uri,
    });

    console.log(`✓ Provisioned ${user.username}`);
  }

  await pool.end();

  console.log("\n========================================================");
  console.log("            CIDO CREDENTIALS & 2FA ENROLLMENT            ");
  console.log("========================================================");
  for (const r of results) {
    console.log(`\nUser:        ${r.username}`);
    console.log(`Email:       ${r.email}`);
    console.log(`Password:    ${r.password}`);
    console.log(`2FA Secret:  ${r.totp_secret}`);
    console.log(`2FA URI:     ${r.totp_uri}`);
  }
  console.log("\n========================================================");
}

main().catch((err) => {
  console.error("Migration & Seeding failed:", err);
  process.exit(1);
});
