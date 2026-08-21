<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		PdfFormDesigner,
		cloneDefinition,
		type FormDefinition,
		type PdfSource
	} from '$lib/index.js';
	import '$lib/styles.css';

	const demoPdfUrl = '/demo/field-trip-permission.pdf';
	const downloadUrls: string[] = [];

	let source = $state<PdfSource>(demoPdfUrl);
	let sourceUrl = $state(demoPdfUrl);
	let definition = $state<FormDefinition>({ version: 1, fields: [] });
	let sourceStatus = $state('Demo PDF loaded from URL.');
	let errorMessage = $state('');
	let sourceRevision = 0;
	let schemaJson = $derived(JSON.stringify(definition, null, 2));

	function messageFor(reason: unknown): string {
		return reason instanceof Error ? reason.message : 'An unknown browser error occurred.';
	}

	function loadUrl(): void {
		const nextUrl = sourceUrl.trim();
		if (!nextUrl) {
			errorMessage = 'Enter a PDF URL before loading.';
			return;
		}

		sourceRevision += 1;
		source = nextUrl;
		sourceStatus = `PDF loaded from URL: ${nextUrl}`;
		errorMessage = '';
	}

	async function loadFile(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (file.type && file.type !== 'application/pdf') {
			errorMessage = 'Choose a PDF file.';
			return;
		}

		const revision = ++sourceRevision;
		sourceStatus = `Reading ${file.name}…`;
		errorMessage = '';
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			if (revision !== sourceRevision) return;
			source = bytes;
			sourceStatus = `Local PDF ready: ${file.name}`;
		} catch (reason) {
			if (revision !== sourceRevision) return;
			errorMessage = `Could not read ${file.name}: ${messageFor(reason)}`;
		}
	}

	function updateDefinition(next: FormDefinition): void {
		definition = cloneDefinition(next);
	}

	function releaseDownload(url: string): void {
		const index = downloadUrls.indexOf(url);
		if (index === -1) return;
		downloadUrls.splice(index, 1);
		URL.revokeObjectURL(url);
	}

	function downloadBlob(blob: Blob, filename: string): void {
		const url = URL.createObjectURL(blob);
		downloadUrls.push(url);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		anchor.hidden = true;
		document.body.append(anchor);
		anchor.click();
		anchor.remove();
		window.setTimeout(() => releaseDownload(url), 0);
	}

	function downloadSchema(): void {
		downloadBlob(new Blob([schemaJson], { type: 'application/json' }), 'bionic-sign.schema.json');
	}

	$effect(() => {
		return () => {
			for (const url of downloadUrls) URL.revokeObjectURL(url);
			downloadUrls.length = 0;
		};
	});
</script>

<svelte:head>
	<title>Form designer — Bionic Sign</title>
	<meta
		name="description"
		content="Place named text and signature fields on a PDF and download a portable Bionic Sign schema."
	/>
</svelte:head>

