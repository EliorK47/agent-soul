/**
 * Package Manager Detection and Selection
 * Automatically detects the preferred package manager or lets user choose
 *
 * Supports: npm, pnpm, yarn, bun, pip, poetry
 */

import { join } from 'node:path';
import { commandExists, getClaudeDir, readFile, writeFile } from './utils';

export interface PackageManagerConfig {
  name: string;
  lockFile: string;
  installCmd: string;
  runCmd: string;
  execCmd: string;
  testCmd: string;
  buildCmd: string;
  devCmd: string;
}

export interface PackageManagerResult {
  name: string;
  config: PackageManagerConfig;
  source: string;
}

export interface PackageManagerOptions {
  projectDir?: string;
  fallbackOrder?: string[];
}

// Package manager definitions
export const PACKAGE_MANAGERS = {
  npm: {
    name: 'npm',
    lockFile: 'package-lock.json',
    installCmd: 'npm install',
    runCmd: 'npm run',
    execCmd: 'npx',
    testCmd: 'npm test',
    buildCmd: 'npm run build',
    devCmd: 'npm run dev',
  },
  pnpm: {
    name: 'pnpm',
    lockFile: 'pnpm-lock.yaml',
    installCmd: 'pnpm install',
    runCmd: 'pnpm',
    execCmd: 'pnpm dlx',
    testCmd: 'pnpm test',
    buildCmd: 'pnpm build',
    devCmd: 'pnpm dev',
  },
  yarn: {
    name: 'yarn',
    lockFile: 'yarn.lock',
    installCmd: 'yarn',
    runCmd: 'yarn',
    execCmd: 'yarn dlx',
    testCmd: 'yarn test',
    buildCmd: 'yarn build',
    devCmd: 'yarn dev',
  },
  bun: {
    name: 'bun',
    lockFile: 'bun.lockb',
    installCmd: 'bun install',
    runCmd: 'bun run',
    execCmd: 'bunx',
    testCmd: 'bun test',
    buildCmd: 'bun run build',
    devCmd: 'bun run dev',
  },
  pip: {
    name: 'pip',
    lockFile: 'requirements.txt',
    installCmd: 'pip install -r requirements.txt',
    runCmd: 'python -m',
    execCmd: 'python -m',
    testCmd: 'pytest',
    buildCmd: 'python setup.py build',
    devCmd: 'python -m flask run',
  },
  poetry: {
    name: 'poetry',
    lockFile: 'poetry.lock',
    installCmd: 'poetry install',
    runCmd: 'poetry run',
    execCmd: 'poetry run',
    testCmd: 'poetry run pytest',
    buildCmd: 'poetry build',
    devCmd: 'poetry run python -m flask run',
  },
} as const;

export type PackageManagerName = keyof typeof PACKAGE_MANAGERS;

// Priority order for detection (JS first, then Python)
export const DETECTION_PRIORITY: PackageManagerName[] = [
  'pnpm',
  'bun',
  'yarn',
  'npm',
  'poetry',
  'pip',
];

// Config file path
async function getConfigPath(): Promise<string> {
  return join(await getClaudeDir(), 'package-manager.json');
}

// Load saved package manager configuration
async function loadConfig(): Promise<{
  packageManager?: string;
  setAt?: string;
} | null> {
  const configPath = await getConfigPath();

  try {
    return await Bun.file(configPath).json();
  } catch {
    return null;
  }
}

// Save package manager configuration
async function saveConfig(config: {
  packageManager: string;
  setAt: string;
}): Promise<void> {
  const configPath = await getConfigPath();
  await writeFile(configPath, JSON.stringify(config, null, 2));
}

// Detect package manager from lock file in project directory
export async function detectFromLockFile(
  projectDir: string = process.cwd(),
): Promise<PackageManagerName | null> {
  for (const pmName of DETECTION_PRIORITY) {
    const pm = PACKAGE_MANAGERS[pmName];
    const lockFilePath = join(projectDir, pm.lockFile);

    if (await Bun.file(lockFilePath).exists()) {
      return pmName;
    }
  }

  // Check for alternative bun lock file name
  if (await Bun.file(join(projectDir, 'bun.lock')).exists()) {
    return 'bun';
  }

  // Check for pyproject.toml (Poetry)
  const pyprojectPath = join(projectDir, 'pyproject.toml');
  if (await Bun.file(pyprojectPath).exists()) {
    const content = await readFile(pyprojectPath);
    if (content?.includes('[tool.poetry]')) {
      return 'poetry';
    }
  }

  return null;
}

