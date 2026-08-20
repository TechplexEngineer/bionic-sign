import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { SignatureValue } from '../types.js';
import SignaturePad from './SignaturePad.svelte';

const signaturePadMock = vi.hoisted(() => {
	type PointData = Array<{ points: Array<{ x: number; y: number }> }>;

	class FakeSignaturePad extends EventTarget {
		static instances: FakeSignaturePad[] = [];

		readonly clear = vi.fn(() => {
			this.empty = true;
			this.data = [];
		});
		readonly fromData = vi.fn((data: PointData) => {
			this.data = data;
			this.empty = data.length === 0;
		});
		readonly fromDataURL = vi.fn(async () => {
			this.empty = false;
		});
		readonly isEmpty = vi.fn(() => this.empty);
		readonly off = vi.fn();
		readonly toData = vi.fn(() => this.data);
		readonly toDataURL = vi.fn(() => 'data:image/png;base64,c2lnbmF0dXJl');

		private data: PointData = [];
		private empty = true;

		constructor(readonly canvas: HTMLCanvasElement) {
			super();
			FakeSignaturePad.instances.push(this);
			canvas.addEventListener('pointerup', () => {
				this.data = [{ points: [{ x: 12, y: 24 }] }];
				this.empty = false;
				this.dispatchEvent(new CustomEvent('endStroke'));
			});
		}
	}

	return { FakeSignaturePad };
});

vi.mock('signature_pad', () => ({ default: signaturePadMock.FakeSignaturePad }));

let canvasWidth = 320;
let canvasHeight = 180;
let widthSpy: ReturnType<typeof vi.spyOn>;
let heightSpy: ReturnType<typeof vi.spyOn>;
let originalRatio: number;

beforeEach(() => {
	signaturePadMock.FakeSignaturePad.instances.length = 0;
	canvasWidth = 320;
	canvasHeight = 180;
	widthSpy = vi
		.spyOn(HTMLCanvasElement.prototype, 'offsetWidth', 'get')
		.mockImplementation(() => canvasWidth);
	heightSpy = vi
		.spyOn(HTMLCanvasElement.prototype, 'offsetHeight', 'get')
		.mockImplementation(() => canvasHeight);
	originalRatio = window.devicePixelRatio;
	Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
});

afterEach(() => {
	widthSpy.mockRestore();
	heightSpy.mockRestore();
	Object.defineProperty(window, 'devicePixelRatio', {
		configurable: true,
		value: originalRatio
	});
});

async function renderReady(props: Parameters<typeof render<typeof SignaturePad>>[1] = {}) {
	const result = render(SignaturePad, props);
	await vi.waitFor(() => expect(signaturePadMock.FakeSignaturePad.instances).toHaveLength(1));
	return result;
}

describe('SignaturePad', () => {
	it('initializes only after mount and separates CSS size from high-DPI backing pixels', async () => {
		expect(signaturePadMock.FakeSignaturePad.instances).toHaveLength(0);

		const result = await renderReady();
		const canvas = result.container.querySelector('canvas');

		expect(canvas?.width).toBe(640);
		expect(canvas?.height).toBe(360);
		await expect.element(page.getByRole('status')).toHaveTextContent('Signature is empty.');
		await expect.element(page.getByRole('button', { name: 'Clear signature' })).toBeVisible();
	});

	it('loads an existing signature value without emitting a user change', async () => {
		const value: SignatureValue = {
			type: 'signature',
			image: 'data:image/png;base64,ZXhpc3Rpbmc='
		};
		const onchange = vi.fn();
		const onemptychange = vi.fn();

		await renderReady({ value, onchange, onemptychange });
		const pad = signaturePadMock.FakeSignaturePad.instances[0];

		await vi.waitFor(() => expect(pad.fromDataURL).toHaveBeenCalledWith(value.image));
		await expect.element(page.getByRole('status')).toHaveTextContent('Signature is complete.');
		expect(onchange).not.toHaveBeenCalled();
		expect(onemptychange).not.toHaveBeenCalled();
	});

	it('returns PNG data and emits changes after a pointer stroke', async () => {
		const onchange = vi.fn();
		const onemptychange = vi.fn();
		const result = await renderReady({ onchange, onemptychange });

		await page.getByLabelText('Signature drawing area').click({ position: { x: 12, y: 24 } });

		const value: SignatureValue = {
			type: 'signature',
			image: 'data:image/png;base64,c2lnbmF0dXJl'
		};
		await vi.waitFor(() => expect(onchange).toHaveBeenCalledWith(value));
		expect(onemptychange).toHaveBeenCalledOnce();
		expect(onemptychange).toHaveBeenCalledWith(false);
		expect(result.component.toValue()).toEqual(value);
		await expect.element(page.getByRole('status')).toHaveTextContent('Signature is complete.');
	});

	it('clears through both the component handle and native control', async () => {
		const onchange = vi.fn();
		const onemptychange = vi.fn();
		const result = await renderReady({ onchange, onemptychange });
		const pad = signaturePadMock.FakeSignaturePad.instances[0];

		await page.getByLabelText('Signature drawing area').click({ position: { x: 12, y: 24 } });
		result.component.clear();

		expect(pad.clear).toHaveBeenCalledOnce();
		expect(result.component.toValue()).toBeUndefined();
		expect(onchange).toHaveBeenLastCalledWith(undefined);
		expect(onemptychange).toHaveBeenLastCalledWith(true);
		await expect.element(page.getByRole('status')).toHaveTextContent('Signature is empty.');

		await page.getByLabelText('Signature drawing area').click({ position: { x: 12, y: 24 } });
		await page.getByRole('button', { name: 'Clear signature' }).click();
		expect(pad.clear).toHaveBeenCalledTimes(2);
		expect(result.component.toValue()).toBeUndefined();
	});

	it('preserves and redraws point data when the canvas is resized', async () => {
		const onchange = vi.fn();
		const result = await renderReady({ onchange });
		const pad = signaturePadMock.FakeSignaturePad.instances[0];
		const canvas = result.container.querySelector('canvas');

		await page.getByLabelText('Signature drawing area').click({ position: { x: 12, y: 24 } });
		const points = pad.toData();
		onchange.mockClear();
		pad.toData.mockClear();
		canvasWidth = 480;
		canvasHeight = 220;
		window.dispatchEvent(new Event('resize'));

		expect(canvas?.width).toBe(960);
		expect(canvas?.height).toBe(440);
		expect(pad.toData).toHaveBeenCalledOnce();
		expect(pad.fromData).toHaveBeenCalledWith(points);
		expect(onchange).not.toHaveBeenCalled();
	});

	it('removes resize and signature-pad listeners when unmounted', async () => {
		const result = await renderReady();
		const pad = signaturePadMock.FakeSignaturePad.instances[0];

		pad.toData.mockClear();
		await result.unmount();
		window.dispatchEvent(new Event('resize'));

		expect(pad.toData).not.toHaveBeenCalled();
		expect(pad.off).toHaveBeenCalledOnce();
	});
});
