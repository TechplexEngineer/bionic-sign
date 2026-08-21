import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter()
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }],
						commands: {
							captureDownload: async ({ page, frame }, accessibleName: string) => {
								const testFrame = await frame();
								const [download] = await Promise.all([
									page.waitForEvent('download'),
									testFrame.getByRole('button', { name: accessibleName, exact: true }).click()
								]);
								const path = await download.path();
								if (!path) throw new Error('The browser download did not produce a local file');
								const bytes = await readFile(path);

								return {
									filename: download.suggestedFilename(),
									bytes: Array.from(bytes),
									text: bytes.toString('utf8')
								};
							}
						}
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}', 'src/routes/**/*.spec.ts'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', 'src/routes/**/*.spec.ts']
				}
			}
		]
	}
});
