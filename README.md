# Bionic Sign

Bionic Sign is a backend-agnostic Svelte 5 library for placing text and signature fields over an existing PDF, collecting values, and exporting a new flattened PDF. It provides a form designer, a form filler, and a standalone signature pad. PDF processing happens in the browser; storage, authentication, delivery, and audit trails remain the host application's responsibility.

> [!WARNING]
> Bionic Sign creates a visual electronic mark by drawing text and signature images into a PDF. It does **not** create a cryptographic or certificate-backed digital signature, verify a signer's identity, provide an audit trail, or make legal-validity guarantees. Obtain legal and security advice appropriate to your use case.

## Install

```sh
npm install bionic-sign
```

Import the packaged theme once, then place components inside the `.bionic-sign` scope:

```svelte
<script lang="ts">
	import 'bionic-sign/styles.css';
	import { PdfFormFiller } from 'bionic-sign';
</script>

<div class="bionic-sign">
	<PdfFormFiller {source} {definition} />
</div>
```

Bionic Sign requires Svelte 5. PDF.js, pdf-lib, and signature_pad are included as runtime dependencies.

## PDF sources

Every PDF component accepts a URL, `Uint8Array`, or `ArrayBuffer` through `source`.

For a URL, pass normal fetch options with `requestInit`. This is useful when the host serves protected PDFs:

```svelte
<PdfFormFiller
	source="/api/documents/permission-form.pdf"
	requestInit={{
		credentials: 'include',
		headers: { Authorization: `Bearer ${accessToken}` }
	}}
	{definition}
/>
```

For locally selected or previously downloaded bytes, no fetch is performed:

```svelte
<script lang="ts">
	import { PdfFormDesigner, type PdfSource } from 'bionic-sign';

	let source = $state<PdfSource>();

	async function choosePdf(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (file) source = new Uint8Array(await file.arrayBuffer());
	}
</script>

<input type="file" accept="application/pdf" onchange={choosePdf} />
{#if source}
	<PdfFormDesigner {source} {definition} />
{/if}
```

Byte sources are copied before use. Passing `requestInit` with a byte source has no effect. An active load or export is cancelled when its inputs change.

## Design a form

`PdfFormDesigner` keeps the PDF separate from its JSON-safe field definition. `ondefinitionchange` receives an immutable snapshot whenever the user adds, moves, resizes, renames, configures, or deletes a field.

```svelte
<script lang="ts">
	import { PdfFormDesigner, type FormDefinition, type PdfFormDesignerHandle } from 'bionic-sign';

	let designer: PdfFormDesignerHandle;
	let definition = $state<FormDefinition>({ version: 1, fields: [] });
	let message = $state('');

	function saveDefinition(next: FormDefinition) {
		definition = next;
		localStorage.setItem('permission-form', JSON.stringify(next));
	}

	function reportError(reason: unknown) {
		message = reason instanceof Error ? reason.message : 'Unable to load the PDF';
	}
</script>

<div class="bionic-sign">
	<PdfFormDesigner
		bind:this={designer}
		source="/forms/permission.pdf"
		{definition}
		ondefinitionchange={saveDefinition}
		onerror={reportError}
	/>
</div>

<button disabled={!designer} onclick={() => console.log(designer.validate())}>
	Validate definition
</button>
{#if message}<p role="alert">{message}</p>{/if}
```

Designer props and methods:

| API                  | Type                       | Purpose                                   |
| -------------------- | -------------------------- | ----------------------------------------- |
| `source`             | `PdfSource`                | PDF URL or bytes.                         |
| `definition`         | `FormDefinition`           | Current version-1 field schema.           |
| `requestInit`        | `RequestInit`              | Optional fetch options for URL sources.   |
| `ondefinitionchange` | `(definition) => void`     | Receives a cloned definition after edits. |
| `onerror`            | `(error: unknown) => void` | Reports PDF load or render failures.      |
| `validate()`         | `() => ValidationResult`   | Validates the current edited definition.  |

The designer also accepts `toolbar`, `loading`, and `error` snippets. The error snippet receives the caught value:

```svelte
{#snippet toolbar()}
	<a href="/help/forms">Field guide</a>
{/snippet}

{#snippet loading()}
	<p role="status">Opening the form…</p>
{/snippet}

{#snippet error(reason: unknown)}
	<p role="alert">Could not open this PDF: {String(reason)}</p>
{/snippet}

<PdfFormDesigner {source} {definition} {toolbar} {loading} {error} />
```

