import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { MARKER, buildBootstrap, buildNewAppDts, processAppDts } from './shared.js';

const POLYFILLS = {
	official: {
		pkg: '@js-temporal/polyfill',
		label: '@js-temporal/polyfill',
		hint: 'Official TC39 polyfill, ~100KB gzipped, most spec-conservative'
	},
	small: {
		pkg: 'temporal-polyfill',
		label: 'temporal-polyfill',
		hint: 'Smaller alternative (~40KB gzipped) by Adam Shaw, same API surface'
	}
};

export async function run() {
	console.log();
	p.intro(pc.bgCyan(pc.black(' sveltekit-temporal ')));

	const cwd = process.cwd();

	// 1. Validate we're in a SvelteKit project
	const projectInfo = detectProject(cwd);
	if (!projectInfo.ok) {
		p.cancel(projectInfo.reason);
		process.exit(1);
	}

	const { isTypeScript, pkgJson, pkgManager } = projectInfo;

	p.log.info(
		`Detected ${pc.cyan('SvelteKit')} project ${
			isTypeScript ? pc.dim('(TypeScript)') : pc.dim('(JavaScript)')
		} using ${pc.cyan(pkgManager)}`
	);

	// 2. Pick polyfill
	const choice = await p.select({
		message: 'Which Temporal polyfill would you like to use?',
		options: [
			{
				value: 'official',
				label: POLYFILLS.official.label,
				hint: POLYFILLS.official.hint
			},
			{
				value: 'small',
				label: POLYFILLS.small.label,
				hint: POLYFILLS.small.hint
			}
		]
	});

	if (p.isCancel(choice)) {
		p.cancel('Cancelled.');
		process.exit(0);
	}

	const polyfill = POLYFILLS[choice];

	// 3. Check for existing setup
	const alreadyInstalled =
		pkgJson.dependencies?.[polyfill.pkg] || pkgJson.devDependencies?.[polyfill.pkg];

	// 4. Install dependency
	if (!alreadyInstalled) {
		const spin = p.spinner();
		spin.start(`Installing ${polyfill.pkg}`);
		try {
			execSync(installCommand(pkgManager, polyfill.pkg), {
				cwd,
				stdio: 'pipe'
			});
			spin.stop(`Installed ${pc.green(polyfill.pkg)}`);
		} catch (err) {
			spin.stop(pc.red(`Failed to install ${polyfill.pkg}`));
			p.log.error(err.message);
			process.exit(1);
		}
	} else {
		p.log.info(`${polyfill.pkg} already in package.json — skipping install`);
	}

	// 5. Write files
	const ext = isTypeScript ? 'ts' : 'js';
	const created = [];
	const updated = [];
	const skipped = [];

	// 5a. src/lib/temporal.{ts,js}
	const libDir = join(cwd, 'src', 'lib');
	mkdirSync(libDir, { recursive: true });
	const bootstrapPath = join(libDir, `temporal.${ext}`);
	const bootstrapContents = buildBootstrap(polyfill.pkg, isTypeScript);
	writeManaged(bootstrapPath, bootstrapContents, { created, updated, skipped });

	// 5b. src/routes/+layout.{ts,js} — preserve existing content, ensure import
	const layoutPath = join(cwd, 'src', 'routes', `+layout.${ext}`);
	ensureImportInFile(layoutPath, "import '$lib/temporal';", { created, updated, skipped });

	// 5c. app.d.ts (TypeScript only)
	if (isTypeScript) {
		const dtsPath = join(cwd, 'src', 'app.d.ts');
		updateAppDts(dtsPath, polyfill.pkg, { created, updated, skipped });
	}

	// 6. Summary
	const summary = [];
	if (created.length) summary.push(pc.green('Created:') + '\n  ' + created.join('\n  '));
	if (updated.length) summary.push(pc.yellow('Updated:') + '\n  ' + updated.join('\n  '));
	if (skipped.length)
		summary.push(pc.dim('Already configured:') + '\n  ' + skipped.join('\n  '));

	p.note(summary.join('\n\n') || 'No changes needed.', 'Summary');

	p.outro(
		`${pc.green('✓')} Temporal is wired up. Reference ${pc.cyan('Temporal')} anywhere in your app.`
	);
}

// ─── Detection ──────────────────────────────────────────────────────────────

function detectProject(cwd) {
	const pkgPath = join(cwd, 'package.json');
	if (!existsSync(pkgPath)) {
		return { ok: false, reason: 'No package.json found in current directory.' };
	}

	let pkgJson;
	try {
		pkgJson = JSON.parse(readFileSync(pkgPath, 'utf8'));
	} catch {
		return { ok: false, reason: 'Could not parse package.json.' };
	}

	const allDeps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
	const hasSvelte = !!allDeps.svelte;
	const hasKit = !!allDeps['@sveltejs/kit'];

	if (!hasSvelte) {
		return {
			ok: false,
			reason: 'This does not look like a Svelte project (svelte not in dependencies).'
		};
	}

	if (!hasKit) {
		return {
			ok: false,
			reason:
				'This script targets SvelteKit projects (@sveltejs/kit not found). For a plain Svelte app, the layout/hooks setup does not apply.'
		};
	}

	const isTypeScript =
		existsSync(join(cwd, 'tsconfig.json')) || existsSync(join(cwd, 'src', 'app.d.ts'));

	const pkgManager = detectPackageManager(cwd);

	return { ok: true, isTypeScript, pkgJson, pkgManager };
}

function detectPackageManager(cwd) {
	if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock'))) return 'bun';
	if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
	if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn';
	return 'npm';
}

function installCommand(pm, pkg) {
	switch (pm) {
		case 'pnpm':
			return `pnpm add ${pkg}`;
		case 'yarn':
			return `yarn add ${pkg}`;
		case 'bun':
			return `bun add ${pkg}`;
		default:
			return `npm install ${pkg}`;
	}
}

// ─── File writers (idempotent) ──────────────────────────────────────────────

function writeManaged(path, contents, log) {
	if (existsSync(path)) {
		const existing = readFileSync(path, 'utf8');
		if (existing.includes(MARKER)) {
			if (existing.trim() === contents.trim()) {
				log.skipped.push(rel(path));
				return;
			}
			writeFileSync(path, contents);
			log.updated.push(rel(path));
			return;
		}
		// File exists but isn't ours — back off
		log.skipped.push(`${rel(path)} ${pc.dim('(exists, not managed — left alone)')}`);
		return;
	}
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, contents);
	log.created.push(rel(path));
}

function ensureImportInFile(path, importLine, log) {
	if (!existsSync(path)) {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, `${importLine}\n`);
		log.created.push(rel(path));
		return;
	}
	const existing = readFileSync(path, 'utf8');
	if (existing.includes(importLine)) {
		log.skipped.push(rel(path));
		return;
	}
	// Prepend import, preserve everything else
	writeFileSync(path, `${importLine}\n${existing}`);
	log.updated.push(rel(path));
}

function updateAppDts(path, pkgName, log) {
	if (!existsSync(path)) {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, buildNewAppDts(pkgName));
		log.created.push(rel(path));
		return;
	}

	const existing = readFileSync(path, 'utf8');
	const result = processAppDts(existing, pkgName);

	if (result === false) {
		log.skipped.push(rel(path));
		return;
	}

	writeFileSync(path, result);
	log.updated.push(rel(path));
}

// ─── Utils ──────────────────────────────────────────────────────────────────

function rel(absPath) {
	return absPath.replace(process.cwd() + '/', '');
}
