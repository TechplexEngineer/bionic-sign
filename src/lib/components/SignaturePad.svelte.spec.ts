import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { SignatureValue } from '../types.js';
import SignaturePad from './SignaturePad.svelte';

const signaturePadMock = vi.hoisted(() => {
	type PointData = Array<{ points: Array<{ x: number; y: number }> }>;
	type Deferred = { promise: Promise<void>; resolve: () => void };
	const completedLoads: string[] = [];
	const loadGates = new Map<string, Deferred>();

	class FakeSignaturePad extends EventTarget {
		static instances: FakeSignaturePad[] = [];

		readonly clear = vi.fn(() => {
			this.empty = true;
			this.data = [];
			delete this.canvas.dataset.image;
			const context = this.canvas.getContext('2d');
			context?.save();
			context?.setTransform(1, 0, 0, 1, 0, 0);
			context?.clearRect(0, 0, this.canvas.width, this.canvas.height);
			context?.restore();
		});
		readonly fromData = vi.fn((data: PointData) => {
			this.data = data;
			this.empty = data.length === 0;
			if (!this.empty) this.canvas.dataset.image = 'data:image/png;base64,c2lnbmF0dXJl';
		});
		readonly fromDataURL = vi.fn(async (image: string) => {
			this.empty = false;
			await loadGates.get(image)?.promise;
			const context = this.canvas.getContext('2d');
			context?.save();
			context?.setTransform(1, 0, 0, 1, 0, 0);
			if (context) {
				context.fillStyle = image.includes('Zmlyc3Q=') ? '#ff0000' : '#0000ff';
				context.fillRect(0, 0, this.canvas.width, this.canvas.height);
			}
			context?.restore();
			this.canvas.dataset.image = image;
			completedLoads.push(image);
		});
		readonly isEmpty = vi.fn(() => this.empty);
		readonly off = vi.fn();
		readonly toData = vi.fn(() => this.data);
		readonly toDataURL = vi.fn(
			() => this.canvas.dataset.image ?? 'data:image/png;base64,c2lnbmF0dXJl'
		);

		private data: PointData = [];
		private empty = true;

		constructor(readonly canvas: HTMLCanvasElement) {
			super();
			FakeSignaturePad.instances.push(this);
			canvas.addEventListener('pointerup', () => {
				this.data = [{ points: [{ x: 12, y: 24 }] }];
				this.empty = false;
				canvas.dataset.image = 'data:image/png;base64,c2lnbmF0dXJl';
				this.dispatchEvent(new CustomEvent('endStroke'));
			});
		}
	}

	return { completedLoads, FakeSignaturePad, loadGates };
});

vi.mock('signature_pad', () => ({ default: signaturePadMock.FakeSignaturePad }));

let canvasWidth = 320;
let canvasHeight = 180;
let widthSpy: ReturnType<typeof vi.spyOn>;
let heightSpy: ReturnType<typeof vi.spyOn>;
let originalRatio: number;
let originalResizeObserver: typeof ResizeObserver;
let resizeObservers: TestResizeObserver[];

class TestResizeObserver {
	readonly disconnect = vi.fn();
	readonly observe = vi.fn();

	constructor(readonly callback: ResizeObserverCallback) {
		resizeObservers.push(this);
	}

