# Bionic Sign PDF Signature Library Design

## Summary

Bionic Sign will be a backend-agnostic Svelte 5 library for defining and completing overlay forms on existing PDF documents. An administrator can place uniquely named text and signature fields on a PDF. A signer can complete the required fields, with optional host-provided text prefills, and receive a flattened PDF in which the entered text and drawn signatures are permanently rendered.

Version 1 supports zero or more single-line text fields and zero or more signature fields. It does not import AcroForm fields, provide cryptographic PDF signatures, store documents, authenticate users, create audit trails, or communicate with a backend.

## Goals

- Provide polished, themeable Svelte components for both form-design and form-filling workflows.
- Accept PDF sources as a URL, `Uint8Array`, or `ArrayBuffer`.
- Keep reusable form definitions separate from source PDF files.
- Let host applications prefill text fields by their unique names.
- Validate required fields and capture every signature independently.
- Return structured values and a newly flattened PDF without modifying the source bytes.
- Remain safe to import during SvelteKit server-side rendering while activating PDF functionality only in the browser.
- Work in current evergreen Chrome, Edge, Firefox, and Safari, including iOS Safari.

## Non-goals

- Backend storage, uploads, authentication, authorization, or email delivery.
- AcroForm discovery, import, editing, or export.
- Certificate-backed or cryptographic digital signatures.
- Identity verification, signer audit trails, or legal-signature guarantees.
- Multiline text, locked prefills, checkboxes, dates, initials, or other field types in version 1.
- Reusing one captured signature across multiple signature fields.
- Supporting obsolete browsers.

## Technical approach

Use the PDF.js display layer directly for browser rendering, page geometry, and URL/byte loading. Do not embed the full PDF.js viewer UI. Render each page to a canvas and place a separate HTML field layer above it.

Use `signature_pad` behind an accessible Svelte wrapper for touch, stylus, and mouse signature capture. Each signature field owns an independent capture result.

Use pdf-lib to load a copy of the source bytes and draw completed text and PNG signature images into the corresponding PDF page rectangles. The output is a flattened `Uint8Array` that can be viewed or printed without Bionic Sign or interactive-form support.

LeedPDF may inform interaction design, but its application-oriented architecture, annotation focus, and AGPL-3.0 license make it unsuitable as a dependency or code foundation for this reusable library.

## Architecture

### Primary components

`PdfFormDesigner` loads a PDF and allows an administrator to create, name, select, move, resize, configure, and delete fields. It emits a serializable form definition whenever the definition changes.

`PdfFormFiller` loads a PDF and form definition, applies optional text prefills, collects values, validates required fields, and emits a structured submission containing values and flattened PDF bytes.

### Supporting modules

- `PdfViewer`: PDF.js loading, worker setup, rendering, page sizing, zoom, rotation-aware geometry, and load cancellation.
- `SignaturePad`: accessible Svelte wrapper around `signature_pad`, including clear, cancel, and apply operations.
- Schema utilities: definition parsing, version validation, field-name validation, uniqueness enforcement, and future migration boundaries.
- Coordinate utilities: conversion among normalized overlay, screen, and PDF coordinate spaces.
- PDF exporter: a DOM-independent TypeScript module that uses pdf-lib to render completed field values into PDF bytes.

These modules communicate through typed public interfaces. Rendering, form state, validation, signature capture, and export remain independently testable.

## Public data model

```ts
type PdfSource = string | Uint8Array | ArrayBuffer;

interface FormDefinition {
	version: 1;
	fields: FormField[];
}

interface FieldRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface BaseField {
	id: string;
	name: string;
	page: number;
	rect: FieldRect;
	required: boolean;
}

interface TextField extends BaseField {
	type: 'text';
}

interface SignatureField extends BaseField {
	type: 'signature';
}

type FormField = TextField | SignatureField;
```

Field names are unique, non-empty host-facing keys. Field IDs are immutable internal identities, allowing a field to be renamed without losing selection or value associations. New fields default to required and receive a generated unique name.

Page numbers are one-based. Rectangles use normalized page-relative coordinates between zero and one, with a top-left origin. Normalized storage keeps placement stable across page sizes, zoom levels, device pixel ratios, and responsive layouts. Coordinate utilities perform the bottom-left-origin conversion required for PDF export and account for page rotation.

The definition is JSON-safe and does not contain PDF bytes.

## Component API

Representative usage:

```svelte
<PdfFormDesigner
	source={pdfSource}
	definition={initialDefinition}
	ondefinitionchange={handleDefinitionChange}
/>

<PdfFormFiller
	source={pdfSource}
	definition={definition}
	prefill={{ student_name: 'Jordan Lee' }}
	onsubmit={handleSubmit}
/>
```

Both components accept an optional `requestInit: RequestInit` prop so URL sources can use host-supplied headers, credentials, and other fetch options. Byte sources ignore this prop and bypass fetching. `PdfFormDesigner` exposes `ondefinitionchange` and `onerror` callbacks. `PdfFormFiller` exposes `onsubmit`, `onvalidation`, `ondiagnostic`, and `onerror` callbacks. Callback payloads are exported TypeScript types; component callbacks never dispatch DOM `CustomEvent` objects.

Components will expose imperative `validate()`, `exportPdf()`, and `submit()` methods where the operation applies. Imperative methods and UI actions will use the same internal command path so behavior does not diverge.

## Submission contract

```ts
interface FormSubmission {
	values: Record<string, TextValue | SignatureValue>;
	pdf: Uint8Array;
}

type TextValue = {
	type: 'text';
	value: string;
};

type SignatureValue = {
	type: 'signature';
	image: string;
};
```

