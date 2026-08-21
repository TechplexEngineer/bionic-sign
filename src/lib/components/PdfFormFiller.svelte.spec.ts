import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { FormDefinition, FormSubmission } from '../types.js';
import PdfFormFiller from './PdfFormFiller.svelte';

import '../styles.css';

const pdfMocks = vi.hoisted(() => ({
	exportFlattenedPdf: vi.fn(),
	getPdfJs: vi.fn(),
	loadPdfBytes: vi.fn()
}));

const signaturePadMock = vi.hoisted(() => {
	let capture = 0;
	class FakeSignaturePad extends EventTarget {
		private empty = true;
		private image = '';
		readonly clear = vi.fn(() => {
			this.empty = true;
			this.image = '';
		});
		readonly fromData = vi.fn();
		readonly fromDataURL = vi.fn(async (image: string) => {
			this.empty = false;
			this.image = image;
		});
		readonly isEmpty = vi.fn(() => this.empty);
		readonly off = vi.fn();
		readonly toData = vi.fn(() => []);
		readonly toDataURL = vi.fn(() => this.image);

		constructor(canvas: HTMLCanvasElement) {
			super();
			canvas.addEventListener('pointerup', () => {
				capture += 1;
				this.empty = false;
				this.image = `data:image/png;base64,c2lnbmF0dXJl-${capture}`;
				this.dispatchEvent(new CustomEvent('endStroke'));
			});
		}
	}

	return {
		FakeSignaturePad,
		reset: () => {
			capture = 0;
		}
	};
});

vi.mock('../pdf/export.js', () => ({ exportFlattenedPdf: pdfMocks.exportFlattenedPdf }));
vi.mock('../pdf/runtime.js', () => ({ getPdfJs: pdfMocks.getPdfJs }));
vi.mock('../pdf/source.js', () => ({ loadPdfBytes: pdfMocks.loadPdfBytes }));
vi.mock('signature_pad', () => ({ default: signaturePadMock.FakeSignaturePad }));

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function definition(): FormDefinition {
	return {
		version: 1,
		fields: [
			{
				id: 'student-id',
				name: 'student_name',
				type: 'text',
				page: 1,
				rect: { x: 0.1, y: 0.1, width: 0.35, height: 0.08 },
				required: true
			},
			{
				id: 'parent-signature-id',
				name: 'parent_signature',
				type: 'signature',
				page: 2,
				rect: { x: 0.1, y: 0.3, width: 0.35, height: 0.12 },
				required: true
			},
			{
				id: 'witness-signature-id',
				name: 'witness_signature',
				type: 'signature',
				page: 2,
				rect: { x: 0.1, y: 0.5, width: 0.35, height: 0.12 },
				required: false
			}
		]
	};
}

function usePdf(): { document: PDFDocumentProxy; getDocument: ReturnType<typeof vi.fn> } {
	const pages = [1, 2].map((number) => {
		const page = {
			getViewport: vi.fn(() => ({ width: 600, height: 800 })),
			render: vi.fn(
				() => ({ promise: Promise.resolve(), cancel: vi.fn() }) as unknown as RenderTask
			)
		};
		return { number, page: page as unknown as PDFPageProxy };
	});
	const document = {
		getPage: vi.fn((pageNumber: number) => Promise.resolve(pages[pageNumber - 1].page)),
		numPages: pages.length
	} as unknown as PDFDocumentProxy;
	const getDocument = vi.fn(() => ({ destroy: vi.fn(), promise: Promise.resolve(document) }));
	pdfMocks.getPdfJs.mockResolvedValue({ getDocument });
	return { document, getDocument };
}

function emptyDefinition(): FormDefinition {
	return { version: 1, fields: [] };
}

function invalidDefinition(kind: 'duplicate-id' | 'duplicate-name' | 'malformed-rect'): FormDefinition {
	const invalid = definition();
	if (kind === 'duplicate-id') invalid.fields[1].id = invalid.fields[0].id;
	if (kind === 'duplicate-name') invalid.fields[1].name = invalid.fields[0].name;
	if (kind === 'malformed-rect') {
		invalid.fields[0].rect = { x: 0.9, y: 0.2, width: 0.3, height: 0.1 };
	}
	return invalid;
}

