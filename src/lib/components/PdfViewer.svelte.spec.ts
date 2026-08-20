import { createRawSnippet } from 'svelte';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { PdfPageOverlayContext } from './PdfPage.svelte';
import PdfViewer from './PdfViewer.svelte';

const pdfMocks = vi.hoisted(() => ({
	getPdfJs: vi.fn(),
	loadPdfBytes: vi.fn()
}));

vi.mock('../pdf/runtime.js', () => ({ getPdfJs: pdfMocks.getPdfJs }));
vi.mock('../pdf/source.js', () => ({ loadPdfBytes: pdfMocks.loadPdfBytes }));

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});

	return { promise, resolve, reject };
}

function createPdfPage(pageNumber: number, renderPromise: Promise<void> = Promise.resolve()) {
	const cancel = vi.fn();
	const render = vi.fn(() => ({ promise: renderPromise, cancel }) as unknown as RenderTask);
	const getViewport = vi.fn(({ scale }: { scale: number }) => ({
		width: pageNumber * 100 * scale,
		height: pageNumber * 150 * scale
	}));

	return {
		cancel,
		getViewport,
		page: { getViewport, render } as unknown as PDFPageProxy,
		render
	};
}

function createPdfDocument(pages: ReturnType<typeof createPdfPage>[]) {
	const getPage = vi.fn((pageNumber: number) => Promise.resolve(pages[pageNumber - 1].page));
	const document = {
		getPage,
		numPages: pages.length
	} as unknown as PDFDocumentProxy;

	return { document, getPage };
}

function usePdfDocument(document: PDFDocumentProxy) {
	const destroy = vi.fn(() => Promise.resolve());
	const getDocument = vi.fn(() => ({ destroy, promise: Promise.resolve(document) }));
	pdfMocks.getPdfJs.mockResolvedValue({ getDocument });

	return { destroy, getDocument };
}

describe('PdfViewer', () => {
	beforeEach(() => {
		pdfMocks.getPdfJs.mockReset();
		pdfMocks.loadPdfBytes.mockReset();
		pdfMocks.loadPdfBytes.mockResolvedValue(new Uint8Array([7, 8, 9]));
	});

	it('shows an accessible loading state while the source is loading', async () => {
		const loading = deferred<Uint8Array>();
		pdfMocks.loadPdfBytes.mockReturnValue(loading.promise);

		render(PdfViewer, { source: new Uint8Array([1]) });

		await expect.element(page.getByRole('status')).toHaveTextContent('Loading PDF');
		loading.resolve(new Uint8Array([1]));
	});

	it('renders one canvas per page, passes overlay dimensions, and rerenders for zoom changes', async () => {
		const pages = [createPdfPage(1), createPdfPage(2)];
		const pdfDocument = createPdfDocument(pages);
		usePdfDocument(pdfDocument.document);
		const source = new Uint8Array([1]);
		const onoverlay = vi.fn();
		const overlay = createRawSnippet<[PdfPageOverlayContext]>((context) => {
			const value = context();
			onoverlay(value);

			return { render: () => `<span data-page-overlay="${value.page}"></span>` };
		});
		const result = render(PdfViewer, {
			source,
			zoom: 1.5,
			overlay
		});

		await expect.element(page.getByLabelText('PDF page 2')).toBeVisible();
		expect(result.container.querySelectorAll('canvas')).toHaveLength(2);
		expect(onoverlay).toHaveBeenCalledWith({ page: 1, width: 150, height: 225 });
		expect(onoverlay).toHaveBeenCalledWith({ page: 2, width: 300, height: 450 });

		await result.rerender({ source, zoom: 2, overlay });
		await vi.waitFor(() => expect(pages[0].getViewport).toHaveBeenCalledWith({ scale: 2 }));
		expect(pages[1].getViewport).toHaveBeenCalledWith({ scale: 2 });
	});

	it('cancels loading, document, and page rendering when the source is replaced', async () => {
		const firstRender = deferred<void>();
		const firstPage = createPdfPage(1, firstRender.promise);
		const secondPage = createPdfPage(1);
		const firstDocument = createPdfDocument([firstPage]);
		const secondDocument = createPdfDocument([secondPage]);
		const firstLoadingDestroy = vi.fn(() => Promise.resolve());
		const secondLoadingDestroy = vi.fn(() => Promise.resolve());
		const getDocument = vi
			.fn()
			.mockReturnValueOnce({
				destroy: firstLoadingDestroy,
				promise: Promise.resolve(firstDocument.document)
			})
			.mockReturnValueOnce({
				destroy: secondLoadingDestroy,
				promise: Promise.resolve(secondDocument.document)
			});
		pdfMocks.getPdfJs.mockResolvedValue({ getDocument });
		const result = render(PdfViewer, { source: new Uint8Array([1]), zoom: 1 });

		await expect.element(page.getByLabelText('PDF page 1')).toBeVisible();
		await vi.waitFor(() => expect(firstPage.render).toHaveBeenCalledOnce());
		const firstSignal = pdfMocks.loadPdfBytes.mock.calls[0][1]?.signal as AbortSignal;

		await result.rerender({ source: new Uint8Array([2]), zoom: 1 });
		await vi.waitFor(() => expect(getDocument).toHaveBeenCalledTimes(2));

		expect(firstSignal.aborted).toBe(true);
		expect(firstLoadingDestroy).toHaveBeenCalledOnce();
		expect(firstPage.cancel).toHaveBeenCalled();
		firstRender.resolve();
	});

	it('reports a load failure and recovers when a valid source replaces it', async () => {
		const goodPage = createPdfPage(1);
		const goodDocument = createPdfDocument([goodPage]);
		usePdfDocument(goodDocument.document);
		pdfMocks.loadPdfBytes
			.mockRejectedValueOnce(new Error('The PDF is unavailable'))
			.mockResolvedValueOnce(new Uint8Array([2]));
		const onerror = vi.fn();
		const result = render(PdfViewer, { source: new Uint8Array([1]), onerror });

		await expect.element(page.getByRole('alert')).toHaveTextContent('The PDF is unavailable');
		expect(onerror).toHaveBeenCalledWith(expect.any(Error));

		await result.rerender({ source: new Uint8Array([2]), onerror });
		await expect.element(page.getByLabelText('PDF page 1')).toBeVisible();
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
	});
});
