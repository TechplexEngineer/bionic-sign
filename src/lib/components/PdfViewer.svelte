<script lang="ts">
	import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
	import type { Snippet } from 'svelte';
	import { getPdfJs } from '../pdf/runtime.js';
	import { loadPdfBytes } from '../pdf/source.js';
	import type { PdfSource } from '../types.js';
	import PdfPage, { type PdfPageOverlayContext } from './PdfPage.svelte';

	interface Props {
		source: PdfSource;
		requestInit?: RequestInit;
		currentPage?: number;
		zoom?: number;
		overlay?: Snippet<[PdfPageOverlayContext]>;
		onerror?: (error: unknown) => void;
	}

	let {
		source,
		requestInit,
		currentPage = $bindable(1),
		zoom = $bindable(1),
		overlay,
		onerror
	}: Props = $props();
	let pages = $state<PDFPageProxy[]>([]);
	let loading = $state(true);
	let error = $state<unknown>();

	function messageFor(reason: unknown): string {
		return reason instanceof Error ? reason.message : 'An unknown error occurred';
	}

	function reportError(reason: unknown): void {
		error = reason;
		loading = false;
		onerror?.(reason);
	}

	$effect(() => {
		const nextSource = source;
		const nextRequestInit = requestInit;
		const abortController = new AbortController();
		let cancelled = false;
		let loadingTask: PDFDocumentLoadingTask | undefined;
		let loadingTaskDestroyed = false;

		function destroyLoadingTask(): void {
			if (loadingTask && !loadingTaskDestroyed) {
				loadingTaskDestroyed = true;
				void loadingTask.destroy();
			}
		}

		loading = true;
		error = undefined;
		pages = [];

		void (async () => {
			try {
				const bytes = await loadPdfBytes(nextSource, {
					requestInit: nextRequestInit,
					signal: abortController.signal
				});
				if (cancelled) return;

				const pdfJs = await getPdfJs();
				if (cancelled) return;

				loadingTask = pdfJs.getDocument({ data: bytes });
				const document: PDFDocumentProxy = await loadingTask.promise;
				if (cancelled) {
					destroyLoadingTask();
					return;
				}

				const loadedPages = await Promise.all(
					Array.from({ length: document.numPages }, (_, index) => document.getPage(index + 1))
				);
				if (cancelled) return;

				pages = loadedPages;
				if (currentPage < 1 || currentPage > document.numPages) {
					currentPage = 1;
				}
				loading = false;
			} catch (reason) {
				if (!cancelled && !abortController.signal.aborted) {
					reportError(reason);
				}
			}
		})();

		return () => {
			cancelled = true;
			abortController.abort();
			destroyLoadingTask();
		};
	});
</script>

<div class="pdf-viewer" data-current-page={currentPage} data-zoom={zoom}>
	{#if loading}
		<p role="status">Loading PDF…</p>
	{:else if error}
		<p role="alert">Unable to display PDF: {messageFor(error)}</p>
	{:else}
		{#each pages as pdfPage, index (pdfPage)}
			<PdfPage
				page={pdfPage}
				pageNumber={index + 1}
				{zoom}
				current={currentPage === index + 1}
				{overlay}
				onerror={reportError}
			/>
		{/each}
	{/if}
</div>

<style>
	.pdf-viewer {
		display: grid;
		justify-items: center;
		gap: 1rem;
	}
</style>
