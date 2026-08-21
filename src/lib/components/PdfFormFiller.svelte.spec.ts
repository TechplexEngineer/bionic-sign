import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { FormDefinition, FormSubmission } from '../types.js';
import PdfFormFiller from './PdfFormFiller.svelte';

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

function usePdf(): void {
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
	pdfMocks.getPdfJs.mockResolvedValue({
		getDocument: vi.fn(() => ({ destroy: vi.fn(), promise: Promise.resolve(document) }))
	});
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

describe('PdfFormFiller', () => {
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