// Detect package manager from package.json packageManager field
export async function detectFromPackageJson(
  projectDir: string = process.cwd(),
): Promise<PackageManagerName | null> {
  const packageJsonPath = join(projectDir, 'package.json');

  try {
    const pkg = await Bun.file(packageJsonPath).json();
    if (pkg.packageManager) {
      // Format: "pnpm@8.6.0" or just "pnpm"
      const pmName = pkg.packageManager.split('@')[0];
      if (pmName in PACKAGE_MANAGERS) {
        return pmName as PackageManagerName;
      }
    }
  } catch {
    // Invalid or missing package.json
  }
  return null;
}

// Get available package managers (installed on system)
export async function getAvailablePackageManagers(): Promise<string[]> {
  const available: string[] = [];

  for (const pmName of Object.keys(PACKAGE_MANAGERS)) {
    if (await commandExists(pmName)) {
      available.push(pmName);
    }
  }

  return available;
}

/**
 * Get the package manager to use for current project
 *
 * Detection priority:
 * 1. Environment variable CURSOR_PACKAGE_MANAGER or CLAUDE_PACKAGE_MANAGER
 * 2. Project-specific config (in .cursor/package-manager.json or .claude/package-manager.json)
 * 3. package.json packageManager field
 * 4. Lock file detection
 * 5. Global user preference (in ~/.cursor/package-manager.json)
 * 6. First available package manager (by priority)
 */
export async function getPackageManager(
  options: PackageManagerOptions = {},
): Promise<PackageManagerResult> {
  const { projectDir = process.cwd(), fallbackOrder = DETECTION_PRIORITY } =
    options;

  // 1. Check environment variable
  const envPm =
    process.env.CURSOR_PACKAGE_MANAGER || process.env.CLAUDE_PACKAGE_MANAGER;
  if (envPm && envPm in PACKAGE_MANAGERS) {
    return {
      name: envPm,
      config: PACKAGE_MANAGERS[envPm as PackageManagerName],
      source: 'environment',
    };
  }

  // 2. Check project-specific config
  let projectConfigPath = join(projectDir, '.cursor', 'package-manager.json');

  try {
    const config = await Bun.file(projectConfigPath).json();
    if (config.packageManager && config.packageManager in PACKAGE_MANAGERS) {
      return {
        name: config.packageManager,
        config: PACKAGE_MANAGERS[config.packageManager as PackageManagerName],
        source: 'project-config',
      };
    }
  } catch {
    // Try .claude directory
    projectConfigPath = join(projectDir, '.claude', 'package-manager.json');
    try {
      const config = await Bun.file(projectConfigPath).json();
      if (config.packageManager && config.packageManager in PACKAGE_MANAGERS) {
        return {
          name: config.packageManager,
          config: PACKAGE_MANAGERS[config.packageManager as PackageManagerName],
          source: 'project-config',
        };
      }
    } catch {
      // No valid config found
    }
  }

  // 3. Check package.json packageManager field
  const fromPackageJson = await detectFromPackageJson(projectDir);
  if (fromPackageJson) {
    return {
      name: fromPackageJson,
      config: PACKAGE_MANAGERS[fromPackageJson],
      source: 'package.json',
    };
  }

  // 4. Check lock file
  const fromLockFile = await detectFromLockFile(projectDir);
  if (fromLockFile) {
    return {
      name: fromLockFile,
      config: PACKAGE_MANAGERS[fromLockFile],
      source: 'lock-file',
    };
  }

  // 5. Check global user preference
  const globalConfig = await loadConfig();
  if (
    globalConfig?.packageManager &&
    globalConfig.packageManager in PACKAGE_MANAGERS
  ) {
    const pmConfig =
      PACKAGE_MANAGERS[globalConfig.packageManager as PackageManagerName];
    return {
      name: globalConfig.packageManager,
      config: pmConfig,
      source: 'global-config',
    };
  }

  // 6. Use first available package manager
  const available = await getAvailablePackageManagers();
  for (const pmName of fallbackOrder) {
    if (available.includes(pmName)) {
      return {
        name: pmName,
        config: PACKAGE_MANAGERS[pmName as PackageManagerName],
        source: 'fallback',
      };
    }
  }

  // Default to npm (always available with Node.js)
  return {
    name: 'npm',
    config: PACKAGE_MANAGERS.npm,
    source: 'default',
  };
}

