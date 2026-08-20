import { afterEach, describe, expect, it, vi } from 'vitest';

import { BionicSignError } from '../types.js';
import { loadPdfBytes } from './source.js';

describe('loadPdfBytes', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('copies Uint8Array sources instead of exposing caller memory', async () => {
		const source = new Uint8Array([1, 2, 3]);

		const loaded = await loadPdfBytes(source);
		loaded[0] = 9;

		expect(source[0]).toBe(1);
	});

	it('copies ArrayBuffer sources instead of exposing caller memory', async () => {
		const source = new Uint8Array([1, 2, 3]);

		const loaded = await loadPdfBytes(source.buffer);
		loaded[0] = 9;

		expect(source[0]).toBe(1);
	});

	it('bypasses fetch for byte sources', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);

		await loadPdfBytes(new Uint8Array([1, 2, 3]), {
			requestInit: { credentials: 'include' }
		});

		expect(fetch).not.toHaveBeenCalled();
	});

	it('forwards RequestInit and the operation signal for URL sources', async () => {
		const responseBytes = new Uint8Array([4, 5, 6]);
		const fetch = vi.fn().mockResolvedValue(
			new Response(responseBytes, {
				status: 200
			})
		);
		vi.stubGlobal('fetch', fetch);
		const controller = new AbortController();

		const loaded = await loadPdfBytes('https://example.test/form.pdf', {
			requestInit: {
				credentials: 'include',
				headers: { Authorization: 'Bearer token' }
			},
			signal: controller.signal
		});

		expect(loaded).toEqual(responseBytes);
		expect(fetch).toHaveBeenCalledWith('https://example.test/form.pdf', {
			credentials: 'include',
			headers: { Authorization: 'Bearer token' },
			signal: controller.signal
		});
	});

	it('maps non-OK URL responses to a stable typed error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(null, {
					status: 404,
					statusText: 'Not Found'
				})
			)
		);

		const error = await loadPdfBytes('https://example.test/missing.pdf').catch(
			(reason: unknown) => reason
		);

		expect(error).toBeInstanceOf(BionicSignError);
		expect(error).toMatchObject({
			code: 'pdf-load-http',
			message: 'Failed to load PDF: HTTP 404 Not Found'
		});
	});

	it('propagates abort failures without mapping them to network errors', async () => {
		const abortError = new DOMException('The operation was aborted.', 'AbortError');
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

		const error = await loadPdfBytes('https://example.test/form.pdf').catch(
			(reason: unknown) => reason
		);

		expect(error).toBe(abortError);
	});

	it('propagates the signal reason when an aborted fetch rejects generically', async () => {
		const controller = new AbortController();
		const abortReason = new DOMException('Source changed.', 'AbortError');
		controller.abort(abortReason);
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

		const error = await loadPdfBytes('https://example.test/form.pdf', {
			signal: controller.signal
		}).catch((reason: unknown) => reason);

		expect(error).toBe(abortReason);
	});

	it('maps network failures to a stable typed error with the original cause', async () => {
		const cause = new TypeError('fetch failed');
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(cause));

		const error = await loadPdfBytes('https://example.test/form.pdf').catch(
			(reason: unknown) => reason
		);

		expect(error).toBeInstanceOf(BionicSignError);
		expect(error).toMatchObject({
			code: 'pdf-load-network',
			message: 'Failed to load PDF from URL',
			cause
		});
	});
});