Signature images are PNG data URLs so the structured result remains JSON-serializable. `FormSubmission.pdf` contains every completed value visually burned into its configured rectangle. It is a new document; the original PDF bytes remain unchanged.

Flattening is visual, not cryptographic. The library must state this distinction in its README and API documentation.

## Designer workflow

The desktop designer uses three panes: a field palette and page navigation on the left, the PDF canvas and overlays in the center, and selected-field properties on the right. On narrow screens, the side panes become drawers while the document stays central.

An administrator selects a page and adds a text or signature field. The new field receives a generated unique name, defaults to required, and becomes selected. It can be dragged and resized within page bounds. The properties pane supports renaming, toggling required state, editing exact position and size, and deletion.

Duplicate, empty, or invalid names are rejected inline and prevent exporting an invalid definition. Keyboard operations support selection, movement, resizing, and deletion. Page changes and zooming do not alter stored normalized coordinates.

## Signer workflow

The signer view keeps the PDF central and displays a compact progress rail containing completed and remaining required fields. Selecting a text field activates a single-line inline input. Selecting a signature field opens a focused dialog with clear, cancel, and apply controls.

Every signature field is drawn independently; a captured signature is never silently reused. Completed fields remain editable until submission.

Text prefills are matched by field name after the definition is validated. Prefilled values remain editable. Unknown prefill keys and attempts to prefill signature fields are reported through a typed non-fatal diagnostic callback and ignored.

Submission follows this sequence:

1. Validate the definition and required values.
2. Load or reuse the original PDF bytes.
3. Convert normalized field rectangles to PDF coordinates.
4. Draw text and signature PNGs into their pages using pdf-lib.
5. Return the flattened bytes and structured values.

Downloading, uploading, and persistence remain host responsibilities.

## Error handling

Loading and export operations expose busy states and support cancellation when the active source or operation changes. Entered values are preserved after recoverable export errors.

The library reports typed errors for malformed or unsupported definitions, duplicate names, invalid rectangles, URL failures, PDF parsing failures, encrypted or permission-restricted PDFs, rendering failures, and export failures. Component-level load failures present a recoverable state instead of partially interactive content.

Unknown prefill names and prefill type mismatches are non-fatal diagnostics. Missing required values are validation results tied to their fields and focus the first invalid field when submission is initiated through the UI.

## Styling and extension points

Components ship with polished scoped default styles. Documented CSS custom properties control colors, spacing, borders, focus rings, and field states without requiring consumers to replace the UI.

Targeted Svelte snippets allow replacement of high-value regions such as toolbar actions, empty/loading states, and submission controls. Version 1 does not expose a second headless component system.

## Accessibility

- All controls have accessible names and logical native tab order.
- Field states use text or icons in addition to color.
- Focus remains visible at high contrast.
- Admins can select, move, resize, and delete fields using a keyboard.
- Exact numeric position and size controls provide a non-drag alternative.
- Page navigation and validation changes are announced appropriately.
- Text overlays have programmatic labels derived from field names.
- The signature dialog exposes clear, cancel, and apply actions and announces empty/complete state.
- Drawing a handwritten signature requires pointer, touch, or stylus input; the library documents this inherent limitation rather than claiming full keyboard equivalence for handwriting.

## Demo site

The SvelteKit demo site includes:

- An admin designer route with URL loading, file upload, field placement, live schema inspection, and schema download.
- A signer route that loads a definition, demonstrates text prefills, validates progress, and downloads the flattened result.
- A representative multipage field-trip permission-form fixture.
- Copyable usage examples for the main component APIs and host-managed persistence.
- Clear wording that the captured image is an electronic mark, not a certificate-backed digital signature.

The demo has no backend and keeps processing local to the browser.

## Testing strategy

Pure Vitest tests cover schema parsing, version checks, name uniqueness, required-value validation, prefill diagnostics, normalized coordinate conversion, rotated pages, and PDF export helpers.

Playwright-backed Vitest browser component tests cover:

- URL and byte-source loading, cancellation, and recoverable failures.
- Designer field creation, selection, rename, drag, resize, exact numeric editing, keyboard movement, and deletion.
- Independent signature capture and required-field progress.
- Responsive panel behavior and essential keyboard/focus flows.
- SSR-safe package imports that do not access DOM globals during module evaluation.

Export integration tests create a result, reopen it, and inspect its page content/resources to confirm that text and signature images were embedded in the expected pages. End-to-end demo tests exercise uploading a PDF, placing uniquely named fields, exporting and reloading the schema, applying a student-name prefill, completing every field, and downloading a flattened PDF.

Package verification includes Svelte checks, TypeScript declarations, unit and browser tests, linting, formatting, the package build, and `publint`. Manual acceptance covers touch and stylus drawing, mobile layout, keyboard-only designer use, zoom alignment, rotated pages, and output in major PDF viewers.

## Acceptance criteria

- A host can render either component from URL or byte-array PDF input.
- An admin can create zero or more uniquely named text and signature fields on any page and serialize the resulting definition as JSON.
- Field placement remains aligned after zooming and responsive resizing.
- A host can prefill editable text values by field name; signatures cannot be prefilled.
- A signer must complete every required field before successful submission.
- Multiple signature fields require independent captures.
- Submission returns typed structured values and a flattened PDF containing the visible text and signatures.
- The source PDF and form definition are not mutated.
- The package imports safely in SvelteKit SSR and operates in supported evergreen desktop and mobile browsers.
- Consumers can theme the shipped UI without rebuilding it.
- The demo proves both workflows without a backend.