## Fill and submit a form

Text prefills are matched by field name, remain editable, and never apply to signature fields. Unknown names and signature-prefill attempts call `ondiagnostic` and do not stop the form.

```svelte
<script lang="ts">
	import {
		PdfFormFiller,
		type BionicSignDiagnostic,
		type FormSubmission,
		type PdfFormFillerHandle,
		type ValidationResult
	} from 'bionic-sign';

	let filler: PdfFormFillerHandle;

	async function handleSubmit(submission: FormSubmission) {
		await uploadSubmission(submission);
	}

	function handleValidation(result: ValidationResult) {
		if (!result.valid) console.warn(result.issues);
	}

	function handleDiagnostic(diagnostic: BionicSignDiagnostic) {
		console.info(diagnostic.code, diagnostic.message);
	}
</script>

<div class="bionic-sign">
	<PdfFormFiller
		bind:this={filler}
		source="/forms/permission.pdf"
		{definition}
		prefill={{ student_name: 'Jordan Lee' }}
		onsubmit={handleSubmit}
		onvalidation={handleValidation}
		ondiagnostic={handleDiagnostic}
		onerror={(reason) => console.error(reason)}
	/>
</div>
```

Filler props and methods:

| API            | Type                            | Purpose                                                         |
| -------------- | ------------------------------- | --------------------------------------------------------------- |
| `source`       | `PdfSource`                     | PDF URL or bytes.                                               |
| `definition`   | `FormDefinition`                | Validated form schema.                                          |
| `prefill`      | `Record<string, string>`        | Optional editable text values keyed by field name.              |
| `requestInit`  | `RequestInit`                   | Optional fetch options for URL sources.                         |
| `onsubmit`     | `(submission) => void`          | Receives values and flattened bytes after the UI submit action. |
| `onvalidation` | `(result) => void`              | Receives each validation result.                                |
| `ondiagnostic` | `(diagnostic) => void`          | Reports ignored, non-fatal prefill entries.                     |
| `onerror`      | `(error: unknown) => void`      | Reports load, render, and export failures.                      |
| `validate()`   | `() => ValidationResult`        | Checks required fields without exporting.                       |
| `exportPdf()`  | `() => Promise<Uint8Array>`     | Validates and returns flattened bytes.                          |
| `submit()`     | `() => Promise<FormSubmission>` | Validates and returns values plus flattened bytes.              |

Calling `submit()` returns the submission and invokes `onsubmit`, just like the component's submit-button flow. Calling `exportPdf()` or `submit()` rejects with `BionicSignError` code `form-validation` while required fields are incomplete.

## Schema and submission data

Definitions use one-based page numbers and normalized, top-left-origin rectangles. `x`, `y`, `width`, and `height` are proportions from `0` to `1`; every rectangle must stay inside its page. Field names start with a letter, contain only letters, numbers, underscores, or hyphens, and are unique.

```ts
const definition: FormDefinition = {
	version: 1,
	fields: [
		{
			id: 'student-id',
			name: 'student_name',
			type: 'text',
			page: 1,
			rect: { x: 0.12, y: 0.2, width: 0.36, height: 0.06 },
			required: true
		},
		{
			id: 'guardian-signature-id',
			name: 'guardian_signature',
			type: 'signature',
			page: 2,
			rect: { x: 0.12, y: 0.72, width: 0.4, height: 0.1 },
			required: true
		}
	]
};
```

A successful submission has this shape:

```ts
interface FormSubmission {
	values: Record<string, TextValue | SignatureValue>;
	pdf: Uint8Array;
}

type TextValue = { type: 'text'; value: string };
type SignatureValue = { type: 'signature'; image: string }; // PNG data URL
```

The returned PDF is a new byte array with completed values visually flattened into the document. The source bytes and definition are not mutated.

Schema helpers are available from the package root:

```ts
import { applyTextPrefill, cloneDefinition, nextFieldName, validateDefinition } from 'bionic-sign';

const parsed = validateDefinition(JSON.parse(savedJson));
const copy = cloneDefinition(parsed);
const nextName = nextFieldName('signature', parsed.fields);
const { values, diagnostics } = applyTextPrefill(parsed, { student_name: 'Jordan Lee' });
```

For lower-level workflows, `exportFlattenedPdf(sourceBytes, definition, values, { signal })` is also exported. It does not load URLs; pass a `Uint8Array` and handle required-value validation in the host.

