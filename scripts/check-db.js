/* eslint-disable no-console */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import semver from 'semver';
import pg from 'pg';

const MIN_VERSION = '9.4.0';

if (process.env.SKIP_DB_CHECK) {
  console.log('Skipping database check.');
  process.exit(0);
}

// Use pg directly instead of PrismaPg adapter to avoid Supabase pooler
// compatibility issues during build-time checks.
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  ssl: { rejectUnauthorized: false },
});

function success(msg) {
  console.log(chalk.greenBright(`✓ ${msg}`));
}

function error(msg) {
  console.log(chalk.redBright(`✗ ${msg}`));
}

async function checkEnv() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined.');
  } else {
    success('DATABASE_URL is defined.');
  }

  if (process.env.REDIS_URL) {
    success('REDIS_URL is defined.');
  }
}

async function checkConnection() {
  try {
    const client = await pool.connect();
    client.release();

    success('Database connection successful.');
  } catch (e) {
    throw new Error(`Unable to connect to the database: ${e.message}`);
  }
}

async function checkDatabaseVersion() {
  const { rows } = await pool.query('SELECT version() AS version');
  const version = semver.valid(semver.coerce(rows[0].version));

  if (semver.lt(version, MIN_VERSION)) {
    throw new Error(
      `Database version is not compatible. Please upgrade to ${MIN_VERSION} or greater.`,
    );
  }

  success('Database version check successful.');
}

async function applyMigration() {
  if (!process.env.SKIP_DB_MIGRATION) {
    try {
      console.log(execSync('prisma migrate resolve --applied 17_remove_duplicate_key').toString());
    } catch (e) {
      // Ignore errors if the migration doesn't exist or is already resolved
    }
    console.log(execSync('prisma migrate deploy').toString());

    success('Database is up to date.');
  }
}

(async () => {
  let err = false;
  for (const fn of [checkEnv, checkConnection, checkDatabaseVersion, applyMigration]) {
    try {
      await fn();
    } catch (e) {
      error(e.message);
      err = true;
    } finally {
      if (err) {
        await pool.end();
        process.exit(1);
      }
    }
  }
  await pool.end();
})();
