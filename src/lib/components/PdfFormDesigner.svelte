<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		addField,
		deleteField,
		renameField,
		toggleRequired,
		updateDropdownOptions,
		updateFieldRect
	} from '../designer/state.js';
	import { cloneDefinition, validateDefinition } from '../schema.js';
	import type {
		FieldRect,
		FormDefinition,
		FormField,
		PdfSource,
		ValidationIssue,
		ValidationResult
	} from '../types.js';
	import FieldOverlay from './FieldOverlay.svelte';
	import PdfViewer from './PdfViewer.svelte';

	interface Props {
		source: PdfSource;
		definition: FormDefinition;
		requestInit?: RequestInit;
		ondefinitionchange?: (definition: FormDefinition) => void;
		onerror?: (error: unknown) => void;
		toolbar?: Snippet;
		loading?: Snippet;
		error?: Snippet<[unknown]>;
	}

	type RectKey = keyof FieldRect;

	let {
		source,
		definition,
		requestInit,
		ondefinitionchange,
		onerror,
		toolbar,
		loading,
		error
	}: Props = $props();
	let localDefinition = $derived(cloneDefinition(definition));
	let currentPage = $state(1);
	let pageCount = $state(1);
	let zoom = $state(1);
	let selectedFieldId = $state<string>();
	let fieldsPanelOpen = $state(false);
	let propertiesPanelOpen = $state(false);
	let fieldNameError = $state<string>();
	let optionsError = $state<string>();
	let selectedField = $derived(localDefinition.fields.find(({ id }) => id === selectedFieldId));
	let nameDraft = $derived(selectedField?.name ?? '');
	let optionsDraft = $derived(
		selectedField?.type === 'dropdown' ? selectedField.options.join('\n') : ''
	);

	$effect(() => {
		const storedName = selectedField?.name ?? '';
		nameDraft = storedName;
		fieldNameError = undefined;
		optionsDraft = selectedField?.type === 'dropdown' ? selectedField.options.join('\n') : '';
		optionsError = undefined;
	});

	function issueFor(reason: unknown, fieldName?: string): ValidationIssue {
		return {
			code: 'invalid-field-name',
			message: reason instanceof Error ? reason.message : 'The field name is invalid',
			fieldName
		};
	}

	export function validate(): ValidationResult {
		if (fieldNameError || optionsError) {
			return {
				valid: false,
				issues: [issueFor(new Error(fieldNameError ?? optionsError), nameDraft)]
			};
		}

		try {
			validateDefinition(localDefinition);
			return { valid: true, issues: [] };
		} catch (reason) {
			return {
				valid: false,
				issues: [
					{
						code: 'invalid-form-definition',
						message: reason instanceof Error ? reason.message : 'The form definition is invalid'
					}
				]
			};
		}
	}

	function commitDefinition(next: FormDefinition): void {
		localDefinition = cloneDefinition(next);
		ondefinitionchange?.(cloneDefinition(next));
	}

	function selectField(id: string): void {
		selectedFieldId = id;
		fieldNameError = undefined;
		propertiesPanelOpen = true;
	}

	function selectPage(page: number): void {
		currentPage = page;
		fieldsPanelOpen = false;
	}

	function handlePageCount(nextPageCount: number): void {
		pageCount = Math.max(1, nextPageCount);
	}

	function add(type: FormField['type']): void {
		const next = addField(localDefinition, type, currentPage);
		const added = next.fields.at(-1)!;
		commitDefinition(next);
		selectField(added.id);
	}

	function editName(event: Event): void {
		if (!selectedField) return;
		nameDraft = (event.currentTarget as HTMLInputElement).value;

		try {
			commitDefinition(renameField(localDefinition, selectedField.id, nameDraft));
			fieldNameError = undefined;
		} catch (reason) {
			fieldNameError = reason instanceof Error ? reason.message : 'The field name is invalid';
		}
	}

	function editRect(property: RectKey, event: Event): void {
		if (!selectedField) return;
		const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
		if (!Number.isFinite(value)) return;
		commitDefinition(
			updateFieldRect(localDefinition, selectedField.id, {
				...selectedField.rect,
				[property]: value
			})
		);
	}

	function editRequired(): void {
		if (!selectedField) return;
		commitDefinition(toggleRequired(localDefinition, selectedField.id));
	}

	function editOptions(event: Event): void {
		if (selectedField?.type !== 'dropdown') return;
		optionsDraft = (event.currentTarget as HTMLTextAreaElement).value;
		const options = optionsDraft.split('\n').map((option) => option.trim());
		try {
			commitDefinition(updateDropdownOptions(localDefinition, selectedField.id, options));
			optionsError = undefined;
		} catch (reason) {
			optionsError = reason instanceof Error ? reason.message : 'The dropdown options are invalid';
		}
	}

	function changeRect(id: string, rect: FieldRect): void {
		commitDefinition(updateFieldRect(localDefinition, id, rect));
	}

	function removeField(id: string): void {
		commitDefinition(deleteField(localDefinition, id));
		if (selectedFieldId === id) {
			selectedFieldId = undefined;
			fieldNameError = undefined;
			propertiesPanelOpen = false;
		}
	}

	function zoomBy(delta: number): void {
		zoom = Math.min(4, Math.max(0.25, zoom + delta));
	}
