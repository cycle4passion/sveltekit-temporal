export const MARKER = '// sveltekit-temporal: managed block';
const END_MARKER = '// end sveltekit-temporal managed block';

export function buildBootstrap(pkgName, isTypeScript) {
	const tsLine1 = isTypeScript ? `\t// @ts-expect-error - polyfilling globalThis\n` : '';
	const tsLine2 = isTypeScript ? `\t// @ts-expect-error - patching Date.prototype\n` : '';

	return `${MARKER}
// Conditionally load the Temporal polyfill when the runtime lacks native support.
// Native (Chrome 144+, Firefox 139+) keeps zero overhead — the dynamic import is
// code-split by Vite and only fetched on browsers that need it.

if (typeof globalThis.Temporal === 'undefined') {
	const { Temporal, toTemporalInstant } = await import('${pkgName}');
${tsLine1}\tglobalThis.Temporal = Temporal;
${tsLine2}\tDate.prototype.toTemporalInstant = toTemporalInstant;
}

export {};
`;
}

export function buildAppDtsBlock(pkgName) {
	return `${MARKER}
import type { Temporal as TemporalNS } from '${pkgName}';

declare global {
	const Temporal: typeof TemporalNS;

	interface Date {
		toTemporalInstant(): TemporalNS.Instant;
	}
}
${END_MARKER}`;
}

export function buildNewAppDts(pkgName) {
	return `// See https://svelte.dev/docs/kit/types#app.d.ts for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

${buildAppDtsBlock(pkgName)}

export {};
`;
}

export function processAppDts(content, pkgName) {
	const block = buildAppDtsBlock(pkgName);

	if (content.includes(MARKER)) {
		const pattern = new RegExp(
			`${escapeRegex(MARKER)}[\\s\\S]*?${escapeRegex(END_MARKER)}\\n?`,
			'm'
		);
		const replaced = content.replace(pattern, `${block}\n`);
		return replaced === content ? false : replaced;
	}

	const exportMatch = content.match(/\n\s*export\s*\{\s*\};?\s*$/);
	if (exportMatch) {
		return content.replace(exportMatch[0], `\n\n${block}\n${exportMatch[0]}`);
	}
	return `${content.trimEnd()}\n\n${block}\n\nexport {};\n`;
}

export function escapeRegex(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