	trigger(): void {
		this.callback([], this as unknown as ResizeObserver);
	}
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

beforeEach(() => {
	signaturePadMock.FakeSignaturePad.instances.length = 0;
	signaturePadMock.completedLoads.length = 0;
	signaturePadMock.loadGates.clear();
	resizeObservers = [];
	canvasWidth = 320;
	canvasHeight = 180;
	widthSpy = vi
		.spyOn(HTMLCanvasElement.prototype, 'offsetWidth', 'get')
		.mockImplementation(() => canvasWidth);
	heightSpy = vi
		.spyOn(HTMLCanvasElement.prototype, 'offsetHeight', 'get')
		.mockImplementation(() => canvasHeight);
	originalRatio = window.devicePixelRatio;
	originalResizeObserver = window.ResizeObserver;
	Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
	Object.defineProperty(window, 'ResizeObserver', {
		configurable: true,
		value: TestResizeObserver
	});
});

afterEach(() => {
	widthSpy.mockRestore();
	heightSpy.mockRestore();
	Object.defineProperty(window, 'devicePixelRatio', {
		configurable: true,
		value: originalRatio
	});
	Object.defineProperty(window, 'ResizeObserver', {
		configurable: true,
		value: originalResizeObserver
	});
});

async function renderReady(props: Parameters<typeof render<typeof SignaturePad>>[1] = {}) {
	const result = render(SignaturePad, props);
	await vi.waitFor(() =>
		expect(signaturePadMock.FakeSignaturePad.instances.length).toBeGreaterThanOrEqual(1)
	);
	return result;
}

async function waitForImageLoadStarted(image: string): Promise<void> {
	await vi.waitFor(() =>
		expect(
			signaturePadMock.FakeSignaturePad.instances.some((instance) =>
				instance.fromDataURL.mock.calls.some(([loadedImage]) => loadedImage === image)
			)
		).toBe(true)
	);
}

function imageLoader(image: string): InstanceType<typeof signaturePadMock.FakeSignaturePad> {
	const loader = signaturePadMock.FakeSignaturePad.instances.find((instance) =>
		instance.fromDataURL.mock.calls.some(([loadedImage]) => loadedImage === image)
	);
	if (!loader) throw new Error(`No signature-pad image loader found for ${image}`);
	return loader;
}

function firstPixel(canvas: HTMLCanvasElement): number[] {
	return Array.from(canvas.getContext('2d')?.getImageData(0, 0, 1, 1).data ?? []);
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
		await waitForImageLoadStarted(value.image);
		await expect.element(page.getByRole('status')).toHaveTextContent('Signature is complete.');
		expect(onchange).not.toHaveBeenCalled();
		expect(onemptychange).not.toHaveBeenCalled();
	});

	it('does not let an external image erase a stroke begun after clear', async () => {
		const value: SignatureValue = {
			type: 'signature',
			image: 'data:image/png;base64,c3RhbGU='
		};
		const gate = deferred();
		signaturePadMock.loadGates.set(value.image, gate);
		const result = await renderReady({ value });
		const canvas = result.container.querySelector('canvas');

		await waitForImageLoadStarted(value.image);
		result.component.clear();
		await page.getByLabelText('Signature drawing area').click({ position: { x: 12, y: 24 } });
		gate.resolve();
		await vi.waitFor(() => expect(signaturePadMock.completedLoads).toContain(value.image));
		await vi.waitFor(() => expect(imageLoader(value.image).off).toHaveBeenCalledOnce());

		expect(canvas?.dataset.image).toBe('data:image/png;base64,c2lnbmF0dXJl');
		expect(result.component.toValue()).toEqual({
			type: 'signature',
			image: 'data:image/png;base64,c2lnbmF0dXJl'
		});
		await expect.element(page.getByRole('status')).toHaveTextContent('Signature is complete.');
	});

	it('commits only the newest rapidly replaced external image', async () => {
		const first: SignatureValue = {
			type: 'signature',
			image: 'data:image/png;base64,Zmlyc3Q='
		};
		const second: SignatureValue = {
			type: 'signature',
			image: 'data:image/png;base64,c2Vjb25k'
		};
		const firstGate = deferred();
		const secondGate = deferred();
		signaturePadMock.loadGates.set(first.image, firstGate);
		signaturePadMock.loadGates.set(second.image, secondGate);
		const result = await renderReady({ value: first });

		await waitForImageLoadStarted(first.image);
		await result.rerender({ value: second });
		await waitForImageLoadStarted(second.image);

		secondGate.resolve();
		await vi.waitFor(() => expect(signaturePadMock.completedLoads).toContain(second.image));
		await vi.waitFor(() => expect(result.component.toValue()).toEqual(second));
		firstGate.resolve();
		await vi.waitFor(() => expect(signaturePadMock.completedLoads).toContain(first.image));
		await vi.waitFor(() => expect(imageLoader(first.image).off).toHaveBeenCalledOnce());

		expect(result.component.toValue()).toEqual(second);
	});

	it('keeps the committed image visible across a deferred A-to-B-to-A replacement', async () => {
		const first: SignatureValue = {
			type: 'signature',
			image: 'data:image/png;base64,Zmlyc3Q='
		};
		const second: SignatureValue = {
			type: 'signature',
			image: 'data:image/png;base64,c2Vjb25k'
		};
		const firstGate = deferred();
		const secondGate = deferred();
		signaturePadMock.loadGates.set(first.image, firstGate);
		signaturePadMock.loadGates.set(second.image, secondGate);
		const result = await renderReady({ value: first });
		const canvas = result.container.querySelector('canvas');
		if (!canvas) throw new Error('Expected a signature canvas');

		await waitForImageLoadStarted(first.image);
		firstGate.resolve();
		await vi.waitFor(() => expect(result.component.toValue()).toEqual(first));
		await vi.waitFor(() => expect(firstPixel(canvas)).toEqual([255, 0, 0, 255]));

		await result.rerender({ value: second });
		await waitForImageLoadStarted(second.image);
		await result.rerender({ value: first });
		secondGate.resolve();
		await vi.waitFor(() => expect(imageLoader(second.image).off).toHaveBeenCalledOnce());

		expect(result.component.toValue()).toEqual(first);
		expect(firstPixel(canvas)).toEqual([255, 0, 0, 255]);
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

	it('preserves and redraws point data after an observed container resize', async () => {
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
		expect(resizeObservers).toHaveLength(1);
		resizeObservers[0].trigger();

		expect(canvas?.width).toBe(960);
		expect(canvas?.height).toBe(440);
		expect(pad.toData).toHaveBeenCalledOnce();
		expect(pad.fromData).toHaveBeenCalledWith(points, { clear: false });
		expect(onchange).not.toHaveBeenCalled();

		await result.unmount();
		expect(resizeObservers[0].disconnect).toHaveBeenCalledOnce();
	});

	it('removes signature-pad listeners when unmounted', async () => {
		const result = await renderReady();
		const pad = signaturePadMock.FakeSignaturePad.instances[0];

		await result.unmount();

		expect(pad.off).toHaveBeenCalledOnce();
	});
});
