import { commands, page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { FormDefinition } from '$lib/index.js';
import LandingPage from '../+page.svelte';
import DesignerPage from './+page.svelte';

declare module 'vitest/browser' {
	interface BrowserCommands {
		captureDownload(accessibleName: string): Promise<{
			filename: string;
			bytes: number[];
			text: string;
		}>;
	}
}

describe('Bionic Sign demo landing and designer', () => {
	beforeEach(async () => {
		await page.viewport(1440, 1000);
	});

	afterEach(async () => {
		await page.viewport(1000, 800);
	});

	it('links the landing page to both browser-only workflows', async () => {
		render(LandingPage);

		await expect.element(page.getByRole('heading', { level: 1 })).toHaveTextContent('Bionic Sign');
		await expect
			.element(page.getByRole('link', { name: 'Design a form' }))
			.toHaveAttribute('href', '/designer');
		await expect
			.element(page.getByRole('link', { name: 'Fill and sign' }))
			.toHaveAttribute('href', '/filler');
		await expect.element(page.getByText(/stays in this browser/i)).toBeVisible();
	});

	it('loads PDF URLs and files, adds named fields, and downloads the live schema', async () => {
		render(DesignerPage);

		await expect
			.element(page.getByLabelText('PDF URL'))
			.toHaveValue('/demo/field-trip-permission.pdf');
		await expect.element(page.getByLabelText('PDF page 1')).toBeVisible();

		await page.getByLabelText('PDF URL').fill('/demo/field-trip-permission.pdf?source=url');
		await page.getByRole('button', { name: 'Load PDF URL' }).click();
		await expect
			.element(page.getByRole('status', { name: 'PDF source status' }))
			.toHaveTextContent('URL');

		const fixtureBytes = await fetch('/demo/field-trip-permission.pdf').then((response) =>
			response.arrayBuffer()
		);
		const localPdf = new File([fixtureBytes], 'local-permission.pdf', {
			type: 'application/pdf'
		});
		await page.getByLabelText('PDF file').upload(localPdf);
		await expect
			.element(page.getByRole('status', { name: 'PDF source status' }))
			.toHaveTextContent('local-permission.pdf');

		await page.getByRole('button', { name: 'Add text field' }).click();
		await page.getByRole('textbox', { name: 'Name' }).fill('student_name');
		await page.getByRole('button', { name: 'Add signature field' }).click();
		await page.getByRole('textbox', { name: 'Name' }).fill('parent_signature');

		const schemaPreview = page.getByRole('region', { name: 'Live schema' });
		await expect.element(schemaPreview).toBeVisible();
		const schemaOutput = page.getByRole('textbox', { name: 'Definition JSON' });
		await vi.waitFor(() => {
			const value = (schemaOutput.element() as HTMLTextAreaElement).value;
			expect(value).toContain('student_name');
			expect(value).toContain('parent_signature');
		});

		const download = await commands.captureDownload('Download schema');
		expect(download.filename).toBe('bionic-sign.schema.json');
		const savedDefinition = JSON.parse(download.text) as FormDefinition;
		expect(savedDefinition).toEqual({
			version: 1,
			fields: [
				expect.objectContaining({ name: 'student_name', page: 1, type: 'text' }),
				expect.objectContaining({ name: 'parent_signature', page: 1, type: 'signature' })
			]
		});
	});
});
