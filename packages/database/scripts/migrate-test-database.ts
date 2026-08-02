import process from 'node:process';

import {
  prepareIsolatedTestDatabase,
  readIsolatedTestDatabaseUrl,
} from '../src/testing/isolated-database.js';

const databaseUrl = readIsolatedTestDatabaseUrl(process.env);
const pool = await prepareIsolatedTestDatabase(databaseUrl);

await pool.end();
console.log('Committed migrations applied to the isolated test database.');
