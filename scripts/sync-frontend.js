#!/usr/bin/env node
const { cp, mkdir, rm, stat } = require('fs/promises');
const { resolve } = require('path');

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function main() {
  const distDir = resolve(__dirname, '..', 'frontend', 'dist');
  const targetDir = resolve(__dirname, '..', 'backend', 'public');

  try {
    await stat(distDir);
  } catch (error) {
    throw new Error(
      `Expected build output in "${distDir}" but nothing was found. ` +
        'Run "npm --prefix frontend run build" before syncing.'
    );
  }

  await rm(targetDir, { recursive: true, force: true });
  await ensureDir(targetDir);
  await cp(distDir, targetDir, { recursive: true });

  // Write a small version.json so the frontend can display build metadata
  try {
    const { writeFile } = require('fs/promises');
    const { join } = require('path');
    const meta = {
      sha: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GITHUB_SHA || process.env.COMMIT_SHA || undefined,
      message: process.env.RAILWAY_GIT_COMMIT_MESSAGE || process.env.GIT_COMMIT_MESSAGE || undefined,
      branch: process.env.RAILWAY_GIT_BRANCH || process.env.GITHUB_REF_NAME || process.env.GIT_BRANCH || undefined,
      time: new Date().toISOString()
    };
    await writeFile(join(targetDir, 'version.json'), JSON.stringify(meta, null, 2));
    console.log('ℹ️  Wrote version.json with build metadata');
  } catch (e) {
    console.warn('⚠️  Could not write version.json:', e?.message || e);
  }

  console.log(`✅ Synced frontend build from ${distDir} to ${targetDir}`);
}

main().catch((error) => {
  console.error('Failed to sync frontend assets:', error);
  process.exitCode = 1;
});
