import { defineAddon, defineAddonOptions } from 'sv';
import { MARKER, buildBootstrap, buildNewAppDts, processAppDts } from './shared.js';

const options = defineAddonOptions()
	.add('polyfill', {
		question: 'Which Temporal polyfill would you like to use?',
		type: 'select',
		options: [
			{ value: '@js-temporal/polyfill', label: '@js-temporal/polyfill', hint: 'Official TC39 polyfill, ~100KB gzipped, spec-conservative' },
			{ value: 'temporal-polyfill', label: 'temporal-polyfill', hint: 'Smaller (~40KB gzipped) by Adam Shaw, same API surface' }
		],
		default: '@js-temporal/polyfill'
	})
	.build();

export default defineAddon({
	id: 'temporal',
	shortDescription: 'Temporal API polyfill with conditional loading for SvelteKit',
	options,

	setup({ isKit, unsupported }) {
		if (!isKit) unsupported('Requires SvelteKit.');
	},

	run({ sv, options, language, directory }) {
		const pkgName = options.polyfill;
		const isTs = language === 'ts';
		const ext = language;

		sv.devDependency(pkgName, 'latest');

		sv.file(`${directory.lib}/temporal.${ext}`, (content) => {
			if (content && !content.includes(MARKER)) return false;
			return buildBootstrap(pkgName, isTs);
		});

		sv.file(`${directory.kitRoutes}/+layout.${ext}`, (content) =>
			content.includes("import '$lib/temporal'")
				? false
				: `import '$lib/temporal';\n${content}`
		);

		if (isTs) {
			sv.file(`${directory.src}/app.d.ts`, (content) =>
				content.trim() ? processAppDts(content, pkgName) : buildNewAppDts(pkgName)
			);
		}
	},

	nextSteps: () => ['Reference Temporal directly anywhere in your app — no imports needed.']
});
