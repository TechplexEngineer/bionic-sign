<script lang="ts">
	import { normalizedToViewport, viewportToNormalized } from '../coordinates.js';
	import { constrainFieldRect } from '../designer/state.js';
	import type { FieldRect, FormField } from '../types.js';

	interface Props {
		field: FormField;
		width: number;
		height: number;
		selected?: boolean;
		onselect?: (id: string) => void;
		onrectchange?: (rect: FieldRect) => void;
		ondelete?: (id: string) => void;
	}

	type Interaction = {
		pointerId: number;
		startX: number;
		startY: number;
		startRect: FieldRect;
		pageWidth: number;
		pageHeight: number;
		mode: 'move' | 'resize';
	};

	const KEYBOARD_STEP = 0.01;

	let {
		field,
		width,
		height,
		selected = false,
		onselect,
		onrectchange,
		ondelete
	}: Props = $props();
	let interaction: Interaction | undefined;
	let pixelRect = $derived(normalizedToViewport(field.rect, width, height));
	let fieldLabel = $derived(
		`${field.type === 'text' ? 'Text' : 'Signature'} field "${field.name}"`
	);
	let resizeLabel = $derived(`Resize field "${field.name}"`);

	function beginInteraction(event: PointerEvent, mode: Interaction['mode']): void {
		if (event.button !== 0) return;
		event.preventDefault();
		const target = event.currentTarget as Element;
		target.setPointerCapture(event.pointerId);
		interaction = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			startRect: { ...field.rect },
			pageWidth: width,
			pageHeight: height,
			mode
		};
	}

	function requestedPointerRect(event: PointerEvent): FieldRect | undefined {
		if (!interaction || interaction.pointerId !== event.pointerId) return undefined;

		const start = normalizedToViewport(
			interaction.startRect,
			interaction.pageWidth,
			interaction.pageHeight
		);
		const deltaX = event.clientX - interaction.startX;
		const deltaY = event.clientY - interaction.startY;
		const pixelRequest =
			interaction.mode === 'move'
				? { ...start, x: start.x + deltaX, y: start.y + deltaY }
				: { ...start, width: start.width + deltaX, height: start.height + deltaY };

		return constrainFieldRect(
			viewportToNormalized(pixelRequest, interaction.pageWidth, interaction.pageHeight)
		);
	}

	function handlePointerMove(event: PointerEvent): void {
		const rect = requestedPointerRect(event);
		if (!rect) return;
		event.preventDefault();
		onrectchange?.(rect);
	}

	function endInteraction(event: PointerEvent): void {
		if (!interaction || interaction.pointerId !== event.pointerId) return;
		const target = event.currentTarget as Element;
		if (target.hasPointerCapture(event.pointerId)) {
			target.releasePointerCapture(event.pointerId);
		}
		interaction = undefined;
	}

	function handleFieldPointerDown(event: PointerEvent): void {
		(event.currentTarget as HTMLElement).focus();
		beginInteraction(event, 'move');
	}

	function handleResizePointerDown(event: PointerEvent): void {
		event.stopPropagation();
		onselect?.(field.id);
		beginInteraction(event, 'resize');
	}

	function handleResizePointerMove(event: PointerEvent): void {
		event.stopPropagation();
		handlePointerMove(event);
	}

	function handleResizePointerEnd(event: PointerEvent): void {
		event.stopPropagation();
		endInteraction(event);
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Delete') {
			event.preventDefault();
			ondelete?.(field.id);
			return;
		}

		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onselect?.(field.id);
			return;
		}

		if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
		event.preventDefault();

		const request = { ...field.rect };
		const horizontal = event.key === 'ArrowLeft' ? -KEYBOARD_STEP : KEYBOARD_STEP;
		const vertical = event.key === 'ArrowUp' ? -KEYBOARD_STEP : KEYBOARD_STEP;

		if (event.shiftKey) {
			if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') request.width += horizontal;
			else request.height += vertical;
		} else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			request.x += horizontal;
		} else {
			request.y += vertical;
		}

		onrectchange?.(constrainFieldRect(request));
	}
</script>

<div
	class:selected
	class="field-overlay"
	role="button"
	tabindex="0"
	aria-label={fieldLabel}
	aria-pressed={selected}
	style:left={`${pixelRect.x}px`}
	style:top={`${pixelRect.y}px`}
	style:width={`${pixelRect.width}px`}
	style:height={`${pixelRect.height}px`}
	onfocus={() => onselect?.(field.id)}
	onkeydown={handleKeydown}
	onpointerdown={handleFieldPointerDown}
	onpointermove={handlePointerMove}
	onpointerup={endInteraction}
	onpointercancel={endInteraction}
>
	<span class="field-name">{field.name}</span>
	<button
		type="button"
		class="resize-handle"
		aria-label={resizeLabel}
		tabindex="-1"
		onpointerdown={handleResizePointerDown}
		onpointermove={handleResizePointerMove}
		onpointerup={handleResizePointerEnd}
		onpointercancel={handleResizePointerEnd}
	></button>
</div>

<style>
	.field-overlay {
		position: absolute;
		box-sizing: border-box;
		min-width: 1px;
		min-height: 1px;
		border: 2px solid var(--bionic-sign-field-border, #2563eb);
		background: var(--bionic-sign-field-background, rgb(37 99 235 / 12%));
		color: var(--bionic-sign-field-text, #172554);
		cursor: move;
		touch-action: none;
		user-select: none;
	}

	.field-overlay.selected {
		border-color: var(--bionic-sign-field-selected, #1d4ed8);
		background: var(--bionic-sign-field-selected-background, rgb(29 78 216 / 20%));
	}

	.field-overlay:focus-visible {
		outline: 3px solid var(--bionic-sign-focus, #1d4ed8);
		outline-offset: 2px;
	}

	.field-name {
		display: block;
		overflow: hidden;
		padding: 2px 5px;
		font:
			600 12px/1.25 system-ui,
			sans-serif;
		text-overflow: ellipsis;
		white-space: nowrap;
		pointer-events: none;
	}

	.resize-handle {
		position: absolute;
		right: -6px;
		bottom: -6px;
		width: 12px;
		height: 12px;
		padding: 0;
		border: 2px solid white;
		border-radius: 2px;
		background: var(--bionic-sign-field-selected, #1d4ed8);
		cursor: nwse-resize;
		touch-action: none;
	}
</style>
