<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { normalizedToViewport } from '../coordinates.js';
	import {
		cloneValues,
		createFillerState,
		firstInvalidField,
		requiredProgress,
		setSignatureValue,
		setTextValue,
		submissionValues,
		validateFiller
	} from '../filler/state.js';
	import { exportFlattenedPdf } from '../pdf/export.js';
	import { loadPdfBytes } from '../pdf/source.js';
	import { cloneDefinition } from '../schema.js';
	import {
		BionicSignError,
		type BionicSignDiagnostic,
		type FormDefinition,
		type FormSubmission,
		type FormValues,
		type PdfSource,
		type SignatureValue,
		type ValidationResult
	} from '../types.js';
	import PdfViewer from './PdfViewer.svelte';
	import SignatureDialog from './SignatureDialog.svelte';

	interface Props {
		source: PdfSource;
		definition: FormDefinition;
		prefill?: Record<string, string>;
		requestInit?: RequestInit;
		onsubmit?: (submission: FormSubmission) => void;
		onvalidation?: (result: ValidationResult) => void;
		ondiagnostic?: (diagnostic: BionicSignDiagnostic) => void;
		onerror?: (error: unknown) => void;
	}

	interface Operation {
		controller: AbortController;
	}

	let {
		source,
		definition,
		prefill = {},
		requestInit,
		onsubmit,
		onvalidation,
		ondiagnostic,
		onerror
	}: Props = $props();
	let root: HTMLElement;
	let localDefinition = $derived(cloneDefinition(definition));
	let values = $state<FormValues>({});
	let currentPage = $state(1);
	let zoom = $state(1);
	let selectedFieldId = $state<string>();
	let signatureFieldId = $state<string>();
	let signatureDialogOpen = $state(false);
	let busy = $state(false);
	let viewerReady = $state(false);
	let pendingFocus = $state<{ id: string; page: number }>();
	let lastValidation = $state<ValidationResult>();
	let activeOperation: Operation | undefined;
	let progress = $derived(requiredProgress(localDefinition, values));
	let signatureField = $derived(
		localDefinition.fields.find(({ id }) => id === signatureFieldId && id === selectedFieldId)
	);

	function abortError(): Error {
		const error = new Error('The operation was aborted.');
		error.name = 'AbortError';
		return error;
	}

	function copySource(value: PdfSource): PdfSource {
		if (typeof value === 'string') return value;
		return value instanceof Uint8Array ? value.slice() : value.slice(0);
	}

	function copyRequestInit(value: RequestInit | undefined): RequestInit | undefined {
		if (!value) return undefined;
		return {
			...value,
			headers: value.headers === undefined ? undefined : new Headers(value.headers)
		};
	}

	function copiedValidation(result: ValidationResult): ValidationResult {
		return { valid: result.valid, issues: result.issues.map((issue) => ({ ...issue })) };
	}

	function cancelActiveOperation(): void {
		if (!activeOperation) return;
		activeOperation.controller.abort(abortError());
		activeOperation = undefined;
		busy = false;
	}

	function beginOperation(): Operation {
		cancelActiveOperation();
		const operation = { controller: new AbortController() };
		activeOperation = operation;
		busy = true;
		return operation;
	}

	function assertActive(operation: Operation): void {
		if (activeOperation === operation && !operation.controller.signal.aborted) return;
		throw operation.controller.signal.reason ?? abortError();
	}

	function isCancelled(reason: unknown, operation: Operation): boolean {
		return (
			activeOperation !== operation ||
			operation.controller.signal.aborted ||
			(reason instanceof Error && reason.name === 'AbortError')
		);
	}

	function validateSnapshot(
		definitionSnapshot: FormDefinition,
		valueSnapshot: FormValues
	): ValidationResult {
		const result = validateFiller(definitionSnapshot, valueSnapshot);
		lastValidation = copiedValidation(result);
		onvalidation?.(copiedValidation(result));
		return result;
	}

	export function validate(): ValidationResult {
		const result = validateSnapshot(cloneDefinition(localDefinition), cloneValues(values));
		return copiedValidation(result);
	}

	async function runExport(
		definitionSnapshot: FormDefinition,
		valueSnapshot: FormValues
	): Promise<Uint8Array> {
		const sourceSnapshot = copySource(source);
		const requestSnapshot = copyRequestInit(requestInit);
		const operation = beginOperation();

		try {
			const sourceBytes = await loadPdfBytes(sourceSnapshot, {
				requestInit: requestSnapshot,
				signal: operation.controller.signal
			});
			assertActive(operation);
			const pdf = await exportFlattenedPdf(sourceBytes, definitionSnapshot, valueSnapshot, {
				signal: operation.controller.signal
			});
			assertActive(operation);
			return pdf.slice();
		} catch (reason) {
			if (isCancelled(reason, operation)) {
				throw operation.controller.signal.reason ?? abortError();
			}
			onerror?.(reason);
			throw reason;
		} finally {
			if (activeOperation === operation) {
				activeOperation = undefined;
				busy = false;
			}
		}
	}

	export async function exportPdf(): Promise<Uint8Array> {
		const definitionSnapshot = cloneDefinition(localDefinition);
		const valueSnapshot = submissionValues(definitionSnapshot, cloneValues(values));
		const validation = validateSnapshot(definitionSnapshot, valueSnapshot);
		if (!validation.valid) {
			throw new BionicSignError('form-validation', 'Required fields are incomplete');
		}
		return runExport(definitionSnapshot, valueSnapshot);
	}

	async function runSubmission(focusInvalid: boolean): Promise<FormSubmission> {
		const definitionSnapshot = cloneDefinition(localDefinition);
		const valueSnapshot = submissionValues(definitionSnapshot, cloneValues(values));
		const validation = validateSnapshot(definitionSnapshot, valueSnapshot);

		if (!validation.valid) {
			if (focusInvalid) {
				const first = firstInvalidField(definitionSnapshot, valueSnapshot);
				if (first) await focusField(first.id, first.page);
			}
			throw new BionicSignError('form-validation', 'Required fields are incomplete');
		}

		const pdf = await runExport(definitionSnapshot, valueSnapshot);
		const returned: FormSubmission = { values: cloneValues(valueSnapshot), pdf: pdf.slice() };
		onsubmit?.({ values: cloneValues(valueSnapshot), pdf: pdf.slice() });
		return returned;
	}

	export function submit(): Promise<FormSubmission> {
		return runSubmission(false);
	}

	async function submitFromUi(): Promise<void> {
		try {
			await runSubmission(true);
		} catch (reason) {
			if (reason instanceof BionicSignError && reason.code === 'form-validation') return;
			if (reason instanceof Error && reason.name === 'AbortError') return;
		}
	}

	function editText(fieldName: string, event: Event): void {
		values = setTextValue(values, fieldName, (event.currentTarget as HTMLInputElement).value);
		lastValidation = undefined;
	}

	function openSignature(id: string, page: number): void {
		selectedFieldId = id;
		signatureFieldId = id;
		currentPage = page;
		signatureDialogOpen = true;
	}

	function applySignature(value: SignatureValue): void {
		if (!signatureField) return;
		values = setSignatureValue(values, signatureField.name, value);
		lastValidation = undefined;
		signatureDialogOpen = false;
	}

	function cancelSignature(): void {
		signatureDialogOpen = false;
	}

	async function focusField(id: string, page: number): Promise<void> {
		pendingFocus = { id, page };
		selectedFieldId = id;
		currentPage = page;
		await tick();
		replayPendingFocus();
	}

	function navigateToField(id: string, page: number): void {
		void focusField(id, page);
	}

	function replayPendingFocus(): void {
		if (!pendingFocus) return;
		if (viewerReady) {
			const control = Array.from(root.querySelectorAll<HTMLElement>('[data-filler-field-id]')).find(
				(element) => element.dataset.fillerFieldId === pendingFocus?.id
			);
			if (control) {
				control.focus();
				pendingFocus = undefined;
				return;
			}
		}

		const fallback = Array.from(
			root.querySelectorAll<HTMLButtonElement>('[data-filler-nav-id]')
		).find((element) => element.dataset.fillerNavId === pendingFocus?.id);
		fallback?.focus();
	}

	function handlePageCount(pageCount: number): void {
		untrack(() => {
			viewerReady = pageCount > 0;
			if (viewerReady && pendingFocus) {
				void tick().then(replayPendingFocus);
			}
		});
	}

	function fieldIsInvalid(name: string): boolean {
		return lastValidation?.issues.some((issue) => issue.fieldName === name) ?? false;
	}

	function textValue(fieldName: string): string {
		const value = values[fieldName];
		return value?.type === 'text' ? value.value : '';
	}

	function signatureValue(fieldName: string | undefined): SignatureValue | undefined {
		if (!fieldName) return undefined;
		const value = values[fieldName];
		return value?.type === 'signature' ? value : undefined;
	}

	$effect(() => {
		const nextSource = source;
		const nextDefinition = localDefinition;
		const nextPrefill = { ...prefill };
		const nextRequestInit = requestInit;

		untrack(() => {
			cancelActiveOperation();
			const initial = createFillerState(nextDefinition, nextPrefill);
			values = initial.values;
			currentPage = nextDefinition.fields[0]?.page ?? 1;
			selectedFieldId = undefined;
			signatureFieldId = undefined;
			signatureDialogOpen = false;
			viewerReady = false;
			pendingFocus = undefined;
			lastValidation = undefined;
			for (const diagnostic of initial.diagnostics) {
				ondiagnostic?.({ ...diagnostic });
			}

			void nextSource;
			void nextRequestInit;
		});

		return cancelActiveOperation;
	});
