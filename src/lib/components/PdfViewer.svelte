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
		loading?: Snippet;
		error?: Snippet<[unknown]>;
		onpagecountchange?: (pageCount: number) => void;
		onerror?: (error: unknown) => void;
	}

	let {
		source,
		requestInit,
		currentPage = $bindable(1),
		zoom = $bindable(1),
		overlay,
		loading: loadingSnippet,
		error: errorSnippet,
		onpagecountchange,
		onerror
	}: Props = $props();
	let pages = $state<PDFPageProxy[]>([]);
	let isLoading = $state(true);
	let loadError = $state<unknown>();

	function messageFor(reason: unknown): string {
		return reason instanceof Error ? reason.message : 'An unknown error occurred';
	}

	function reportError(reason: unknown): void {
		loadError = reason;
		isLoading = false;
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

		isLoading = true;
		loadError = undefined;
		pages = [];
		onpagecountchange?.(0);

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
				onpagecountchange?.(loadedPages.length);
				if (currentPage < 1 || currentPage > document.numPages) {
					currentPage = 1;
				}
				isLoading = false;
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
	{#if isLoading}
		{#if loadingSnippet}
			{@render loadingSnippet()}
		{:else}
			<p role="status">Loading PDF…</p>
		{/if}
	{:else if loadError}
		{#if errorSnippet}
			{@render errorSnippet(loadError)}
		{:else}
			<p role="alert">Unable to display PDF: {messageFor(loadError)}</p>
		{/if}
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
