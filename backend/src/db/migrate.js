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

    console.log('✅ Base schema completed');

    // Run additional migrations
    console.log('🔄 Applying interval column migration...');

    // Add interval column to meters table
    await pool.query(`
      ALTER TABLE meters ADD COLUMN IF NOT EXISTS reading_interval INTEGER DEFAULT 60;
    `);
    console.log('   ✓ Added reading_interval column to meters table');

    // Add interval column to energy_readings table
    await pool.query(`
      ALTER TABLE energy_readings ADD COLUMN IF NOT EXISTS reading_interval INTEGER DEFAULT 60;
    `);
    console.log('   ✓ Added reading_interval column to energy_readings table');

    // Update existing records to have default 60s interval
    await pool.query(`
      UPDATE meters SET reading_interval = 60 WHERE reading_interval IS NULL;
    `);
    await pool.query(`
      UPDATE energy_readings SET reading_interval = 60 WHERE reading_interval IS NULL;
    `);
    console.log('   ✓ Updated existing records with default interval');

    console.log('✅ Migration completed successfully');
    console.log('   - Tables: meters, energy_readings, thirty_min_blocks');
    console.log('   - Indexes created');
    console.log('   - Triggers set up');
    console.log('   - Default simulator meter seeded');
    console.log('   - Interval columns added');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
