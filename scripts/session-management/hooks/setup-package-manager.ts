#!/usr/bin/env bun
/**
 * Package Manager Setup Script
 *
 * Interactive script to configure preferred package manager.
 * Can be run directly or via the /setup-pm command.
 *
 * Usage:
 *   bun hooks/setup-package-manager.ts [pm-name]
 *   bun hooks/setup-package-manager.ts --detect
 *   bun hooks/setup-package-manager.ts --global pnpm
 *   bun hooks/setup-package-manager.ts --project bun
 */

import {
  detectFromLockFile,
  detectFromPackageJson,
  getAvailablePackageManagers,
  getPackageManager,
  PACKAGE_MANAGERS,
  setPreferredPackageManager,
  setProjectPackageManager,
} from '../lib/package-manager';

function showHelp(): void {
  console.log(`
Package Manager Setup for Cursor

Usage:
  bun hooks/setup-package-manager.ts [options] [package-manager]

Options:
  --detect        Detect and show current package manager
  --global <pm>   Set global preference (saves to ~/.cursor/package-manager.json)
  --project <pm>  Set project preference (saves to .cursor/package-manager.json)
  --list          List available package managers
  --help          Show this help message

Package Managers:
  npm             Node Package Manager (default with Node.js)
  pnpm            Fast, disk space efficient package manager
  yarn            Classic Yarn package manager
  bun             All-in-one JavaScript runtime & toolkit

Examples:
  # Detect current package manager
  bun hooks/setup-package-manager.ts --detect

  # Set pnpm as global preference
  bun hooks/setup-package-manager.ts --global pnpm

  # Set bun for current project
  bun hooks/setup-package-manager.ts --project bun

  # List available package managers
  bun hooks/setup-package-manager.ts --list
`);
}

async function detectAndShow(): Promise<void> {
  const pm = await getPackageManager();
  const available = await getAvailablePackageManagers();
  const fromLock = await detectFromLockFile();
  const fromPkg = await detectFromPackageJson();

  console.log('\n=== Package Manager Detection ===\n');

  console.log('Current selection:');
  console.log(`  Package Manager: ${pm.name}`);
  console.log(`  Source: ${pm.source}`);
  console.log('');

  console.log('Detection results:');
  console.log(`  From package.json: ${fromPkg || 'not specified'}`);
  console.log(`  From lock file: ${fromLock || 'not found'}`);
  console.log(
    `  Environment var: ${process.env.CURSOR_PACKAGE_MANAGER || 'not set'}`,
  );
  console.log('');

  console.log('Available package managers:');
  for (const pmName of Object.keys(PACKAGE_MANAGERS) as Array<
    keyof typeof PACKAGE_MANAGERS
  >) {
    const installed = available.includes(pmName);
    const indicator = installed ? '✓' : '✗';
    const current = pmName === pm.name ? ' (current)' : '';
    console.log(`  ${indicator} ${pmName}${current}`);
  }

  console.log('');
  console.log('Commands:');
  console.log(`  Install: ${pm.config.installCmd}`);
  console.log(`  Run script: ${pm.config.runCmd} [script-name]`);
  console.log(`  Execute binary: ${pm.config.execCmd} [binary-name]`);
  console.log('');
}

async function listAvailable(): Promise<void> {
  const available = await getAvailablePackageManagers();
  const pm = await getPackageManager();

  console.log('\nAvailable Package Managers:\n');

  for (const pmName of Object.keys(PACKAGE_MANAGERS) as Array<
    keyof typeof PACKAGE_MANAGERS
  >) {
    const config = PACKAGE_MANAGERS[pmName];
    const installed = available.includes(pmName);
    const current = pmName === pm.name ? ' (current)' : '';

    console.log(`${pmName}${current}`);
    console.log(`  Installed: ${installed ? 'Yes' : 'No'}`);
    console.log(`  Lock file: ${config.lockFile}`);
    console.log(`  Install: ${config.installCmd}`);
    console.log(`  Run: ${config.runCmd}`);
    console.log('');
  }
}

async function setGlobal(pmName: string): Promise<void> {
  if (!(pmName in PACKAGE_MANAGERS)) {
    console.error(`Error: Unknown package manager "${pmName}"`);
    console.error(`Available: ${Object.keys(PACKAGE_MANAGERS).join(', ')}`);
    process.exit(1);
  }

  const available = await getAvailablePackageManagers();
  if (!available.includes(pmName)) {
    console.warn(`Warning: ${pmName} is not installed on your system`);
  }

  try {
    await setPreferredPackageManager(pmName);
    console.log(`\n✓ Global preference set to: ${pmName}`);
    console.log('  Saved to: ~/.cursor/package-manager.json');
    console.log('');
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

async function setProject(pmName: string): Promise<void> {
  if (!(pmName in PACKAGE_MANAGERS)) {
    console.error(`Error: Unknown package manager "${pmName}"`);
    console.error(`Available: ${Object.keys(PACKAGE_MANAGERS).join(', ')}`);
    process.exit(1);
  }

  try {
    await setProjectPackageManager(pmName);
    console.log(`\n✓ Project preference set to: ${pmName}`);
    console.log('  Saved to: .cursor/package-manager.json');
    console.log('');
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// Main
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  if (args.includes('--detect')) {
    await detectAndShow();
    process.exit(0);
  }

  if (args.includes('--list')) {
    await listAvailable();
    process.exit(0);
  }

  const globalIdx = args.indexOf('--global');
  if (globalIdx !== -1) {
    const pmName = args[globalIdx + 1];
    if (!pmName) {
      console.error('Error: --global requires a package manager name');
      process.exit(1);
    }
    await setGlobal(pmName);
    process.exit(0);
  }

  const projectIdx = args.indexOf('--project');
  if (projectIdx !== -1) {
    const pmName = args[projectIdx + 1];
    if (!pmName) {
      console.error('Error: --project requires a package manager name');
      process.exit(1);
    }
    await setProject(pmName);
    process.exit(0);
  }

  // If just a package manager name is provided, set it globally
  const pmName = args[0];
  if (pmName in PACKAGE_MANAGERS) {
    await setGlobal(pmName);
  } else {
    console.error(`Error: Unknown option or package manager "${pmName}"`);
    showHelp();
    process.exit(1);
  }
}

main();
