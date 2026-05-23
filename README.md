# sveltekit-temporal

One-shot CLI that wires the Temporal API polyfill into a SvelteKit project, with conditional loading so browsers that ship Temporal natively (Chrome 144+, Firefox 139+) and server runtimes that do too (Node.js 26+) pay zero bytes.

## Usage

## Using with the Svelte CLI (`sv add`)

If you prefer the official Svelte CLI, this package also works as an `sv` add-on:

```bash
# Or when creating a new project
npx sv create my-app
cd my-app
npx sv add sveltekit-temporal

# Into an existing project
npx sv add sveltekit-temporal

#Alternatively, you can run the CLI directly
npx sveltekit-temporal
```

Run it inside a SvelteKit project. It will:

1. Verify you're in a SvelteKit project (checks `svelte` + `@sveltejs/kit` in `package.json`).
2. Detect TypeScript (presence of `tsconfig.json` or `src/app.d.ts`).
3. Detect your package manager from lockfiles (`bun.lock`, `pnpm-lock.yaml`, `yarn.lock`, else npm).
4. Prompt you to choose a polyfill:
   - **`@js-temporal/polyfill`** — official, ~100 KB gzipped, spec-conservative.
   - **`temporal-polyfill`** — smaller (~40 KB gzipped), same API.
5. Install the chosen package.
6. Create / update the following files:
   - `src/lib/temporal.{ts,js}` — the conditional bootstrap module.
   - `src/routes/+layout.{ts,js}` — prepends `import '$lib/temporal'` (preserves existing content).
   - `src/hooks.server.{ts,js}` — same import for server-side.
   - `src/app.d.ts` — adds global `Temporal` type and `Date.toTemporalInstant()` augmentation (TypeScript only).

## Idempotency

Re-running is safe. Files written by the script are tagged with a `// sveltekit-temporal: managed block` marker. On subsequent runs:

- Matching content → skipped.
- Marker present but content drifted (e.g. you switched polyfill) → managed block replaced; surrounding code left intact.
- File exists without our marker → left untouched, reported as skipped.

## Usage in your app

After running, reference `Temporal` directly anywhere — no imports needed:

```svelte
<script lang="ts">
	const today = Temporal.Now.plainDateISO();
	const inAWeek = today.add({ days: 7 });
</script>

<p>One week from today: {inAWeek.toString()}</p>
```

## Server hooks (only if needed)

If you use Temporal inside `hooks.server.ts` or `+server.ts` endpoints that might run before any layout, add the import there as well:

`src/hooks.server.ts`:
```ts
import '$lib/temporal';

export async function handle({ event, resolve }) {
	return resolve(event);
}
```

## Runtime support

| Runtime      | Native Temporal                        | Notes                                                                   |
| ------------ | -------------------------------------- | ----------------------------------------------------------------------- |
| Node.js ≤ 25 | No                                     | Polyfill required                                                       |
| Node.js 26+  | Yes (behind `--experimental-temporal`) | Polyfill still safe to include — the conditional check skips loading it |
| Bun          | No                                     | Polyfill required; Bun tracks V8 but has not shipped Temporal yet       |
| Deno         | No                                     | Polyfill required; Deno tracks V8 but has not shipped Temporal yet      |
| Chrome 144+  | Yes                                    | Polyfill skipped automatically                                          |
| Firefox 139+ | Yes                                    | Polyfill skipped automatically                                          |
| Safari       | No                                     | Polyfill required                                                       |

The conditional bootstrap in `src/lib/temporal.ts` checks `typeof Temporal !== 'undefined'` before loading the polyfill, so upgrading your runtime later requires no code changes.

## Switching polyfills later

Re-run either the CLI or `sv add` and pick the other option. Only the two files that name the package (`src/lib/temporal.*` and `src/app.d.ts`) will change.
