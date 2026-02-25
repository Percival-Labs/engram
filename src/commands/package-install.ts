import { existsSync, mkdirSync, readdirSync, copyFileSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { parse as parseYaml } from 'yaml';

const ENGRAM_HOME = process.env.ENGRAM_HOME || join(homedir(), '.engram');

interface PackageManifest {
  name: string;
  version: string;
  description?: string;
  skills?: string[];
  hooks?: string[];
  config?: string;
  memory_schema?: string[];
}

function copyDirRecursive(src: string, dest: string): number {
  let count = 0;
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      count += copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

export async function packageInstall(packagePath: string): Promise<void> {
  if (!existsSync(packagePath)) {
    console.error(`Package path not found: ${packagePath}`);
    process.exit(1);
  }

  // Read package manifest (PACKAGE.md or package.yaml)
  const packageName = basename(packagePath);
  let manifest: PackageManifest = { name: packageName, version: '0.0.0' };

  const yamlPath = join(packagePath, 'config', 'default.yaml');
  if (existsSync(yamlPath)) {
    try {
      const raw = readFileSync(yamlPath, 'utf-8');
      const config = parseYaml(raw);
      if (config.package) {
        manifest = { ...manifest, ...config.package };
      }
    } catch {
      // Use defaults
    }
  }

  console.log(`Installing package: ${manifest.name} v${manifest.version}`);

  let totalFiles = 0;

  // Install skills
  const skillsDir = join(packagePath, 'skills');
  if (existsSync(skillsDir)) {
    const destSkills = join(ENGRAM_HOME, 'skills');
    const count = copyDirRecursive(skillsDir, destSkills);
    totalFiles += count;
    console.log(`  Skills: ${count} files installed`);
  }

  // Install hooks
  const hooksDir = join(packagePath, 'hooks');
  if (existsSync(hooksDir)) {
    const destHooks = join(ENGRAM_HOME, 'hooks');
    mkdirSync(destHooks, { recursive: true });
    const entries = readdirSync(hooksDir).filter(f => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.mjs'));
    for (const entry of entries) {
      copyFileSync(join(hooksDir, entry), join(destHooks, entry));
      totalFiles++;
    }
    console.log(`  Hooks: ${entries.length} files installed`);
  }

  // Install config
  const configDir = join(packagePath, 'config');
  if (existsSync(configDir)) {
    const destConfig = join(ENGRAM_HOME, 'packages', manifest.name);
    mkdirSync(destConfig, { recursive: true });
    const entries = readdirSync(configDir);
    for (const entry of entries) {
      const srcPath = join(configDir, entry);
      copyFileSync(srcPath, join(destConfig, entry));
      totalFiles++;
    }
    console.log(`  Config: ${entries.length} files installed`);
  }

  // Create memory directories for the package
  const memoryDir = join(ENGRAM_HOME, 'memory', manifest.name.toLowerCase());
  if (!existsSync(memoryDir)) {
    mkdirSync(memoryDir, { recursive: true });
    console.log(`  Memory: created ${memoryDir}`);
  }

  console.log(`\nPackage ${manifest.name} installed (${totalFiles} files)`);
}
