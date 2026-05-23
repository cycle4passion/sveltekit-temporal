// src/addon.js
import { defineAddon, defineAddonOptions } from "sv";

// src/shared.js
var MARKER = "// sveltekit-temporal: managed block";
var END_MARKER = "// end sveltekit-temporal managed block";
function buildBootstrap(pkgName, isTypeScript) {
  const tsLine1 = isTypeScript ? `	// @ts-expect-error - polyfilling globalThis
` : "";
  const tsLine2 = isTypeScript ? `	// @ts-expect-error - patching Date.prototype
` : "";
  return `${MARKER}
// Conditionally load the Temporal polyfill when the runtime lacks native support.
// Native (Chrome 144+, Firefox 139+) keeps zero overhead \u2014 the dynamic import is
// code-split by Vite and only fetched on browsers that need it.

if (typeof globalThis.Temporal === 'undefined') {
	const { Temporal, toTemporalInstant } = await import('${pkgName}');
${tsLine1}	globalThis.Temporal = Temporal;
${tsLine2}	Date.prototype.toTemporalInstant = toTemporalInstant;
}

export {};
`;
}
function buildAppDtsBlock(pkgName) {
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
function buildNewAppDts(pkgName) {
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
function processAppDts(content, pkgName) {
  const block = buildAppDtsBlock(pkgName);
  if (content.includes(MARKER)) {
    const pattern = new RegExp(
      `${escapeRegex(MARKER)}[\\s\\S]*?${escapeRegex(END_MARKER)}\\n?`,
      "m"
    );
    const replaced = content.replace(pattern, `${block}
`);
    return replaced === content ? false : replaced;
  }
  const exportMatch = content.match(/\n\s*export\s*\{\s*\};?\s*$/);
  if (exportMatch) {
    return content.replace(exportMatch[0], `

${block}
${exportMatch[0]}`);
  }
  return `${content.trimEnd()}

${block}

export {};
`;
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/addon.js
var options = defineAddonOptions().add("polyfill", {
  question: "Which Temporal polyfill would you like to use?",
  type: "select",
  options: ["@js-temporal/polyfill", "temporal-polyfill"],
  default: "@js-temporal/polyfill"
}).build();
var addon_default = defineAddon({
  id: "temporal",
  shortDescription: "Temporal API polyfill with conditional loading for SvelteKit",
  options,
  setup({ isKit, unsupported }) {
    if (!isKit) unsupported("Requires SvelteKit.");
  },
  run({ sv, options: options2, language, directory }) {
    const pkgName = options2.polyfill;
    const isTs = language === "ts";
    const ext = language;
    sv.dependency(pkgName, "latest");
    sv.file(`${directory.lib}/temporal.${ext}`, (content) => {
      if (content && !content.includes(MARKER)) return false;
      return buildBootstrap(pkgName, isTs);
    });
    sv.file(
      `${directory.kitRoutes}/+layout.${ext}`,
      (content) => content.includes("import '$lib/temporal'") ? false : `import '$lib/temporal';
${content}`
    );
    sv.file(
      `${directory.src}/hooks.server.${ext}`,
      (content) => content.includes("import '$lib/temporal'") ? false : `import '$lib/temporal';
${content}`
    );
    if (isTs) {
      sv.file(
        `${directory.src}/app.d.ts`,
        (content) => content.trim() ? processAppDts(content, pkgName) : buildNewAppDts(pkgName)
      );
    }
  },
  nextSteps: () => ["Reference Temporal directly anywhere in your app \u2014 no imports needed."]
});
export {
  addon_default as default
};
