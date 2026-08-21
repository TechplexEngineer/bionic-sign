import { afterEach, describe, expect, it, vi } from 'vitest';

import { BionicSignError } from '../types.js';

const browserGlobalNames = ['window', 'DOMMatrix', 'Worker'] as const;

describe('PDF.js browser runtime', () => {
	const originalDescriptors = new Map<PropertyKey, PropertyDescriptor | undefined>();

	afterEach(() => {
		for (const [name, descriptor] of originalDescriptors) {
			if (descriptor) {
				Object.defineProperty(globalThis, name, descriptor);
			} else {
				Reflect.deleteProperty(globalThis, name);
			}
		}
		originalDescriptors.clear();
	});

	it('imports during SSR without touching browser or worker globals', async () => {
		const globalReads = vi.fn();
		for (const name of browserGlobalNames) {
			originalDescriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
			Object.defineProperty(globalThis, name, {
				configurable: true,
				get() {
					globalReads(name);
					return undefined;
				}
			});
		}

		const runtime = await import('./runtime.js');

		expect(runtime.getPdfJs).toBeTypeOf('function');
		expect(globalReads).not.toHaveBeenCalled();
	});

	it('rejects initialization outside the browser with a typed error', async () => {
		const { getPdfJs } = await import('./runtime.js');

		const error = await getPdfJs().catch((reason: unknown) => reason);

		expect(error).toBeInstanceOf(BionicSignError);
		expect(error).toMatchObject({
			code: 'pdfjs-browser-only',
			message: 'PDF.js can only be initialized in a browser'
		});
	});

	it('caches browser initialization and configures the bundled worker URL', async () => {
		for (const name of browserGlobalNames) {
			originalDescriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
			Object.defineProperty(globalThis, name, {
				configurable: true,
				value: name === 'window' ? {} : class {}
			});
		}
		const { getPdfJs } = await import('./runtime.js');

		const firstInitialization = getPdfJs();
		const secondInitialization = getPdfJs();
		const [pdfJs] = await Promise.all([firstInitialization, secondInitialization]);

		expect(secondInitialization).toBe(firstInitialization);
		expect(pdfJs.GlobalWorkerOptions.workerSrc).toMatch(/pdf\.worker\.min\.mjs/);
	});

	it('retries browser initialization after the cached attempt rejects', async () => {
		for (const name of browserGlobalNames) {
			originalDescriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
			Object.defineProperty(globalThis, name, {
				configurable: true,
				value: name === 'window' ? {} : class {}
			});
		}

		const initializationFailure = new Error('PDF.js import failed');
		const pdfJs = { GlobalWorkerOptions: { workerSrc: '' } };
		let importAttempts = 0;
		vi.resetModules();
		vi.doMock('pdfjs-dist', () => {
			importAttempts += 1;
			if (importAttempts === 1) throw initializationFailure;
			return pdfJs;
		});

		try {
			const { getPdfJs } = await import('./runtime.js');

			const firstError = await getPdfJs().catch((reason: unknown) => reason);
			const retriedPdfJs = await getPdfJs();

			expect(firstError).toMatchObject({ code: 'pdfjs-initialization' });
			expect(importAttempts).toBe(2);
			expect(retriedPdfJs.GlobalWorkerOptions.workerSrc).toMatch(/pdf\.worker\.min\.mjs/);
		} finally {
			vi.doUnmock('pdfjs-dist');
			vi.resetModules();
		}
	});
});