</script>

{#snippet fieldLayer(context: { page: number; width: number; height: number })}
	{#each localDefinition.fields.filter((field) => field.page === context.page) as field (field.id)}
		{@const rect = normalizedToViewport(field.rect, context.width, context.height)}
		<div
			class:invalid={fieldIsInvalid(field.name)}
			class:complete={submissionValues(localDefinition, values)[field.name] !== undefined}
			class="filler-field"
			style:left={`${rect.x}px`}
			style:top={`${rect.y}px`}
			style:width={`${rect.width}px`}
			style:height={`${rect.height}px`}
		>
			{#if field.type === 'text'}
				<input
					data-filler-field-id={field.id}
					aria-label={field.name}
					aria-invalid={fieldIsInvalid(field.name) ? 'true' : undefined}
					value={textValue(field.name)}
					onfocus={() => (selectedFieldId = field.id)}
					oninput={(event) => editText(field.name, event)}
				/>
			{:else}
				<button
					type="button"
					data-filler-field-id={field.id}
					aria-label={`Sign ${field.name}`}
					onfocus={() => (selectedFieldId = field.id)}
					onclick={() => openSignature(field.id, field.page)}
				>
					{values[field.name]?.type === 'signature' ? 'Edit signature' : 'Sign here'}
				</button>
			{/if}
		</div>
	{/each}
{/snippet}

<section bind:this={root} class="pdf-form-filler" aria-busy={busy}>
	<aside aria-label="Required fields and navigation">
		<h2>Form progress</h2>
		<p role="status" aria-label="Required field progress" aria-live="polite">
			{progress.completed} of {progress.total} required fields complete. {progress.remaining}
			remaining.
		</p>
		<nav aria-label="Form fields">
			{#each localDefinition.fields as field (field.id)}
				<button
					type="button"
					data-filler-nav-id={field.id}
					class:complete={submissionValues(localDefinition, values)[field.name] !== undefined}
					class:invalid={fieldIsInvalid(field.name)}
					aria-label={`Go to ${field.name}`}
					aria-current={selectedFieldId === field.id ? 'true' : undefined}
					onclick={() => navigateToField(field.id, field.page)}
				>
					<span>{field.name}</span>
					<small>
						<span data-bionic-sign-state={field.required ? 'required' : undefined}>
							{field.required ? 'Required' : 'Optional'}
						</span>
						·
						{submissionValues(localDefinition, values)[field.name] === undefined
							? 'Incomplete'
							: 'Complete'}
					</small>
				</button>
			{/each}
		</nav>
	</aside>

	<main aria-label="PDF form">
		<div class="viewer-toolbar" aria-label="Filler toolbar">
			<button
				type="button"
				aria-label="Zoom out"
				onclick={() => (zoom = Math.max(0.25, zoom - 0.25))}
			>
				−
			</button>
			<output>{Math.round(zoom * 100)}%</output>
			<button type="button" aria-label="Zoom in" onclick={() => (zoom = Math.min(4, zoom + 0.25))}>
				+
			</button>
		</div>
		<PdfViewer
			{source}
			{requestInit}
			bind:currentPage
			bind:zoom
			overlay={fieldLayer}
			onpagecountchange={handlePageCount}
			{onerror}
		/>
	</main>

	<footer class="submission-controls">
		{#if busy}
			<p role="status" aria-label="PDF operation status" aria-live="polite">Preparing PDF…</p>
		{/if}
		<button type="button" onclick={submitFromUi} disabled={busy}>Submit signed PDF</button>
	</footer>
</section>

<SignatureDialog
	open={signatureDialogOpen}
	fieldName={signatureField?.name ?? 'signature'}
	value={signatureValue(signatureField?.name)}
	onapply={applySignature}
	oncancel={cancelSignature}
/>

<style>
	.pdf-form-filler {
		display: grid;
		grid-template-columns: minmax(13rem, 18rem) minmax(0, 1fr);
		gap: 1rem;
		color: var(--bionic-sign-text, #0f172a);
	}

	aside {
		align-self: start;
		padding: 1rem;
		border: 1px solid var(--bionic-sign-border, #cbd5e1);
		border-radius: var(--bionic-sign-radius, 0.75rem);
		background: var(--bionic-sign-surface, white);
	}

	h2,
	aside p {
		margin-top: 0;
	}

	nav {
		display: grid;
		gap: 0.5rem;
	}

	nav button {
		display: grid;
		gap: 0.15rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--bionic-sign-border, #cbd5e1);
		border-radius: 0.4rem;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
	}

	nav button.complete {
		border-color: var(--bionic-sign-completed, #15803d);
	}

	nav button.invalid,
	.filler-field.invalid {
		border-color: var(--bionic-sign-invalid, #b91c1c);
	}

	small {
		color: var(--bionic-sign-muted-text, #475569);
	}

	main {
		min-width: 0;
		overflow: auto;
	}

	.viewer-toolbar {
		display: flex;
		justify-content: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.filler-field {
		position: absolute;
		box-sizing: border-box;
		border: 2px solid var(--bionic-sign-field-border, #2563eb);
		background: var(--bionic-sign-field-background, rgb(255 255 255 / 88%));
	}

	.filler-field.complete {
		border-color: var(--bionic-sign-completed, #15803d);
	}

	.filler-field input,
	.filler-field button {
		width: 100%;
		height: 100%;
		box-sizing: border-box;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
	}

	.filler-field input:focus-visible,
	.filler-field button:focus-visible,
	button:focus-visible {
		outline: 3px solid var(--bionic-sign-focus, #1d4ed8);
		outline-offset: 2px;
	}

	.submission-controls {
		grid-column: 1 / -1;
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 1rem;
	}

	.submission-controls p {
		margin: 0;
	}

	.submission-controls button {
		padding: 0.65rem 1rem;
		border: 1px solid var(--bionic-sign-accent, #2563eb);
		border-radius: 0.45rem;
		background: var(--bionic-sign-accent, #2563eb);
		color: white;
		font: inherit;
	}

	@media (max-width: 48rem) {
		.pdf-form-filler {
			grid-template-columns: 1fr;
		}

		.submission-controls {
			grid-column: 1;
		}
	}
</style>
