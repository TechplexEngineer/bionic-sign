import { commands, page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { FormDefinition, FormValues } from '$lib/index.js';
import FillerPage from './+page.svelte';

declare module 'vitest/browser' {
	interface BrowserCommands {
		captureDownload(accessibleName: string): Promise<{
			filename: string;
			bytes: number[];
			text: string;
		}>;
	}
}

const savedDefinition: FormDefinition = {
	version: 1,
	fields: [
		{
			id: 'student-id',
			name: 'student_name',
			type: 'text',
			page: 1,
			rect: { x: 0.17, y: 0.24, width: 0.5, height: 0.07 },
			required: true
		},
		{
			id: 'parent-id',
			name: 'parent_name',
			type: 'text',
			page: 2,
			rect: { x: 0.16, y: 0.2, width: 0.48, height: 0.07 },
			required: true
		},
		{
			id: 'parent-signature-id',
			name: 'parent_signature',
			type: 'signature',
			page: 2,
			rect: { x: 0.16, y: 0.36, width: 0.5, height: 0.11 },
			required: true
		},
		{
			id: 'chaperone-signature-id',
			name: 'chaperone_signature',
			type: 'signature',
			page: 2,
			rect: { x: 0.16, y: 0.54, width: 0.5, height: 0.11 },
			required: true
		}
	]
};

describe('Bionic Sign filler demo', () => {
	it('reloads a saved schema, keeps prefills editable, validates, signs independently, and downloads', async () => {
		render(FillerPage);

		await expect
			.element(page.getByRole('textbox', { name: 'student_name' }))
			.toHaveValue('Jordan Lee');
		await page.getByLabelText('Schema file').upload(
			new File([JSON.stringify(savedDefinition)], 'saved-permission.schema.json', {
				type: 'application/json'
			})
		);
		await expect
			.element(page.getByRole('status', { name: 'Schema status' }))
			.toHaveTextContent('saved-permission.schema.json');

		const studentName = page.getByRole('textbox', { name: 'student_name' });
		await expect.element(studentName).toHaveValue('Jordan Lee');
		await studentName.fill('Avery Rivera');
		await expect.element(studentName).toHaveValue('Avery Rivera');

		await page.getByRole('button', { name: 'Submit signed PDF' }).click();
		await expect
			.element(page.getByRole('status', { name: 'Submission validation' }))
			.toHaveTextContent('3 required fields');
		await expect
			.element(page.getByRole('textbox', { name: 'parent_name' }))
			.toHaveAttribute('aria-invalid', 'true');

		await page.getByRole('textbox', { name: 'parent_name' }).fill('Morgan Rivera');
		await page.getByRole('button', { name: 'Sign parent_signature' }).click();
		await page.getByLabelText('Signature drawing area').click({ position: { x: 45, y: 35 } });
		await page.getByRole('button', { name: 'Apply signature' }).click();
		await page.getByRole('button', { name: 'Sign chaperone_signature' }).click();
		await page.getByLabelText('Signature drawing area').click({ position: { x: 160, y: 70 } });
		await page.getByRole('button', { name: 'Apply signature' }).click();

		const download = await commands.captureDownload('Submit signed PDF');
		expect(download.filename).toBe('field-trip-permission-signed.pdf');
		expect(download.bytes.slice(0, 5)).toEqual([37, 80, 68, 70, 45]);

		const output = page.getByRole('region', { name: 'Structured submission values' });
		await expect.element(output).toBeVisible();
		const outputText = page.getByRole('textbox', { name: 'Submission JSON' });
		await vi.waitFor(() => {
			const value = (outputText.element() as HTMLTextAreaElement).value;
			expect(value).toContain('Avery Rivera');
			expect(value).toContain('Morgan Rivera');
		});
		const values = JSON.parse((outputText.element() as HTMLTextAreaElement).value) as FormValues;
		expect(values.parent_signature.type).toBe('signature');
		expect(values.chaperone_signature.type).toBe('signature');
		expect(values.parent_signature).not.toEqual(values.chaperone_signature);
		await expect
			.element(page.getByRole('status', { name: 'Submission validation' }))
			.toHaveTextContent('ready to download');
	});

	it('offers local PDF and URL sources with explicit signature limitations', async () => {
		render(FillerPage);

		await expect.element(page.getByLabelText('PDF URL')).toBeVisible();
		await expect.element(page.getByLabelText('PDF file')).toBeVisible();
		await expect.element(page.getByText(/never leaves this browser/i)).toBeVisible();
		await expect.element(page.getByText(/not certificate-backed/i)).toBeVisible();
	});
});
