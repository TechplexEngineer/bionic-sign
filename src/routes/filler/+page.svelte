<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		PdfFormFiller,
		cloneDefinition,
		validateDefinition,
		type BionicSignDiagnostic,
		type FormDefinition,
		type FormSubmission,
		type PdfSource,
		type ValidationResult
	} from '$lib/index.js';
	import '$lib/styles.css';

	const demoPdfUrl = '/demo/field-trip-permission.pdf';
	const demoSchemaUrl = '/demo/field-trip-permission.schema.json';
	const emptyValidationSummary = 'Complete the required fields to create a download.';
	const emptySubmissionJson = 'No completed submission yet.';
	const downloadUrls: string[] = [];

	let source = $state<PdfSource>(demoPdfUrl);
	let sourceUrl = $state(demoPdfUrl);
	let sourceStatus = $state('Demo PDF loaded from URL.');
	let definition = $state<FormDefinition>();
	let schemaStatus = $state('Loading the demo schema…');
	let studentPrefill = $state('Jordan Lee');
	let validationSummary = $state(emptyValidationSummary);
	let submissionJson = $state(emptySubmissionJson);
	let errorMessage = $state('');
	let diagnostics = $state<BionicSignDiagnostic[]>([]);
	let sourceRevision = 0;
	let schemaRevision = 0;

	function messageFor(reason: unknown): string {
		return reason instanceof Error ? reason.message : 'An unknown browser error occurred.';
	}

	function resetSubmissionOutput(): void {
		validationSummary = emptyValidationSummary;
		submissionJson = emptySubmissionJson;
		diagnostics = [];
	}

	function loadUrl(): void {
		const nextUrl = sourceUrl.trim();
		if (!nextUrl) {
			errorMessage = 'Enter a PDF URL before loading.';
			return;
		}

		sourceRevision += 1;
		resetSubmissionOutput();
		source = nextUrl;
		sourceStatus = `PDF loaded from URL: ${nextUrl}`;
		errorMessage = '';
	}

	async function loadPdfFile(event: Event): Promise<void> {
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
			resetSubmissionOutput();
			source = bytes;
			sourceStatus = `Local PDF ready: ${file.name}`;
		} catch (reason) {
			if (revision !== sourceRevision) return;
			errorMessage = `Could not read ${file.name}: ${messageFor(reason)}`;
		}
	}

	async function loadSchemaFile(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const revision = ++schemaRevision;
		schemaStatus = `Reading ${file.name}…`;
		errorMessage = '';
		try {
			const parsed = JSON.parse(await file.text()) as unknown;
			const nextDefinition = validateDefinition(parsed);
			if (revision !== schemaRevision) return;
			resetSubmissionOutput();
			definition = cloneDefinition(nextDefinition);
			schemaStatus = `Schema ready: ${file.name}`;
		} catch (reason) {
			if (revision !== schemaRevision) return;
			errorMessage = `Could not load ${file.name}: ${messageFor(reason)}`;
			schemaStatus = 'Schema file was rejected.';
		}
	}

	function handleValidation(result: ValidationResult): void {
		validationSummary = result.valid
			? 'All required fields are complete; preparing the download…'
			: `${result.issues.length} required ${result.issues.length === 1 ? 'field is' : 'fields are'} incomplete.`;
	}

	function handleDiagnostic(diagnostic: BionicSignDiagnostic): void {
		diagnostics = [...diagnostics, { ...diagnostic }];
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

	function handleSubmission(submission: FormSubmission): void {
		submissionJson = JSON.stringify(submission.values, null, 2);
		validationSummary = 'Signed PDF is ready to download.';
		downloadBlob(
			new Blob([submission.pdf.slice().buffer], { type: 'application/pdf' }),
			'field-trip-permission-signed.pdf'
		);
	}

	function handleError(reason: unknown): void {
		errorMessage = messageFor(reason);
	}

	function updateStudentPrefill(event: Event): void {
		const nextPrefill = (event.currentTarget as HTMLInputElement).value;
		if (nextPrefill === studentPrefill) return;
		studentPrefill = nextPrefill;
		resetSubmissionOutput();
	}

	$effect(() => {
		const controller = new AbortController();
		const revision = ++schemaRevision;

		void (async () => {
			try {
				const response = await fetch(demoSchemaUrl, { signal: controller.signal });
				if (!response.ok) throw new Error(`Demo schema request failed (${response.status})`);
				const nextDefinition = validateDefinition(await response.json());
				if (revision !== schemaRevision || controller.signal.aborted) return;
				resetSubmissionOutput();
				definition = cloneDefinition(nextDefinition);
				schemaStatus = 'Demo schema ready: field-trip-permission.schema.json';
			} catch (reason) {
				if (controller.signal.aborted || revision !== schemaRevision) return;
				errorMessage = `Could not load the demo schema: ${messageFor(reason)}`;
				schemaStatus = 'Demo schema was not loaded.';
			}
		})();

		return () => {
			controller.abort();
			for (const url of downloadUrls) URL.revokeObjectURL(url);
			downloadUrls.length = 0;
		};
	});
</script>

<svelte:head>
	<title>Fill and sign — Bionic Sign</title>
	<meta
		name="description"
		content="Complete a PDF form locally, inspect structured values, and download a flattened result."
	/>
</svelte:head>

<div class="app-shell">
	<header class="app-header">
		<a class="brand" href={resolve('/')} aria-label="Bionic Sign home">
			<span class="brand-mark" aria-hidden="true">B</span>
			<span>Bionic Sign</span>
		</a>
		<nav aria-label="Demo routes">
			<a href={resolve('/designer')}>Designer</a>
			<a aria-current="page" href={resolve('/filler')}>Filler</a>
		</nav>
	</header>

	<main>
		<section class="intro">
			<div>
				<p class="eyebrow">Workflow 02 / Complete</p>
				<h1>Fill once. Export two ways.</h1>
			</div>
			<p>
				Complete the visible form, then receive structured field values and a flattened PDF from the
				same submission.
			</p>
		</section>

		<section class="setup-panel" aria-labelledby="setup-title">
			<div class="panel-heading">
				<span class="panel-index">01</span>
				<div>
					<h2 id="setup-title">Load the form pair</h2>
					<p>Use the demo assets or replace either side with a local file.</p>
				</div>
			</div>

			<div class="setup-grid">
				<div class="control-group">
					<p class="control-label">Source PDF</p>
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
					<label class="file-control">
						<span>PDF file</span>
						<input type="file" accept="application/pdf,.pdf" onchange={loadPdfFile} />
					</label>
					<p role="status" aria-label="PDF source status" aria-live="polite">{sourceStatus}</p>
				</div>

				<div class="control-group schema-control">
					<p class="control-label">Form definition</p>
					<label class="file-control">
						<span>Schema file</span>
						<input type="file" accept="application/json,.json" onchange={loadSchemaFile} />
					</label>
					<p role="status" aria-label="Schema status" aria-live="polite">{schemaStatus}</p>
					<p class="schema-hint">Version 1 JSON · named text and signature fields</p>
				</div>

				<div class="control-group prefill-control">
					<p class="control-label">Host prefill</p>
					<label for="student-prefill">Student name prefill</label>
					<input id="student-prefill" value={studentPrefill} oninput={updateStudentPrefill} />
					<p>The signer can still edit this value in the PDF.</p>
				</div>
			</div>

			{#if errorMessage}
				<p class="error" role="alert">{errorMessage}</p>
			{/if}
		</section>

		<div class="content-grid">
			<section class="filler-panel" aria-labelledby="filler-title">
				<div class="panel-heading compact">
					<span class="panel-index">02</span>
					<div>
						<h2 id="filler-title">Complete the permission form</h2>
						<p>Required fields validate before any PDF is generated.</p>
					</div>
				</div>

				<div class="validation-strip">
					<span aria-hidden="true"></span>
					<p role="status" aria-label="Submission validation" aria-live="polite">
						{validationSummary}
					</p>
				</div>

				{#if definition}
					<div class="bionic-sign component-frame">
						<PdfFormFiller
							{source}
							{definition}
							prefill={{ student_name: studentPrefill }}
							onsubmit={handleSubmission}
							onvalidation={handleValidation}
							ondiagnostic={handleDiagnostic}
							onerror={handleError}
						/>
					</div>
				{:else}
					<p class="loading" role="status">Preparing the form definition…</p>
				{/if}
			</section>

			<aside class="output-column">
				<section aria-label="Structured submission values">
					<div class="output-heading">
						<div>
							<p class="eyebrow">Host payload</p>
							<h2>Structured values</h2>
						</div>
						<span>JSON</span>
					</div>
					<textarea class="json-output" aria-label="Submission JSON" readonly value={submissionJson}
					></textarea>
					<p class="microcopy">The flattened PDF downloads after the same successful submit.</p>
				</section>

				{#if diagnostics.length > 0}
					<section class="diagnostics" aria-labelledby="diagnostics-title">
						<h2 id="diagnostics-title">Prefill diagnostics</h2>
						<ul>
							{#each diagnostics as diagnostic (diagnostic)}
								<li>{diagnostic.message}</li>
							{/each}
						</ul>
					</section>
				{/if}
			</aside>
		</div>

		<section class="trust-grid" aria-label="Processing and legal notices">
			<article>
				<span aria-hidden="true">01</span>
				<div>
					<h2>Your document never leaves this browser.</h2>
					<p>This demo has no backend, upload endpoint, account, or database.</p>
				</div>
			</article>
			<article>
				<span aria-hidden="true">02</span>
				<div>
					<h2>Signatures are not certificate-backed.</h2>
					<p>
						They are visual electronic marks; identity, consent, and audit records remain yours.
					</p>
				</div>
			</article>
		</section>
	</main>
</div>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(html) {
		background: #eff2ed;
	}

	:global(body) {
		margin: 0;
		background:
			linear-gradient(90deg, transparent 49.9%, rgb(26 54 37 / 4%) 50%, transparent 50.1%), #eff2ed;
		background-size: 5rem 100%;
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
		border-bottom: 1px solid #c7cec7;
		background: rgb(239 242 237 / 92%);
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

	.setup-panel,
	.filler-panel,
	.output-column section,
	.trust-grid article {
		border: 1px solid #c7cec7;
		background: #fbfcf8;
	}

	.setup-panel {
		padding: 1.25rem;
	}

	.panel-heading {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
	}

	.panel-heading.compact {
		padding: 1.1rem 1.25rem;
		border-bottom: 1px solid #d6dcd5;
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

	.setup-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(13rem, 0.55fr) minmax(13rem, 0.55fr);
		gap: 1rem;
		margin: 1.35rem 0 0 3.2rem;
	}

	.control-group {
		display: grid;
		align-content: start;
		gap: 0.55rem;
		padding-right: 1rem;
		border-right: 1px solid #d6dcd5;
	}

	.control-group:last-child {
		padding-right: 0;
		border-right: 0;
	}

	.control-label {
		margin: 0 0 0.15rem;
		color: #0c6a3b;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.62rem;
		font-weight: 780;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.control-group form,
	.file-control {
		display: grid;
		gap: 0.35rem;
	}

	.control-group label,
	.file-control > span {
		color: #536059;
		font-size: 0.7rem;
		font-weight: 700;
	}

	.input-action {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
	}

	input {
		min-width: 0;
		min-height: 2.65rem;
		padding: 0.6rem 0.7rem;
		border: 1px solid #b8c0b8;
		border-radius: 0;
		background: white;
		color: inherit;
	}

	.input-action button {
		min-height: 2.65rem;
		padding: 0 0.85rem;
		border: 1px solid #0c4e2f;
		background: #0c4e2f;
		color: white;
		font-size: 0.72rem;
		font-weight: 720;
		cursor: pointer;
	}

	.control-group [role='status'],
	.control-group > p:last-child,
	.schema-hint {
		margin: 0;
		color: #5f6b64;
		font-size: 0.68rem;
		line-height: 1.45;
	}

	.error {
		margin: 1rem 0 0 3.2rem;
		color: #9f2626;
		font-size: 0.75rem;
	}

	.content-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(19rem, 24rem);
		align-items: start;
		gap: 1rem;
		margin-top: 1rem;
	}

	.filler-panel {
		min-width: 0;
	}

	.validation-strip {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.75rem 1.25rem;
		border-bottom: 1px solid #d6dcd5;
		background: #f2f7f0;
	}

	.validation-strip span {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		background: #43a968;
	}

	.validation-strip p {
		margin: 0;
		color: #46604f;
		font-size: 0.72rem;
	}

	.component-frame {
		--bionic-sign-accent: #0c6a3b;
		--bionic-sign-focus-ring: #0c6a3b;
		--bionic-sign-focus: #0c6a3b;
		padding: 1rem;
	}

	.loading {
		margin: 0;
		padding: 3rem;
		color: #66736b;
		text-align: center;
	}

	.output-column {
		display: grid;
		gap: 1rem;
	}

	.output-column section {
		padding: 1.1rem;
	}

	.output-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.output-heading > span {
		padding: 0.35rem 0.5rem;
		border-radius: 999px;
		background: #e4ece4;
		color: #346044;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.6rem;
	}

	.json-output {
		display: block;
		width: 100%;
		height: 35rem;
		max-height: 35rem;
		margin: 1rem 0;
		padding: 1rem;
		overflow: auto;
		border: 1px solid #cbd5cc;
		border-radius: 0;
		background: #101b15;
		color: #c7fbd2;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.68rem;
		line-height: 1.55;
		resize: vertical;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.microcopy {
		margin: 0;
		color: #5f6b64;
		font-size: 0.68rem;
		line-height: 1.5;
	}

	.diagnostics ul {
		margin: 0.75rem 0 0;
		padding-left: 1.1rem;
		color: #7a642c;
		font-size: 0.72rem;
	}

	.trust-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-top: 1rem;
	}

	.trust-grid article {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 1rem;
		padding: 1.25rem;
	}

	.trust-grid article > span {
		color: #0c6a3b;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.65rem;
	}

	.trust-grid h2 {
		font-size: 0.88rem;
	}

	.trust-grid p {
		margin: 0.35rem 0 0;
		color: #5f6b64;
		font-size: 0.72rem;
		line-height: 1.5;
	}

	:global(a:focus-visible),
	button:focus-visible,
	input:focus-visible,
	.json-output:focus-visible {
		outline: 3px solid #168a4e;
		outline-offset: 3px;
	}

	@media (max-width: 76rem) {
		.setup-grid {
			grid-template-columns: 1fr 1fr;
		}

		.control-group:nth-child(2) {
			padding-right: 0;
			border-right: 0;
		}

		.prefill-control {
			grid-column: 1 / -1;
			padding-top: 1rem;
			border-top: 1px solid #d6dcd5;
		}

		.content-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 760px) {
		main {
			width: min(100% - 1rem, 94rem);
			padding-top: 2.5rem;
		}

		.intro,
		.setup-grid,
		.trust-grid {
			grid-template-columns: 1fr;
		}

		.intro {
			align-items: start;
		}

		.setup-grid,
		.error {
			margin-left: 0;
		}

		.control-group {
			padding: 0 0 1rem;
			border-right: 0;
			border-bottom: 1px solid #d6dcd5;
		}

		.control-group:last-child {
			border-bottom: 0;
		}

		.prefill-control {
			grid-column: auto;
			border-top: 0;
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