</script>

{#snippet fieldLayer(context: { page: number; width: number; height: number })}
	{#each localDefinition.fields.filter((field) => field.page === context.page) as field (field.id)}
		<FieldOverlay
			{field}
			width={context.width}
			height={context.height}
			selected={selectedFieldId === field.id}
			onselect={selectField}
			onrectchange={(rect) => changeRect(field.id, rect)}
			ondelete={removeField}
		/>
	{/each}
{/snippet}

<div class="pdf-form-designer">
	<header class="designer-toolbar" aria-label="Designer toolbar">
		<div class="drawer-controls">
			<button
				type="button"
				class="drawer-toggle"
				aria-expanded={fieldsPanelOpen}
				onclick={() => (fieldsPanelOpen = true)}
			>
				Open fields panel
			</button>
			<button
				type="button"
				class="drawer-toggle"
				aria-expanded={propertiesPanelOpen}
				onclick={() => (propertiesPanelOpen = true)}
			>
				Open properties panel
			</button>
		</div>
		{#if toolbar}
			{@render toolbar()}
		{:else}
			<div class="zoom-controls" aria-label="Zoom controls">
				<button type="button" aria-label="Zoom out" onclick={() => zoomBy(-0.25)}>−</button>
				<output aria-live="polite">{Math.round(zoom * 100)}%</output>
				<button type="button" aria-label="Zoom in" onclick={() => zoomBy(0.25)}>+</button>
			</div>
		{/if}
	</header>

	<div class="designer-layout">
		<aside class:open={fieldsPanelOpen} class="fields-pane" aria-label="Fields and pages">
			<div class="pane-heading">
				<h2>Fields</h2>
				<button
					type="button"
					class="drawer-close"
					aria-label="Close fields panel"
					onclick={() => (fieldsPanelOpen = false)}>×</button
				>
			</div>
			<div class="field-actions">
				<button type="button" onclick={() => add('text')}>Add text field</button>
				<button type="button" onclick={() => add('dropdown')}>Add dropdown field</button>
				<button type="button" onclick={() => add('signature')}>Add signature field</button>
			</div>
			<nav aria-label="PDF pages">
				<h3>Pages</h3>
				<div class="page-buttons">
					{#each Array.from({ length: pageCount }, (_, index) => index + 1) as page (page)}
						<button
							type="button"
							aria-current={currentPage === page ? 'page' : undefined}
							onclick={() => selectPage(page)}>Page {page}</button
						>
					{/each}
				</div>
			</nav>
		</aside>

		<main class="document-pane" aria-label="PDF form canvas">
			<PdfViewer
				{source}
				{requestInit}
				bind:currentPage
				bind:zoom
				overlay={fieldLayer}
				{loading}
				{error}
				onpagecountchange={handlePageCount}
				{onerror}
			/>
		</main>

		<aside class:open={propertiesPanelOpen} class="properties-pane" aria-label="Field properties">
			<div class="pane-heading">
				<h2>Properties</h2>
				<button
					type="button"
					class="drawer-close"
					aria-label="Close properties panel"
					onclick={() => (propertiesPanelOpen = false)}>×</button
				>
			</div>
			{#if selectedField}
				<form onsubmit={(event) => event.preventDefault()}>
					<label>
						Name
						<input
							value={nameDraft}
							oninput={editName}
							aria-invalid={fieldNameError ? 'true' : undefined}
						/>
					</label>
					{#if fieldNameError}
						<p class="field-error" role="alert">{fieldNameError}</p>
					{/if}
					{#if selectedField.type === 'dropdown'}
						<label>
							Options
							<textarea rows="5" value={optionsDraft} oninput={editOptions}></textarea>
						</label>
						<p class="options-hint">One option per line.</p>
						{#if optionsError}
							<p class="field-error" role="alert">{optionsError}</p>
						{/if}
					{/if}
					<label class="checkbox-label">
						<input type="checkbox" checked={selectedField.required} onchange={editRequired} />
						Required
					</label>
					<fieldset>
						<legend>Normalized geometry</legend>
						<label>
							X
							<input
								type="number"
								min="0"
								max="1"
								step="any"
								value={selectedField.rect.x}
								oninput={(event) => editRect('x', event)}
							/>
						</label>
						<label>
							Y
							<input
								type="number"
								min="0"
								max="1"
								step="any"
								value={selectedField.rect.y}
								oninput={(event) => editRect('y', event)}
							/>
						</label>
						<label>
							Width
							<input
								type="number"
								min="0.02"
								max="1"
								step="any"
								value={selectedField.rect.width}
								oninput={(event) => editRect('width', event)}
							/>
						</label>
						<label>
							Height
							<input
								type="number"
								min="0.02"
								max="1"
								step="any"
								value={selectedField.rect.height}
								oninput={(event) => editRect('height', event)}
							/>
						</label>
					</fieldset>
					<button
						type="button"
						class="delete-button"
						onclick={() => removeField(selectedField!.id)}
					>
						Delete field
					</button>
				</form>
			{:else}
				<p>Select a field to edit its properties.</p>
			{/if}
		</aside>
	</div>
</div>

<style>
	.pdf-form-designer {
		--designer-border: var(--bionic-sign-border, #cbd5e1);
		--designer-panel: var(--bionic-sign-panel, #ffffff);
		--designer-surface: var(--bionic-sign-surface, #f1f5f9);
		--designer-accent: var(--bionic-sign-accent, #1d4ed8);
		--designer-danger: var(--bionic-sign-danger, #b91c1c);
		position: relative;
		display: grid;
		min-height: 32rem;
		border: 1px solid var(--designer-border);
		border-radius: 0.75rem;
		background: var(--designer-surface);
		color: var(--bionic-sign-text, #0f172a);
		font-family: system-ui, sans-serif;
		overflow: hidden;
	}

	.designer-toolbar {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75rem;
		min-height: 3.25rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--designer-border);
		background: var(--designer-panel);
	}

	.designer-layout {
		display: grid;
		grid-template-columns: minmax(12rem, 15rem) minmax(0, 1fr) minmax(14rem, 18rem);
		min-width: 0;
	}

	.fields-pane,
	.properties-pane {
		box-sizing: border-box;
		padding: 1rem;
		background: var(--designer-panel);
	}

	.fields-pane {
		border-right: 1px solid var(--designer-border);
	}

	.properties-pane {
		border-left: 1px solid var(--designer-border);
	}

	.document-pane {
		min-width: 0;
		padding: 1rem;
		overflow: auto;
	}

	.pane-heading,
	.zoom-controls,
	.drawer-controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.pane-heading {
		justify-content: space-between;
	}

	h2,
	h3 {
		margin: 0 0 0.75rem;
	}

	h2 {
		font-size: 1rem;
	}

	h3 {
		font-size: 0.875rem;
	}

	button,
	input,
	textarea {
		font: inherit;
	}

	button {
		min-height: 2.25rem;
		padding: 0.4rem 0.65rem;
		border: 1px solid var(--designer-border);
		border-radius: 0.4rem;
		background: var(--designer-panel);
		color: inherit;
		cursor: pointer;
	}

	button:hover {
		border-color: var(--designer-accent);
	}

	button:focus-visible,
	input:focus-visible,
	textarea:focus-visible {
		outline: 3px solid var(--bionic-sign-focus, #2563eb);
		outline-offset: 2px;
	}

	.field-actions,
	.page-buttons {
		display: grid;
		gap: 0.5rem;
		margin-bottom: 1.25rem;
	}

	.page-buttons button[aria-current='page'] {
		border-color: var(--designer-accent);
		background: color-mix(in srgb, var(--designer-accent) 12%, white);
		font-weight: 700;
	}

	form,
	fieldset {
		display: grid;
		gap: 0.75rem;
	}

	fieldset {
		grid-template-columns: 1fr 1fr;
		margin: 0;
		padding: 0.75rem;
		border: 1px solid var(--designer-border);
		border-radius: 0.5rem;
	}

	legend {
		padding: 0 0.25rem;
		font-weight: 600;
	}

	label:not(.checkbox-label) {
		display: grid;
		gap: 0.25rem;
		font-size: 0.875rem;
		font-weight: 600;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	input:not([type='checkbox']),
	textarea {
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		padding: 0.45rem 0.55rem;
		border: 1px solid var(--designer-border);
		border-radius: 0.35rem;
	}

	.options-hint {
		margin: -0.5rem 0 0;
		color: var(--bionic-sign-muted-text, #475569);
		font-size: 0.8rem;
	}

	.field-error {
		margin: -0.35rem 0 0;
		color: var(--designer-danger);
		font-size: 0.825rem;
	}

	.delete-button {
		border-color: var(--designer-danger);
		color: var(--designer-danger);
	}

	.drawer-toggle,
	.drawer-close {
		display: none;
	}

	@media (max-width: 760px) {
		.designer-toolbar {
			justify-content: space-between;
		}

		.designer-layout {
			display: block;
		}

		.document-pane {
			min-height: 28rem;
		}

		.drawer-toggle,
		.drawer-close {
			display: inline-flex;
			align-items: center;
			justify-content: center;
		}

		.fields-pane,
		.properties-pane {
			position: absolute;
			z-index: 10;
			top: 3.25rem;
			bottom: 0;
			display: none;
			width: min(20rem, calc(100% - 2rem));
			border: 0;
			box-shadow: 0 12px 32px rgb(15 23 42 / 25%);
		}

		.fields-pane {
			left: 0;
		}

		.properties-pane {
			right: 0;
		}

		.fields-pane.open,
		.properties-pane.open {
			display: block;
		}
	}
</style>