## Standalone signature pad

`SignaturePad` accepts `value?: SignatureValue`, `onchange`, and `onemptychange`. Bind the component to call `clear()` or `toValue()`. The canvas supports pointer, touch, and stylus input; handwriting itself has no keyboard equivalent.

```svelte
<SignaturePad
	bind:this={pad}
	{value}
	onchange={(next) => (value = next)}
	onemptychange={(empty) => console.log({ empty })}
/>
```

## Host-managed persistence and upload

Bionic Sign contains no backend and never uploads automatically. A host can send the structured values and flattened PDF to its own authenticated endpoint:

```ts
async function uploadSubmission({ values, pdf }: FormSubmission) {
	const body = new FormData();
	body.set('values', JSON.stringify(values));
	body.set('pdf', new Blob([pdf.slice().buffer], { type: 'application/pdf' }), 'signed.pdf');

	const response = await fetch('/api/submissions', {
		method: 'POST',
		credentials: 'include',
		body
	});

	if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
}
```

Keep authorization, access control, retention, malware scanning, consent records, and audit events on that backend. Do not place long-lived secrets in browser-side `requestInit` values.

## Theming

Import `bionic-sign/styles.css`, wrap the relevant UI in `.bionic-sign`, and override custom properties on that scope or an ancestor. All selectors in the packaged stylesheet stay below `.bionic-sign`; it does not reset document-wide styles or remove focus outlines.

```css
.contract-signing {
	--bionic-sign-surface: #fffdf7;
	--bionic-sign-text: #241c15;
	--bionic-sign-accent: #7c3aed;
	--bionic-sign-focus-ring: #6d28d9;
	--bionic-sign-spacing: 1rem;
	--bionic-sign-radius: 0.5rem;
}
```

```svelte
<div class="bionic-sign contract-signing">
	<PdfFormFiller {source} {definition} />
</div>
```

| Token                      | Default   | Use                           |
| -------------------------- | --------- | ----------------------------- |
| `--bionic-sign-surface`    | `#ffffff` | Panels and primary surfaces   |
| `--bionic-sign-text`       | `#0f172a` | Primary text                  |
| `--bionic-sign-muted-text` | `#475569` | Secondary and status text     |
| `--bionic-sign-border`     | `#cbd5e1` | Neutral borders               |
| `--bionic-sign-accent`     | `#2563eb` | Actions and selected fields   |
| `--bionic-sign-required`   | `#b45309` | Required state                |
| `--bionic-sign-completed`  | `#15803d` | Completed state               |
| `--bionic-sign-invalid`    | `#b91c1c` | Invalid and destructive state |
| `--bionic-sign-focus-ring` | `#1d4ed8` | Visible keyboard focus        |
| `--bionic-sign-spacing`    | `0.75rem` | Base spacing                  |
| `--bionic-sign-radius`     | `0.75rem` | Surface corner radius         |

The compatibility aliases `--bionic-sign-panel`, `--bionic-sign-danger`, `--bionic-sign-focus`, `--bionic-sign-field-border`, and `--bionic-sign-field-selected` are also available for fine-grained component overrides.

## Errors, encrypted PDFs, and browser support

URL failures use stable `BionicSignError` codes such as `pdf-load-http` and `pdf-load-network`. Validation results are ordinary data; operational failures are reported through `onerror` and rejected imperative calls. Inspect `error instanceof BionicSignError` and `error.code` when the host needs branch-specific handling.

Password-protected, encrypted, or permission-restricted PDFs are not supported in version 1. Bionic Sign has no password prompt or password prop. PDF.js or pdf-lib will reject such a document; the component displays its recoverable error state and calls `onerror`, while imperative export rejects. Decrypt the PDF in an authorized backend before sending it to the browser.

Bionic Sign targets current evergreen Chrome, Edge, Firefox, and Safari, including iOS Safari. It relies on modern browser APIs including canvas, `ResizeObserver`, dynamic modules, `fetch`, and typed arrays. Rendering components are browser-only, but importing the package root is safe during SvelteKit server-side rendering because PDF.js and signature_pad initialize only after browser activation. Obsolete browsers are not supported.

## Scope

Version 1 supports single-line text fields and independently captured signature fields. It does not import or preserve AcroForm controls, create certificate-backed signatures, verify identity, store files, authenticate users, send email, or provide an audit trail. Downloading, persistence, and submission delivery are deliberately host-managed.