beforeEach(() => {
	signaturePadMock.reset();
	pdfMocks.exportFlattenedPdf.mockReset();
	pdfMocks.getPdfJs.mockReset();
	pdfMocks.loadPdfBytes.mockReset();
	pdfMocks.loadPdfBytes.mockResolvedValue(new Uint8Array([1, 2, 3]));
	pdfMocks.exportFlattenedPdf.mockResolvedValue(new Uint8Array([4, 5, 6]));
	usePdf();
});

afterEach(() => {
	document.body.classList.remove('bionic-sign');
	document.body.style.removeProperty('--bionic-sign-required');
});

describe('PdfFormFiller', () => {
	it('exports the same immutable URL-byte snapshot that PDF.js displayed', async () => {
		const displayed = new Uint8Array([10, 20, 30]);
		const changedResponse = new Uint8Array([90, 91, 92]);
		let urlLoads = 0;
		pdfMocks.loadPdfBytes.mockImplementation(async (input: string | Uint8Array | ArrayBuffer) => {
			if (typeof input === 'string') {
				urlLoads += 1;
				return (urlLoads === 1 ? displayed : changedResponse).slice();
			}
			return input instanceof Uint8Array
				? input.slice()
				: new Uint8Array(input).slice();
		});
		const { getDocument } = usePdf();
		const result = render(PdfFormFiller, {
			source: 'https://example.test/changing.pdf',
			definition: emptyDefinition()
		});

		await expect.element(page.getByLabelText('PDF page 1')).toBeVisible();
		await result.component.exportPdf();

		expect(urlLoads).toBe(1);
		expect(getDocument.mock.calls[0][0].data).toEqual(displayed);
		expect(pdfMocks.exportFlattenedPdf.mock.calls[0][0]).toEqual(displayed);
		expect(pdfMocks.exportFlattenedPdf.mock.calls[0][0]).not.toBe(displayed);
	});

	it('gates UI and imperative export until the generation-matched source is ready', async () => {
		const sourceLoad = deferred<Uint8Array>();
		let urlLoads = 0;
		pdfMocks.loadPdfBytes.mockImplementation((input: string | Uint8Array | ArrayBuffer) => {
			if (typeof input === 'string') {
				urlLoads += 1;
				return urlLoads === 1 ? sourceLoad.promise : Promise.resolve(new Uint8Array([9]));
			}
			return Promise.resolve(
				input instanceof Uint8Array ? input.slice() : new Uint8Array(input).slice()
			);
		});
		const result = render(PdfFormFiller, {
			source: 'https://example.test/pending.pdf',
			definition: emptyDefinition()
		});

		await expect.element(page.getByRole('button', { name: 'Submit signed PDF' })).toBeDisabled();
		await expect(result.component.exportPdf()).rejects.toMatchObject({ code: 'pdf-not-ready' });
		expect(pdfMocks.exportFlattenedPdf).not.toHaveBeenCalled();

		sourceLoad.resolve(new Uint8Array([1, 2, 3]));
		await expect.element(page.getByLabelText('PDF page 1')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Submit signed PDF' })).toBeEnabled();
	});

	it.each(['duplicate-id', 'duplicate-name', 'malformed-rect'] as const)(
		'reports and recovers from a %s definition at the prop boundary',
		async (kind) => {
			usePdf();
			const onerror = vi.fn();
			const source = new Uint8Array([1]);
			const result = render(PdfFormFiller, {
				source,
				definition: invalidDefinition(kind),
				onerror
			});

			await expect.element(page.getByRole('alert')).toBeVisible();
			expect(onerror).toHaveBeenCalledWith(
				expect.objectContaining({ code: 'invalid-form-definition' })
			);
			await expect.element(page.getByRole('button', { name: 'Submit signed PDF' })).toBeDisabled();

			await result.rerender({ source, definition: definition(), onerror });
			await expect.element(page.getByRole('textbox', { name: 'student_name' })).toBeVisible();
			await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
		}
	);

	it('rejects and recovers from fields beyond the loaded document page count', async () => {
		usePdf();
		const onerror = vi.fn();
		const source = new Uint8Array([1]);
		const result = render(PdfFormFiller, {
			source,
			definition: definition(),
			onerror
		});

		const onePagePdf = (() => {
			const pageProxy = {
				getViewport: vi.fn(() => ({ width: 600, height: 800 })),
				render: vi.fn(
					() => ({ promise: Promise.resolve(), cancel: vi.fn() }) as unknown as RenderTask
				)
			} as unknown as PDFPageProxy;
			return {
				getPage: vi.fn(() => Promise.resolve(pageProxy)),
				numPages: 1
			} as unknown as PDFDocumentProxy;
		})();
		pdfMocks.getPdfJs.mockResolvedValue({
			getDocument: vi.fn(() => ({ destroy: vi.fn(), promise: Promise.resolve(onePagePdf) }))
		});
		await result.rerender({ source: new Uint8Array([2]), definition: definition(), onerror });

		await vi.waitFor(() =>
			expect(onerror).toHaveBeenCalledWith(
				expect.objectContaining({ code: 'definition-page-out-of-range' })
			)
		);
		await expect.element(page.getByRole('button', { name: 'Submit signed PDF' })).toBeDisabled();
	});

	it('applies the required theme token to the visible required indicator', async () => {
		document.body.classList.add('bionic-sign');
		document.body.style.setProperty('--bionic-sign-required', 'rgb(145 23 90)');
		render(PdfFormFiller, {
			source: new Uint8Array([1]),
			definition: definition()
		});

		const fieldButton = page.getByRole('button', { name: 'Go to student_name' });
		await expect.element(fieldButton).toBeVisible();
		const indicator = fieldButton.element().querySelector('[data-bionic-sign-state="required"]');

		expect(indicator).not.toBeNull();
		expect(getComputedStyle(indicator!).color).toBe('rgb(145, 23, 90)');
	});

	it('applies editable text prefills, reports diagnostics, and navigates fields with progress', async () => {
		const ondiagnostic = vi.fn();
		render(PdfFormFiller, {
			source: new Uint8Array([1]),
			definition: definition(),
			prefill: {
				student_name: 'Jordan Lee',
				parent_signature: 'ignored',
				unknown: 'ignored'
			},
			ondiagnostic
		});

		await expect
			.element(page.getByRole('textbox', { name: 'student_name' }))
			.toHaveValue('Jordan Lee');
		await expect
			.element(page.getByRole('status', { name: 'Required field progress' }))
			.toHaveTextContent('1 of 2');
		await page.getByRole('textbox', { name: 'student_name' }).fill('Alex Morgan');
		await expect
			.element(page.getByRole('textbox', { name: 'student_name' }))
			.toHaveValue('Alex Morgan');
		await page.getByRole('button', { name: 'Go to parent_signature' }).click();
		await expect
			.element(page.getByLabelText('PDF page 2').element().parentElement!)
			.toHaveAttribute('aria-current', 'page');
		expect(ondiagnostic.mock.calls.map(([value]) => value.code)).toEqual([
			'invalid-prefill-type',
			'unknown-prefill-field'
		]);
	});

	it('captures each signature independently and keeps optional signatures optional', async () => {
		const result = render(PdfFormFiller, {
			source: new Uint8Array([1]),
			definition: definition(),
			prefill: { student_name: 'Jordan Lee' }
		});

		await expect.element(page.getByRole('button', { name: 'Sign parent_signature' })).toBeVisible();
		await page.getByRole('button', { name: 'Sign parent_signature' }).click();
		await page.getByLabelText('Signature drawing area').click({ position: { x: 10, y: 10 } });
		await page.getByRole('button', { name: 'Apply signature' }).click();
		await page.getByRole('button', { name: 'Sign witness_signature' }).click();
		await page.getByLabelText('Signature drawing area').click({ position: { x: 12, y: 12 } });
		await page.getByRole('button', { name: 'Apply signature' }).click();

		expect(result.component.validate()).toEqual({ valid: true, issues: [] });
		await result.component.exportPdf();
		const values = pdfMocks.exportFlattenedPdf.mock.calls.at(-1)?.[2];
		expect(values.parent_signature.image).not.toBe(values.witness_signature.image);
		await expect
			.element(page.getByRole('status', { name: 'Required field progress' }))
			.toHaveTextContent('2 of 2');
	});

	it('focuses the first invalid field for UI validation', async () => {
		const onvalidation = vi.fn();
		render(PdfFormFiller, {
			source: new Uint8Array([1]),
			definition: definition(),
			onvalidation
		});

		await expect.element(page.getByRole('button', { name: 'Submit signed PDF' })).toBeVisible();
		await page.getByRole('button', { name: 'Submit signed PDF' }).click();

		expect(onvalidation).toHaveBeenCalledWith({
			valid: false,
			issues: [
				expect.objectContaining({ fieldName: 'student_name' }),
				expect.objectContaining({ fieldName: 'parent_signature' })
			]
		});
		await vi.waitFor(() =>
			expect(document.activeElement).toBe(
				page.getByRole('textbox', { name: 'student_name' }).element()
			)
		);
		expect(pdfMocks.exportFlattenedPdf).not.toHaveBeenCalled();
	});

	it('replays first-invalid focus after validation is requested while the viewer loads', async () => {
		const viewerLoad = deferred<Uint8Array>();
		pdfMocks.loadPdfBytes.mockReturnValueOnce(viewerLoad.promise);
		render(PdfFormFiller, {
			source: new Uint8Array([1]),
			definition: definition()
		});

		await expect.element(page.getByText('Loading PDF…')).toBeVisible();
		await page.getByRole('button', { name: 'Submit signed PDF' }).click();
		const fallback = page.getByRole('button', { name: 'Go to student_name' }).element();
		expect(document.activeElement).toBe(fallback);
		await expect.element(fallback).toHaveAttribute('aria-current', 'true');

		viewerLoad.resolve(new Uint8Array([1, 2, 3]));
		await expect.element(page.getByRole('textbox', { name: 'student_name' })).toBeVisible();
		await vi.waitFor(() =>
			expect(document.activeElement).toBe(
				page.getByRole('textbox', { name: 'student_name' }).element()
			)
		);
	});

	it('replays rail navigation focus after the selected field overlay mounts', async () => {
		const viewerLoad = deferred<Uint8Array>();
		pdfMocks.loadPdfBytes.mockReturnValueOnce(viewerLoad.promise);
		render(PdfFormFiller, {
			source: new Uint8Array([1]),
			definition: definition()
		});

		await expect.element(page.getByText('Loading PDF…')).toBeVisible();
		const railButton = page.getByRole('button', { name: 'Go to parent_signature' });
		await railButton.click();
		expect(document.activeElement).toBe(railButton.element());
		await expect.element(railButton).toHaveAttribute('aria-current', 'true');

		viewerLoad.resolve(new Uint8Array([1, 2, 3]));
		await expect.element(page.getByRole('button', { name: 'Sign parent_signature' })).toBeVisible();
		await expect
			.element(page.getByLabelText('PDF page 2').element().parentElement!)
			.toHaveAttribute('aria-current', 'page');
		await vi.waitFor(() =>
			expect(document.activeElement).toBe(
				page.getByRole('button', { name: 'Sign parent_signature' }).element()
			)
		);
	});

	it('preserves values after export errors and exposes a busy state', async () => {
		const pending = deferred<Uint8Array>();
		pdfMocks.exportFlattenedPdf.mockReturnValueOnce(pending.promise);
		const onerror = vi.fn();
		const result = render(PdfFormFiller, {
			source: new Uint8Array([1]),
			definition: definition(),
			prefill: { student_name: 'Jordan Lee' },
			onerror
		});

		await page.getByRole('button', { name: 'Sign parent_signature' }).click();
		await page.getByLabelText('Signature drawing area').click({ position: { x: 10, y: 10 } });
		await page.getByRole('button', { name: 'Apply signature' }).click();
		const exported = result.component.exportPdf();
		await expect.element(page.getByRole('button', { name: 'Submit signed PDF' })).toBeDisabled();
		await expect
			.element(page.getByRole('status', { name: 'PDF operation status' }))
			.toHaveTextContent('Preparing');

		pending.reject(new Error('export failed'));
		await expect(exported).rejects.toThrow('export failed');
		expect(onerror).toHaveBeenCalledWith(expect.objectContaining({ message: 'export failed' }));
		await expect
			.element(page.getByRole('textbox', { name: 'student_name' }))
			.toHaveValue('Jordan Lee');
		await expect.element(page.getByRole('button', { name: 'Submit signed PDF' })).toBeEnabled();
	});

	it('uses one submission path, snapshots inputs, and emits copied successful payloads', async () => {
		const exportPending = deferred<Uint8Array>();
		pdfMocks.exportFlattenedPdf.mockReturnValueOnce(exportPending.promise);
		const form = definition();
		const onsubmit = vi.fn((submission: FormSubmission) => {
			submission.pdf[0] = 99;
			submission.values.student_name = { type: 'text', value: 'host mutation' };
		});
		const result = render(PdfFormFiller, {
			source: new Uint8Array([1]),
			definition: form,
			prefill: { student_name: 'Jordan Lee' },
			onsubmit
		});
		await page.getByRole('button', { name: 'Sign parent_signature' }).click();
		await page.getByLabelText('Signature drawing area').click({ position: { x: 10, y: 10 } });
		await page.getByRole('button', { name: 'Apply signature' }).click();

		const submitted = result.component.submit();
		form.fields[0].name = 'mutated_after_start';
		await page.getByRole('textbox', { name: 'student_name' }).fill('Changed after start');
		exportPending.resolve(new Uint8Array([4, 5, 6]));
		const value = await submitted;

		expect(pdfMocks.exportFlattenedPdf.mock.calls[0][1].fields[0].name).toBe('student_name');
		expect(pdfMocks.exportFlattenedPdf.mock.calls[0][2].student_name.value).toBe('Jordan Lee');
		expect(onsubmit).toHaveBeenCalledOnce();
		expect(value).toEqual({
			values: expect.objectContaining({ student_name: { type: 'text', value: 'Jordan Lee' } }),
			pdf: new Uint8Array([4, 5, 6])
		});
	});

	it('cancels and suppresses stale submission callbacks when the source changes', async () => {
		const exportPending = deferred<Uint8Array>();
		pdfMocks.exportFlattenedPdf.mockReturnValueOnce(exportPending.promise);
		const source = new Uint8Array([1]);
		const onsubmit = vi.fn();
		const onerror = vi.fn();
		const result = render(PdfFormFiller, {
			source,
			definition: definition(),
			prefill: { student_name: 'Jordan Lee' },
			onsubmit,
			onerror
		});
		await page.getByRole('button', { name: 'Sign parent_signature' }).click();
		await page.getByLabelText('Signature drawing area').click({ position: { x: 10, y: 10 } });
		await page.getByRole('button', { name: 'Apply signature' }).click();

		const pending = result.component.submit();
		await vi.waitFor(() => expect(pdfMocks.exportFlattenedPdf).toHaveBeenCalledOnce());
		const signal = pdfMocks.exportFlattenedPdf.mock.calls[0][3].signal as AbortSignal;
		await result.rerender({
			source: new Uint8Array([2]),
			definition: definition(),
			prefill: { student_name: 'Jordan Lee' },
			onsubmit,
			onerror
		});
		exportPending.resolve(new Uint8Array([4, 5, 6]));

		await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
		expect(signal.aborted).toBe(true);
		expect(onsubmit).not.toHaveBeenCalled();
		expect(onerror).not.toHaveBeenCalled();
	});
});
