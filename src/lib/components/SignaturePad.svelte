<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type SignaturePadInstance from 'signature_pad';
	import type { SignatureValue } from '../types.js';

	interface Props {
		value?: SignatureValue;
		onchange?: (value: SignatureValue | undefined) => void;
		onemptychange?: (empty: boolean) => void;
	}

	type SignaturePadConstructor = new (canvas: HTMLCanvasElement) => SignaturePadInstance;

	let { value, onchange, onemptychange }: Props = $props();
	const uid = $props.id();
	let canvas: HTMLCanvasElement;
	let signaturePad = $state<SignaturePadInstance>();
	let signaturePadConstructor: SignaturePadConstructor | undefined;
	let empty = $state(true);
	let capturedValue: SignatureValue | undefined;
	let appliedValueImage: string | undefined;
	let externalImageLayer: HTMLCanvasElement | undefined;
	let valueRevision = 0;

	function setEmpty(nextEmpty: boolean, notify: boolean): void {
		const changed = empty !== nextEmpty;
		empty = nextEmpty;
		if (notify && changed) {
			onemptychange?.(nextEmpty);
		}
	}

	function readValue(): SignatureValue | undefined {
		if (!signaturePad) {
			return capturedValue;
		}

		if (signaturePad.isEmpty()) {
			return capturedValue;
		}

		return {
			type: 'signature',
			image: signaturePad.toDataURL('image/png')
		};
	}

	function handleStrokeEnd(): void {
		valueRevision += 1;
		capturedValue = readValue();
		appliedValueImage = capturedValue?.image;
		setEmpty(capturedValue === undefined, true);
		onchange?.(capturedValue);
	}

	function handleStrokeBegin(): void {
		valueRevision += 1;
	}

	function sizeCanvas(): void {
		const ratio = Math.max(window.devicePixelRatio || 1, 1);
		const width = Math.max(canvas.offsetWidth, 1);
		const height = Math.max(canvas.offsetHeight, 1);

		canvas.width = Math.round(width * ratio);
		canvas.height = Math.round(height * ratio);
		canvas.getContext('2d')?.scale(ratio, ratio);
	}

	function resizeCanvas(): void {
		if (!signaturePad) {
			sizeCanvas();
			return;
		}

		const points = signaturePad.toData();
		sizeCanvas();
		signaturePad.clear();
		drawExternalImage();
		if (points.length > 0) {
			signaturePad.fromData(points, { clear: false });
		}
	}

	function createExternalImageLayer(): HTMLCanvasElement {
		const layer = document.createElement('canvas');
		const ratio = Math.max(window.devicePixelRatio || 1, 1);
		layer.width = canvas.width;
		layer.height = canvas.height;
		layer.getContext('2d')?.scale(ratio, ratio);
		return layer;
	}

	function drawExternalImage(): void {
		if (!externalImageLayer) return;

		const ratio = Math.max(window.devicePixelRatio || 1, 1);
		canvas
			.getContext('2d')
			?.drawImage(
				externalImageLayer,
				0,
				0,
				externalImageLayer.width,
				externalImageLayer.height,
				0,
				0,
				canvas.width / ratio,
				canvas.height / ratio
			);
	}

	async function applyValue(nextValue: SignatureValue | undefined): Promise<void> {
		const pad = signaturePad;
		const Constructor = signaturePadConstructor;
		if (!pad || !Constructor) {
			capturedValue = nextValue;
			setEmpty(nextValue === undefined, false);
			return;
		}

		const revision = ++valueRevision;
		if (nextValue?.image === appliedValueImage) {
			return;
		}

		if (!nextValue) {
			if (appliedValueImage !== undefined || !pad.isEmpty()) {
				pad.clear();
			}
			capturedValue = undefined;
			appliedValueImage = undefined;
			externalImageLayer = undefined;
			setEmpty(true, false);
			return;
		}

		pad.clear();
		externalImageLayer = undefined;
		capturedValue = undefined;
		setEmpty(true, false);
		const layer = createExternalImageLayer();
		const stagingPad = new Constructor(layer);
		try {
			await stagingPad.fromDataURL(nextValue.image);
			if (revision !== valueRevision || pad !== signaturePad) {
				return;
			}

			pad.clear();
			externalImageLayer = layer;
			drawExternalImage();
			capturedValue = nextValue;
			appliedValueImage = nextValue.image;
			setEmpty(false, false);
		} finally {
			stagingPad.off();
		}
	}

	$effect(() => {
		const ready = signaturePad !== undefined;
		const nextValue = value;
		untrack(() => {
			if (ready) {
				void applyValue(nextValue);
			} else {
				capturedValue = nextValue;
				setEmpty(nextValue === undefined, false);
			}
		});
	});

	onMount(() => {
		let disposed = false;
		let mountedPad: SignaturePadInstance | undefined;
		let resizeObserver: ResizeObserver | undefined;

		void import('signature_pad').then(({ default: SignaturePadConstructor }) => {
			if (disposed) return;

			sizeCanvas();
			signaturePadConstructor = SignaturePadConstructor;
			mountedPad = new SignaturePadConstructor(canvas);
			mountedPad.addEventListener('beginStroke', handleStrokeBegin);
			mountedPad.addEventListener('endStroke', handleStrokeEnd);
			signaturePad = mountedPad;
			resizeObserver = new ResizeObserver(resizeCanvas);
			resizeObserver.observe(canvas);
		});

		return () => {
			disposed = true;
			resizeObserver?.disconnect();
			mountedPad?.removeEventListener('beginStroke', handleStrokeBegin);
			mountedPad?.removeEventListener('endStroke', handleStrokeEnd);
			mountedPad?.off();
			signaturePad = undefined;
			signaturePadConstructor = undefined;
			externalImageLayer = undefined;
		};
	});

	export function clear(): void {
		valueRevision += 1;
		signaturePad?.clear();
		capturedValue = undefined;
		appliedValueImage = undefined;
		externalImageLayer = undefined;
		setEmpty(true, true);
		onchange?.(undefined);
	}

	export function toValue(): SignatureValue | undefined {
		return readValue();
	}
</script>

<div class="signature-pad" role="group" aria-label="Signature capture">
	<p id={`${uid}-instructions`}>Draw your signature with a pointer, touch, or stylus.</p>
	<canvas
		bind:this={canvas}
		aria-label="Signature drawing area"
		aria-describedby={`${uid}-instructions`}
	>
		Signature drawing area
	</canvas>
	<div class="signature-pad__controls">
		<button type="button" onclick={clear} disabled={empty}>Clear signature</button>
		<p role="status" aria-live="polite" aria-atomic="true">
			{empty ? 'Signature is empty.' : 'Signature is complete.'}
		</p>
	</div>
</div>

<style>
	.signature-pad {
		display: grid;
		gap: 0.75rem;
	}

	.signature-pad > p {
		margin: 0;
	}

	canvas {
		display: block;
		width: 100%;
		height: 11.25rem;
		border: 1px solid currentColor;
		border-radius: 0.375rem;
		background: white;
		box-sizing: border-box;
		touch-action: none;
	}

	.signature-pad__controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.signature-pad__controls p {
		margin: 0;
	}
</style>
