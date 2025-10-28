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

  console.log(`✅ Synced frontend build from ${distDir} to ${targetDir}`);
}

main().catch((error) => {
  console.error('Failed to sync frontend assets:', error);
  process.exitCode = 1;
});