<div class="app-shell">
	<header class="app-header">
		<a class="brand" href={resolve('/')} aria-label="Bionic Sign home">
			<span class="brand-mark" aria-hidden="true">B</span>
			<span>Bionic Sign</span>
		</a>
		<nav aria-label="Demo routes">
			<a aria-current="page" href={resolve('/designer')}>Designer</a>
			<a href={resolve('/filler')}>Filler</a>
		</nav>
	</header>

	<main>
		<section class="intro">
			<div>
				<p class="eyebrow">Workflow 01 / Design</p>
				<h1>Build a reusable form layer.</h1>
			</div>
			<p>
				Choose a local PDF or a URL, place named fields, then download the live JSON definition. The
				PDF and schema stay separate by design.
			</p>
		</section>

		<section class="source-panel" aria-labelledby="source-title">
			<div class="panel-heading">
				<span class="panel-index">01</span>
				<div>
					<h2 id="source-title">Choose a source</h2>
					<p>URL sources need browser-accessible CORS headers.</p>
				</div>
			</div>

			<div class="source-controls">
				<form
					onsubmit={(event) => {
						event.preventDefault();
						loadUrl();
					}}
				>
					<label for="pdf-url">PDF URL</label>
					<div class="input-action">
						<input
							id="pdf-url"
							type="text"
							inputmode="url"
							bind:value={sourceUrl}
							spellcheck="false"
						/>
						<button type="submit">Load PDF URL</button>
					</div>
				</form>
				<div class="divider" aria-hidden="true"><span>or</span></div>
				<label class="file-control">
					<span>PDF file</span>
					<input type="file" accept="application/pdf,.pdf" onchange={loadFile} />
				</label>
			</div>

			<p role="status" aria-label="PDF source status" aria-live="polite">{sourceStatus}</p>
			{#if errorMessage}
				<p class="error" role="alert">{errorMessage}</p>
			{/if}
		</section>

		<div class="workspace-grid">
			<section class="designer-panel" aria-labelledby="designer-title">
				<div class="panel-heading compact">
					<span class="panel-index">02</span>
					<div>
						<h2 id="designer-title">Place fields</h2>
						<p>Add, select, position, and rename fields over either page.</p>
					</div>
				</div>
				<div class="bionic-sign component-frame">
					<PdfFormDesigner
						{source}
						{definition}
						ondefinitionchange={updateDefinition}
						onerror={(reason) => (errorMessage = messageFor(reason))}
					/>
				</div>
			</section>

			<section class="schema-panel" aria-label="Live schema">
				<div class="schema-heading">
					<div>
						<p class="eyebrow">Live output</p>
						<h2>Definition JSON</h2>
					</div>
					<span
						>{definition.fields.length} {definition.fields.length === 1 ? 'field' : 'fields'}</span
					>
				</div>
				<textarea class="json-output" aria-label="Definition JSON" readonly value={schemaJson}
				></textarea>
				<button class="download-button" type="button" onclick={downloadSchema}>
					Download schema <span aria-hidden="true">↓</span>
				</button>
				<p class="microcopy">Load this file in the filler or persist it in your own application.</p>
			</section>
		</div>

		<aside class="notice" aria-label="Local processing notice">
			<span aria-hidden="true">●</span>
			<p>
				<strong>Local-only demo.</strong> No document or schema is uploaded or saved by Bionic Sign.
			</p>
		</aside>
	</main>
</div>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(html) {
		background: #f2f1ea;
	}

	:global(body) {
		margin: 0;
		background: #f2f1ea;
		color: #152019;
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}

	:global(button),
	:global(input) {
		font: inherit;
	}

	.app-shell {
		min-height: 100vh;
	}

	.app-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 4.6rem;
		padding: 0 clamp(1rem, 4vw, 3.5rem);
		border-bottom: 1px solid #c8cbc4;
		background: rgb(242 241 234 / 92%);
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.65rem;
		color: inherit;
		font-size: 0.9rem;
		font-weight: 780;
		text-decoration: none;
	}

	.brand-mark {
		display: grid;
		width: 1.9rem;
		height: 1.9rem;
		place-items: center;
		border-radius: 50%;
		background: #0c4e2f;
		color: #d7ff9b;
		font-family: Georgia, serif;
		font-style: italic;
	}

	.app-header nav {
		display: flex;
		gap: 0.35rem;
	}

	.app-header nav a {
		padding: 0.55rem 0.8rem;
		border-radius: 999px;
		color: #5f6b64;
		font-size: 0.78rem;
		font-weight: 680;
		text-decoration: none;
	}

	.app-header nav a[aria-current='page'] {
		background: #dbe7dc;
		color: #0c4e2f;
	}

	main {
		width: min(100% - 2rem, 94rem);
		margin: 0 auto;
		padding: clamp(2.5rem, 6vw, 5.5rem) 0 3rem;
	}

	.intro {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(18rem, 0.6fr);
		align-items: end;
		gap: 3rem;
		margin-bottom: 3rem;
	}

	.eyebrow {
		margin: 0 0 0.75rem;
		color: #0c6a3b;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.66rem;
		font-weight: 750;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}

	h1 {
		max-width: 13ch;
		margin: 0;
		font-family: Georgia, 'Times New Roman', serif;
		font-size: clamp(2.8rem, 6vw, 5.5rem);
		font-weight: 500;
		letter-spacing: -0.06em;
		line-height: 0.95;
	}

	.intro > p {
		margin: 0;
		color: #5d6861;
		font-size: 0.95rem;
		line-height: 1.7;
	}

	.source-panel,
	.designer-panel,
	.schema-panel {
		border: 1px solid #c8cbc4;
		background: #faf9f3;
	}

	.source-panel {
		padding: 1.25rem;
	}

	.panel-heading {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
	}

	.panel-heading.compact {
		padding: 1.1rem 1.25rem;
		border-bottom: 1px solid #d7d9d2;
	}

	.panel-index {
		display: grid;
		flex: 0 0 auto;
		width: 2.2rem;
		height: 2.2rem;
		place-items: center;
		border: 1px solid #9bb4a0;
		border-radius: 50%;
		color: #0c6a3b;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.65rem;
		font-weight: 750;
	}

	h2,
	.panel-heading p {
		margin: 0;
	}

	h2 {
		font-size: 1rem;
		letter-spacing: -0.02em;
	}

	.panel-heading p {
		margin-top: 0.25rem;
		color: #5f6b64;
		font-size: 0.78rem;
	}

	.source-controls {
		display: grid;
		grid-template-columns: minmax(0, 1.5fr) auto minmax(14rem, 0.5fr);
		align-items: end;
		gap: 1rem;
		margin: 1.35rem 0 0.85rem 3.2rem;
	}

	.source-controls form,
	.file-control {
		display: grid;
		gap: 0.4rem;
	}

	.source-controls label,
	.file-control > span {
		color: #526059;
		font-size: 0.72rem;
		font-weight: 700;
	}

	.input-action {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
	}

	input {
		min-width: 0;
		min-height: 2.75rem;
		padding: 0.65rem 0.75rem;
		border: 1px solid #b7bdb7;
		border-radius: 0;
		background: white;
		color: inherit;
	}

	.input-action button,
	.download-button {
		border: 1px solid #0c4e2f;
		background: #0c4e2f;
		color: white;
		font-weight: 720;
		cursor: pointer;
	}

	.input-action button {
		min-height: 2.75rem;
		padding: 0 1rem;
	}

	.divider {
		display: grid;
		height: 2.75rem;
		place-items: center;
		color: #5f6b64;
		font-family: Georgia, serif;
		font-size: 0.8rem;
		font-style: italic;
	}

	.source-panel > [role='status'],
	.error {
		margin: 0.35rem 0 0 3.2rem;
		font-size: 0.75rem;
	}

	.source-panel > [role='status'] {
		color: #437253;
	}

	.error {
		color: #9f2626;
	}

	.workspace-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(18rem, 23rem);
		align-items: start;
		gap: 1rem;
		margin-top: 1rem;
	}

	.designer-panel {
		min-width: 0;
	}

	.component-frame {
		--bionic-sign-accent: #0c6a3b;
		--bionic-sign-focus-ring: #0c6a3b;
		--bionic-sign-focus: #0c6a3b;
		padding: 1rem;
	}

	.schema-panel {
		position: sticky;
		top: 1rem;
		padding: 1.1rem;
	}

	.schema-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.schema-heading > span {
		padding: 0.35rem 0.5rem;
		border-radius: 999px;
		background: #e4ece4;
		color: #346044;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.6rem;
		white-space: nowrap;
	}

	.json-output {
		display: block;
		width: 100%;
		height: 31rem;
		max-height: 31rem;
		margin: 1rem 0;
		padding: 1rem;
		overflow: auto;
		border: 1px solid #cbd5cc;
		border-radius: 0;
		background: #101b15;
		color: #c7fbd2;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.72rem;
		line-height: 1.55;
		resize: vertical;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.download-button {
		display: flex;
		width: 100%;
		min-height: 2.8rem;
		align-items: center;
		justify-content: space-between;
		padding: 0 0.9rem;
	}

	.microcopy {
		margin: 0.75rem 0 0;
		color: #5f6b64;
		font-size: 0.68rem;
		line-height: 1.5;
	}

	.notice {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 1rem;
		padding: 0.85rem 1rem;
		border: 1px solid #b6c8b9;
		background: #e8f0e7;
		color: #365443;
	}

	.notice span {
		color: #29a05c;
		font-size: 0.65rem;
	}

	.notice p {
		margin: 0;
		font-size: 0.75rem;
	}

	:global(a:focus-visible),
	button:focus-visible,
	input:focus-visible,
	.json-output:focus-visible {
		outline: 3px solid #168a4e;
		outline-offset: 3px;
	}

	@media (max-width: 72rem) {
		.workspace-grid {
			grid-template-columns: 1fr;
		}

		.schema-panel {
			position: static;
		}
	}

	@media (max-width: 760px) {
		main {
			width: min(100% - 1rem, 94rem);
			padding-top: 2.5rem;
		}

		.intro,
		.source-controls {
			grid-template-columns: 1fr;
			gap: 1rem;
		}

		.intro {
			align-items: start;
		}

		.source-controls,
		.source-panel > [role='status'],
		.error {
			margin-left: 0;
		}

		.divider {
			display: none;
		}

		.component-frame {
			padding: 0.5rem;
		}
	}

	@media (max-width: 520px) {
		.app-header {
			padding: 0 0.75rem;
		}

		.brand > span:last-child {
			display: none;
		}

		.input-action {
			grid-template-columns: 1fr;
			gap: 0.5rem;
		}
	}
</style>
