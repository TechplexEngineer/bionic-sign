<script module lang="ts">
	export interface PdfPageOverlayContext {
		page: number;
		width: number;
		height: number;
	}
</script>

<script lang="ts">
	import type { PDFPageProxy } from 'pdfjs-dist';
	import type { Snippet } from 'svelte';

	interface Props {
		page: PDFPageProxy;
		pageNumber: number;
		zoom: number;
		current?: boolean;
		overlay?: Snippet<[PdfPageOverlayContext]>;
		onerror?: (error: unknown) => void;
	}

	let { page, pageNumber, zoom, current = false, overlay, onerror }: Props = $props();
	let canvas: HTMLCanvasElement;
	let viewport = $derived(page.getViewport({ scale: zoom }));

	function isCancelledRender(error: unknown): boolean {
		return error instanceof Error && error.name === 'RenderingCancelledException';
	}

	$effect(() => {
		const target = canvas;
		const renderPage = page;
		const renderViewport = viewport;
		const ratio = window.devicePixelRatio || 1;

		target.width = Math.ceil(renderViewport.width * ratio);
		target.height = Math.ceil(renderViewport.height * ratio);
		target.style.width = `${renderViewport.width}px`;
		target.style.height = `${renderViewport.height}px`;

		const task = renderPage.render({
			canvas: target,
			viewport: renderViewport,
			transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0]
		});
		let active = true;
		let cancelled = false;

		void task.promise.then(
			() => {
				active = false;
			},
			(error: unknown) => {
				active = false;
				if (!isCancelledRender(error)) {
					onerror?.(error);
				}
			}
		);

		return () => {
			if (active && !cancelled) {
				cancelled = true;
				task.cancel();
			}
		};
	});
</script>

<div
	class="pdf-page"
	data-page-number={pageNumber}
	aria-current={current ? 'page' : undefined}
	style:width={`${viewport.width}px`}
	style:height={`${viewport.height}px`}
>
	<canvas bind:this={canvas} aria-label={`PDF page ${pageNumber}`}></canvas>
	{#if overlay}
		<div class="pdf-page-overlay">
			{@render overlay({ page: pageNumber, width: viewport.width, height: viewport.height })}
		</div>
	{/if}
</div>

<style>
	.pdf-page {
		position: relative;
	}

	canvas {
		display: block;
	}

	.pdf-page-overlay {
		position: absolute;
		inset: 0;
	}
</style>
