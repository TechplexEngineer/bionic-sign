import { page } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import LandingPage from './+page.svelte';

describe('Bionic Sign landing page', () => {
	afterEach(() => {
		document.body.removeAttribute('style');
	});

	it('keeps its background when linked routes are preloaded', async () => {
		render(LandingPage);
		await expect.element(page.getByRole('heading', { level: 1 })).toBeVisible();

		const landingBackground = getComputedStyle(document.body).backgroundImage;

		await import('./designer/+page.svelte');
		await import('./filler/+page.svelte');

		expect(getComputedStyle(document.body).backgroundImage).toBe(landingBackground);
	});
});
