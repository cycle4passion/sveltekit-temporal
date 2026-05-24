# sveltekit-temporal

Temporal may soon be supported in all major browsers, but your users may not update for some time.

This `sv` add-on wires the Temporal API polyfill into a SvelteKit project with conditional loading so browsers and server runtimes that ship Temporal natively (Chrome 144+, Firefox 139+, Node.js 26+) pay zero bytes but you can count on users with older browsers/runtimes getting the polyfill.

## Usage

```bash
# When creating a new project
npx sv create my-app --add sveltekit-temporal

# Into an existing project
npx sv add sveltekit-temporal
```

It will prompt you to choose a polyfill:

- **`@js-temporal/polyfill`** — official, ~100 KB gzipped, spec-conservative.
- **`temporal-polyfill`** — smaller (~40 KB gzipped), same API.

Then create / update the following files:

- `src/lib/temporal.{ts,js}` — the conditional bootstrap module.
- `src/hooks.{ts,js}` — prepends `import '$lib/temporal'`, covering both client and server (preserves existing content).
- `src/app.d.ts` — adds global `Temporal` type and `Date.toTemporalInstant()` augmentation (TypeScript only).

## Usage in your app

After running, reference `Temporal` directly anywhere (+page.svelte, +page.server.ts/js, +page.ts/js,+layout.svelte, Components etc.) — no imports needed:

```ts
<script lang="ts">
	const today = Temporal.Now.plainDateISO();
	const inAWeek = today.add({ days: 7 });
</script>

<p>One week from today: {inAWeek.toString()}</p>
```

## Idempotency

Re-running is safe. Files written by the add-on are tagged with a `// sveltekit-temporal: managed block` marker. On subsequent runs:

- Matching content → skipped.
- Marker present but content drifted (e.g. you switched polyfill) → managed block replaced; surrounding code left intact.
- File exists without our marker → left untouched, reported as skipped.

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

Re-run `sv add sveltekit-temporal` and pick the other option. Only `src/lib/temporal.*` and `src/app.d.ts` will change.
