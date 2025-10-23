/**
 * Database Migration Script
 * Run this to create/update database schema
 *
 * Usage: npm run db:migrate
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('./connection');

async function migrate() {
  console.log('🔄 Running database migration...');

  try {
    // Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Execute schema
    await pool.query(schema);

    console.log('✅ Migration completed successfully');
    console.log('   - Tables: meters, energy_readings, thirty_min_blocks');
    console.log('   - Indexes created');
    console.log('   - Triggers set up');
    console.log('   - Default simulator meter seeded');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