// Set user's preferred package manager (global)
export async function setPreferredPackageManager(
  pmName: string,
): Promise<{ packageManager: string; setAt: string }> {
  if (!(pmName in PACKAGE_MANAGERS)) {
    throw new Error(`Unknown package manager: ${pmName}`);
  }

  const _config = (await loadConfig()) || {};
  const newConfig = {
    packageManager: pmName,
    setAt: new Date().toISOString(),
  };
  await saveConfig(newConfig);

  return newConfig;
}

// Set project's preferred package manager
export async function setProjectPackageManager(
  pmName: string,
  projectDir: string = process.cwd(),
): Promise<{ packageManager: string; setAt: string }> {
  if (!(pmName in PACKAGE_MANAGERS)) {
    throw new Error(`Unknown package manager: ${pmName}`);
  }

  const configDir = join(projectDir, '.claude');
  const configPath = join(configDir, 'package-manager.json');

  const config = {
    packageManager: pmName,
    setAt: new Date().toISOString(),
  };

  await writeFile(configPath, JSON.stringify(config, null, 2));
  return config;
}

// Get the command to run a script
export async function getRunCommand(
  script: string,
  options: PackageManagerOptions = {},
): Promise<string> {
  const pm = await getPackageManager(options);

  switch (script) {
    case 'install':
      return pm.config.installCmd;
    case 'test':
      return pm.config.testCmd;
    case 'build':
      return pm.config.buildCmd;
    case 'dev':
      return pm.config.devCmd;
    default:
      return `${pm.config.runCmd} ${script}`;
  }
}

// Get the command to execute a package binary
export async function getExecCommand(
  binary: string,
  args: string = '',
  options: PackageManagerOptions = {},
): Promise<string> {
  const pm = await getPackageManager(options);
  return `${pm.config.execCmd} ${binary}${args ? ` ${args}` : ''}`;
}

// Interactive prompt for package manager selection
export async function getSelectionPrompt(): Promise<string> {
  const available = await getAvailablePackageManagers();
  const current = await getPackageManager();

  let message = '[PackageManager] Available package managers:\n';

  for (const pmName of available) {
    const indicator = pmName === current.name ? ' (current)' : '';
    message += `  - ${pmName}${indicator}\n`;
  }

  message += '\nTo set your preferred package manager:\n';
  message += '  - Global: Set CURSOR_PACKAGE_MANAGER environment variable\n';
  message +=
    '  - Or add to ~/.cursor/package-manager.json: {"packageManager": "pnpm"}\n';
  message += '  - Or add to package.json: {"packageManager": "pnpm@8"}\n';

  return message;
}

// Generate a regex pattern that matches commands for all package managers
export function getCommandPattern(action: string): string {
  const patterns: string[] = [];

  if (action === 'dev') {
    patterns.push(
      'npm run dev',
      'pnpm( run)? dev',
      'yarn dev',
      'bun run dev',
      'poetry run python -m flask run',
      'python -m flask run',
    );
  } else if (action === 'install') {
    patterns.push(
      'npm install',
      'pnpm install',
      'yarn( install)?',
      'bun install',
      'pip install -r requirements\\.txt',
      'poetry install',
    );
  } else if (action === 'test') {
    patterns.push(
      'npm test',
      'pnpm test',
      'yarn test',
      'bun test',
      'pytest',
      'poetry run pytest',
    );
  } else if (action === 'build') {
    patterns.push(
      'npm run build',
      'pnpm( run)? build',
      'yarn build',
      'bun run build',
      'python setup\\.py build',
      'poetry build',
    );
  } else {
    // Generic run command
    patterns.push(
      `npm run ${action}`,
      `pnpm( run)? ${action}`,
      `yarn ${action}`,
      `bun run ${action}`,
      `poetry run ${action}`,
      `python -m ${action}`,
    );
  }

  return `(${patterns.join('|')})`;
}
