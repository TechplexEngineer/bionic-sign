import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SignatureDialog from './SignatureDialog.svelte';

const signaturePadMock = vi.hoisted(() => {
	const completedLoads: string[] = [];
	const startedLoads: string[] = [];
	const loadGates = new Map<string, Promise<void>>();

	class FakeSignaturePad extends EventTarget {
		private empty = true;
		private image = 'data:image/png;base64,c2lnbmF0dXJl';
		readonly clear = vi.fn(() => {
			this.empty = true;
		});
		readonly fromData = vi.fn();
		readonly fromDataURL = vi.fn(async (image: string) => {
			startedLoads.push(image);
			await loadGates.get(image);
			this.empty = false;
			this.image = image;
			completedLoads.push(image);
		});
		readonly isEmpty = vi.fn(() => this.empty);
		readonly off = vi.fn();
		readonly toData = vi.fn(() => []);
		readonly toDataURL = vi.fn(() => this.image);

		constructor(canvas: HTMLCanvasElement) {
			super();
			canvas.addEventListener('pointerup', () => {
				this.empty = false;
				this.dispatchEvent(new CustomEvent('endStroke'));
			});
		}
	}

	return { completedLoads, FakeSignaturePad, loadGates, startedLoads };
});

vi.mock('signature_pad', () => ({ default: signaturePadMock.FakeSignaturePad }));

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

beforeEach(() => {
	signaturePadMock.completedLoads.length = 0;
	signaturePadMock.startedLoads.length = 0;
	signaturePadMock.loadGates.clear();
});

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

	it('never applies the previous field while the newly opened PNG is still loading', async () => {
		const first = { type: 'signature', image: 'data:image/png;base64,Zmlyc3Q=' } as const;
		const second = { type: 'signature', image: 'data:image/png;base64,c2Vjb25k' } as const;
		const secondLoad = deferred();
		const onapply = vi.fn();
		const oncancel = vi.fn();
		const result = render(SignatureDialog, {
			open: true,
			fieldName: 'first_signature',
			value: first,
			onapply,
			oncancel
		});

		await vi.waitFor(() => expect(signaturePadMock.completedLoads).toContain(first.image));
		await page.getByRole('button', { name: 'Apply signature' }).click();
		expect(onapply).toHaveBeenLastCalledWith(first);

		await result.rerender({
			open: false,
			fieldName: 'first_signature',
			value: first,
			onapply,
			oncancel
		});
		signaturePadMock.loadGates.set(second.image, secondLoad.promise);
		await result.rerender({
			open: true,
			fieldName: 'second_signature',
			value: second,
			onapply,
			oncancel
		});
		await vi.waitFor(() => expect(signaturePadMock.startedLoads).toContain(second.image));
		await expect.element(page.getByRole('button', { name: 'Apply signature' })).toBeEnabled();
		await page.getByRole('button', { name: 'Apply signature' }).click();

		expect(onapply).toHaveBeenLastCalledWith(second);
		expect(onapply).not.toHaveBeenLastCalledWith(first);
		await result.rerender({
			open: false,
			fieldName: 'second_signature',
			value: second,
			onapply,
			oncancel
		});
		secondLoad.resolve();
		await vi.waitFor(() => expect(signaturePadMock.completedLoads).toContain(second.image));
		expect(onapply).toHaveBeenCalledTimes(2);
		expect(onapply).toHaveBeenLastCalledWith(second);
	});
});
