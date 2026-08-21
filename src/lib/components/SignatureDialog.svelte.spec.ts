import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SignatureDialog from './SignatureDialog.svelte';

const signaturePadMock = vi.hoisted(() => {
	class FakeSignaturePad extends EventTarget {
		private empty = true;
		readonly clear = vi.fn(() => {
			this.empty = true;
		});
		readonly fromData = vi.fn();
		readonly fromDataURL = vi.fn(async () => {
			this.empty = false;
		});
		readonly isEmpty = vi.fn(() => this.empty);
		readonly off = vi.fn();
		readonly toData = vi.fn(() => []);
		readonly toDataURL = vi.fn(() => 'data:image/png;base64,c2lnbmF0dXJl');

		constructor(canvas: HTMLCanvasElement) {
			super();
			canvas.addEventListener('pointerup', () => {
				this.empty = false;
				this.dispatchEvent(new CustomEvent('endStroke'));
			});
		}
	}

	return { FakeSignaturePad };
});

vi.mock('signature_pad', () => ({ default: signaturePadMock.FakeSignaturePad }));

describe('SignatureDialog', () => {
	it('opens with focus inside and guards Apply while the capture is empty', async () => {
		const onapply = vi.fn();
		const result = render(SignatureDialog, {
			open: true,
			fieldName: 'parent_signature',
			onapply
		});

		const dialog = result.container.querySelector('dialog')!;
		await expect.element(dialog).toBeVisible();
		await vi.waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
		await expect.element(page.getByRole('button', { name: 'Apply signature' })).toBeDisabled();
		await page.getByRole('button', { name: 'Apply signature' }).click({ force: true });
		expect(onapply).not.toHaveBeenCalled();
	});

	it('clears, cancels, and applies only the current draft', async () => {
		const onapply = vi.fn();
		const oncancel = vi.fn();
		render(SignatureDialog, {
			open: true,
			fieldName: 'parent_signature',
			onapply,
			oncancel
		});

		await expect.element(page.getByRole('dialog')).toBeVisible();
		await page.getByLabelText('Signature drawing area').click({ position: { x: 10, y: 10 } });
		await expect.element(page.getByRole('button', { name: 'Apply signature' })).toBeEnabled();
		await page.getByRole('button', { name: 'Clear signature draft' }).click();
		await expect.element(page.getByRole('button', { name: 'Apply signature' })).toBeDisabled();

		await page.getByLabelText('Signature drawing area').click({ position: { x: 12, y: 12 } });
		await page.getByRole('button', { name: 'Apply signature' }).click();
		expect(onapply).toHaveBeenCalledWith({
			type: 'signature',
			image: 'data:image/png;base64,c2lnbmF0dXJl'
		});

		await page.getByRole('button', { name: 'Cancel signature' }).click();
		expect(oncancel).toHaveBeenCalledOnce();
		expect(onapply).toHaveBeenCalledOnce();
	});
});
