# Bionic Sign PDF Signature Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a backend-agnostic Svelte 5 library and demo for designing overlay PDF forms, filling text and independent signature fields, and exporting flattened PDFs.

**Architecture:** PDF.js renders browser pages beneath normalized HTML overlays; focused Svelte components own designer and filler workflows. Pure TypeScript modules validate schemas, transform coordinates, and use pdf-lib to burn completed text and PNG signatures into copied PDF bytes.

**Tech Stack:** Svelte 5, SvelteKit, TypeScript, PDF.js (`pdfjs-dist`), pdf-lib, signature_pad, Vitest browser mode, Playwright, ESLint, Prettier, publint.

**Spec:** `docs/superpowers/specs/2026-08-20-pdf-signature-library-design.md`

## Global Constraints

- Support Svelte `^5.0.0` and current evergreen Chrome, Edge, Firefox, Safari, and iOS Safari.
- Accept PDF sources as `string | Uint8Array | ArrayBuffer`; URL loading accepts `RequestInit`.
- Store PDF files separately from JSON-safe version-1 form definitions.
- Version 1 field types are single-line text and independently captured signatures only.
- Every field has an immutable ID, a unique non-empty name, a one-based page number, a normalized top-left-origin rectangle, and `required` defaulting to `true`.
- Only text fields can be prefilled; prefills remain editable.
- Submission returns structured values and a new flattened `Uint8Array`; source bytes and definitions are never mutated.
- Visual flattening is not cryptographic signing, identity verification, or an audit trail.
- Components must be safe to import during SvelteKit SSR and activate PDF/DOM dependencies only in the browser.
- No backend, persistence, authentication, uploads, email, AcroForm import, or headless duplicate component API.
- Before writing or changing Svelte code, use the configured Svelte documentation tools (`list-sections`, then every relevant `get-documentation` section); run `svelte-autofixer` on every changed Svelte component until it returns no issues or suggestions.
- Implement every behavior test-first and commit after each task passes its focused verification.

## File map

- `src/lib/types.ts`: public source, schema, value, diagnostic, error, and component-handle types.
- `src/lib/schema.ts`: definition validation, unique-name generation, immutable cloning, and text-prefill application.
- `src/lib/coordinates.ts`: normalized, viewport, rotated-page, and PDF-coordinate transformations.
- `src/lib/pdf/source.ts`: URL/byte loading, immutable byte copies, cancellation, and typed load failures.
- `src/lib/pdf/runtime.ts`: browser-only PDF.js worker/runtime initialization.
- `src/lib/pdf/export.ts`: pdf-lib flattening of text and signature values.
- `src/lib/components/PdfPage.svelte`: one rendered PDF page and its overlay slot.
- `src/lib/components/PdfViewer.svelte`: multipage rendering, zoom, loading, and failure UI.
- `src/lib/components/SignaturePad.svelte`: accessible signature_pad wrapper.
- `src/lib/designer/state.ts`: pure designer commands and constraints.
- `src/lib/components/FieldOverlay.svelte`: selectable, draggable, resizable field rectangle.
- `src/lib/components/PdfFormDesigner.svelte`: three-pane designer composition and public API.
- `src/lib/filler/state.ts`: pure value, prefill, progress, and validation state.
- `src/lib/components/SignatureDialog.svelte`: focused capture dialog.
- `src/lib/components/PdfFormFiller.svelte`: signer composition and submission API.
- `src/lib/styles.css`: documented theme custom properties and shared component states.
- `src/lib/index.ts`: public exports only.
- `src/routes/+page.svelte`: demo landing page.
- `src/routes/designer/+page.svelte`: admin demo.
- `src/routes/filler/+page.svelte`: signer demo.
- `static/demo/field-trip-permission.pdf`: multipage demo fixture.
- `static/demo/field-trip-permission.schema.json`: demo definition.
- `README.md`: install, usage, API, theming, limitations, and backend integration guidance.

---

### Task 1: Public types and versioned schema validation

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/schema.ts`
- Test: `src/lib/schema.spec.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `PdfSource`, `PdfLoadOptions`, `ExportPdfOptions`, `FieldRect`, `TextField`, `SignatureField`, `FormField`, `FormDefinition`, `TextValue`, `SignatureValue`, `FormValues`, `FormSubmission`, `ValidationIssue`, `ValidationResult`, `PdfFormDesignerHandle`, `PdfFormFillerHandle`, `BionicSignError`, `BionicSignDiagnostic`.
- Produces: `validateDefinition(input: unknown): FormDefinition`, `nextFieldName(type, fields): string`, `cloneDefinition(definition): FormDefinition`, and `applyTextPrefill(definition, prefill): PrefillResult`.

- [ ] **Step 1: Add runtime dependencies**

Run: `npm install pdfjs-dist pdf-lib signature_pad`

Expected: `package.json` contains the three packages under `dependencies`, not `devDependencies`, and the lockfile updates.

- [ ] **Step 2: Write failing schema tests**

Create `src/lib/schema.spec.ts` with cases that accept an empty version-1 definition, reject duplicate/empty names, reject rectangles outside `0..1`, reject pages below 1, preserve input immutability, generate `text_1`/`signature_1`, apply only text prefills, and emit diagnostics for unknown or signature keys.

```ts
import { describe, expect, it } from 'vitest';
import { applyTextPrefill, nextFieldName, validateDefinition } from './schema';

it('rejects duplicate field names', () => {
	expect(() => validateDefinition({
		version: 1,
		fields: [field('a', 'student'), field('b', 'student')]
	})).toThrow(/unique/i);
});

it('prefills text and diagnoses signature prefills', () => {
	const result = applyTextPrefill(definitionWithTextAndSignature(), {
		student_name: 'Jordan Lee',
		parent_signature: 'ignored'
	});
	expect(result.values.student_name).toEqual({ type: 'text', value: 'Jordan Lee' });
	expect(result.diagnostics[0].code).toBe('invalid-prefill-type');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:unit -- --run src/lib/schema.spec.ts`

Expected: FAIL because `./schema` and its exports do not exist.

- [ ] **Step 4: Implement the public types and minimal validators**

Use discriminated unions exactly as specified. `validateDefinition` must build and return new objects rather than cast or mutate input. Use a field-name pattern of `/^[A-Za-z][A-Za-z0-9_-]*$/` and require every rectangle dimension to be positive while all edges remain within the normalized page.

```ts
export type FormField = TextField | SignatureField;
export interface FormDefinition { version: 1; fields: FormField[] }
export type FormValues = Record<string, TextValue | SignatureValue>;
export interface ValidationIssue {
	code: string;
	message: string;
	fieldName?: string;
}
export interface ValidationResult {
	valid: boolean;
	issues: ValidationIssue[];
}
export interface PdfLoadOptions { requestInit?: RequestInit; signal?: AbortSignal }
export interface ExportPdfOptions { signal?: AbortSignal }
export interface PdfFormDesignerHandle { validate(): ValidationResult }
export interface PdfFormFillerHandle {
	validate(): ValidationResult;
	exportPdf(): Promise<Uint8Array>;
	submit(): Promise<FormSubmission>;
}
export interface PrefillResult {
	values: Record<string, TextValue>;
	diagnostics: BionicSignDiagnostic[];
}
```

- [ ] **Step 5: Run focused verification**

Run: `npm run test:unit -- --run src/lib/schema.spec.ts && npm run check`

Expected: schema tests PASS and Svelte/TypeScript check exits 0.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/types.ts src/lib/schema.ts src/lib/schema.spec.ts
git commit -m "feat: add form schema and public types"
```

### Task 2: Coordinate transformations

**Files:**
- Create: `src/lib/coordinates.ts`
- Test: `src/lib/coordinates.spec.ts`

**Interfaces:**
- Consumes: `FieldRect` from `src/lib/types.ts`.
- Produces: `normalizedToViewport(rect, width, height): PixelRect`, `viewportToNormalized(rect, width, height): FieldRect`, and `normalizedToPdf(rect, page): PdfRect`, where `page` contains `width`, `height`, and rotation `0 | 90 | 180 | 270`.

- [ ] **Step 1: Write failing round-trip and rotation tests**

Test A4 portrait, landscape, non-unit zoom dimensions, all four rotations, edge rectangles, and a round trip with tolerance `1e-8`.

```ts
it('converts top-left normalized coordinates to unrotated PDF coordinates', () => {
	expect(normalizedToPdf({ x: .1, y: .2, width: .3, height: .1 }, {
		width: 600, height: 800, rotation: 0
	})).toEqual({ x: 60, y: 560, width: 180, height: 80 });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test:unit -- --run src/lib/coordinates.spec.ts`

Expected: FAIL because `coordinates.ts` does not exist.

- [ ] **Step 3: Implement pure transformations**

Keep rotation handling in one exhaustive `switch`; throw for zero/negative viewport dimensions and unsupported rotation. Do not round stored values.

- [ ] **Step 4: Run focused verification**

Run: `npm run test:unit -- --run src/lib/coordinates.spec.ts`

Expected: all coordinate tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/coordinates.ts src/lib/coordinates.spec.ts
git commit -m "feat: add PDF coordinate transforms"
```

### Task 3: PDF source loading and browser runtime

**Files:**
- Create: `src/lib/pdf/source.ts`
- Create: `src/lib/pdf/source.spec.ts`
- Create: `src/lib/pdf/runtime.ts`
- Create: `src/lib/pdf/runtime.spec.ts`

**Interfaces:**
- Consumes: `PdfSource`, `BionicSignError`.
- Produces: `loadPdfBytes(source: PdfSource, options?: PdfLoadOptions): Promise<Uint8Array>` and `getPdfJs(): Promise<typeof import('pdfjs-dist')>`.

- [ ] **Step 1: Write failing source-loader tests**

Stub `globalThis.fetch` and cover byte copies, `RequestInit` forwarding, non-OK responses, abort propagation, and network errors mapped to stable error codes.

```ts
it('copies byte sources instead of exposing caller memory', async () => {
	const source = new Uint8Array([1, 2, 3]);
	const loaded = await loadPdfBytes(source);
	loaded[0] = 9;
	expect(source[0]).toBe(1);
});
```

- [ ] **Step 2: Write an SSR import test for the runtime**

Import `runtime.ts` in the Node test project and assert that `window`, `DOMMatrix`, and worker globals are not touched until `getPdfJs()` is awaited in a browser.

- [ ] **Step 3: Run tests to verify failure**

Run: `npm run test:unit -- --run src/lib/pdf/source.spec.ts src/lib/pdf/runtime.spec.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement loading and lazy PDF.js initialization**

Use dynamic imports inside `getPdfJs()`. Configure the worker with a bundler-resolved URL in browser code, cache the initialization promise, and return typed failures without importing PDF.js at module scope.

- [ ] **Step 5: Run focused verification**

Run: `npm run test:unit -- --run src/lib/pdf/source.spec.ts src/lib/pdf/runtime.spec.ts && npm run check`

Expected: focused tests PASS and check exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf/source.ts src/lib/pdf/source.spec.ts src/lib/pdf/runtime.ts src/lib/pdf/runtime.spec.ts
git commit -m "feat: add SSR-safe PDF loading"
```

### Task 4: PDF page and viewer components

**Files:**
- Create: `src/lib/components/PdfPage.svelte`
- Test: `src/lib/components/PdfPage.svelte.spec.ts`
- Create: `src/lib/components/PdfViewer.svelte`
- Test: `src/lib/components/PdfViewer.svelte.spec.ts`

**Interfaces:**
- Consumes: `PdfSource`, `loadPdfBytes`, `getPdfJs`.
- Produces: a viewer that renders pages, exposes current page/zoom, and supplies an overlay snippet with page number and CSS-pixel dimensions.

- [ ] **Step 1: Consult required Svelte documentation**

Use `list-sections`, fetch all relevant Svelte 5 sections for `$props`, snippets, lifecycle cleanup, actions, bindings, and component testing, then record any API constraints in implementation notes.

- [ ] **Step 2: Write failing browser tests**

Mock the PDF runtime. Verify loading, one canvas per page, device-pixel-ratio backing size, zoom rerendering, overlay dimensions, cancellation on source replacement, loading UI, and recoverable error UI.

```ts
render(PdfViewer, { source: new Uint8Array([1]), zoom: 1.5 });
await expect.element(page.getByLabelText('PDF page 1')).toBeVisible();
expect(onoverlay).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npm run test:unit -- --run src/lib/components/PdfPage.svelte.spec.ts src/lib/components/PdfViewer.svelte.spec.ts`

Expected: FAIL because the components do not exist.

- [ ] **Step 4: Implement minimal page rendering and viewer orchestration**

Cancel active PDF.js render tasks during effect cleanup. Keep canvas backing pixels separate from CSS dimensions. Render accessible loading/error text and page labels. Do not add field behavior here.

- [ ] **Step 5: Run `svelte-autofixer` on both components until clean**

Expected: no remaining issues or suggestions.

- [ ] **Step 6: Run focused verification**

Run: `npm run test:unit -- --run src/lib/components/PdfPage.svelte.spec.ts src/lib/components/PdfViewer.svelte.spec.ts && npm run check`

Expected: component tests PASS and check exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/PdfPage.svelte src/lib/components/PdfPage.svelte.spec.ts src/lib/components/PdfViewer.svelte src/lib/components/PdfViewer.svelte.spec.ts
git commit -m "feat: add PDF viewer components"
```

### Task 5: Accessible signature capture

**Files:**
- Create: `src/lib/components/SignaturePad.svelte`
- Test: `src/lib/components/SignaturePad.svelte.spec.ts`

**Interfaces:**
- Produces: `SignaturePad` with `value?: SignatureValue`, `onchange`, `onemptychange`, `clear()`, and `toValue(): SignatureValue | undefined`.

- [ ] **Step 1: Write failing browser tests**

Mock `signature_pad`; verify lazy browser initialization, high-DPI sizing, clear behavior, empty announcements, PNG output, pointer-driven change callbacks, resize redraw, and listener cleanup.

- [ ] **Step 2: Run the test to verify failure**

Run: `npm run test:unit -- --run src/lib/components/SignaturePad.svelte.spec.ts`

Expected: FAIL because `SignaturePad.svelte` does not exist.

- [ ] **Step 3: Implement the wrapper**

Dynamically import `signature_pad` during browser lifecycle, scale backing pixels by device pixel ratio, preserve point data during resize, and expose native Clear control plus an `aria-live` empty/completed status.

- [ ] **Step 4: Run `svelte-autofixer` until clean and verify**

Run: `npm run test:unit -- --run src/lib/components/SignaturePad.svelte.spec.ts && npm run check`

Expected: autofixer reports no issues, tests PASS, and check exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/SignaturePad.svelte src/lib/components/SignaturePad.svelte.spec.ts
git commit -m "feat: add accessible signature capture"
```

### Task 6: Flattened PDF exporter

**Files:**
- Create: `src/lib/pdf/export.ts`
- Test: `src/lib/pdf/export.spec.ts`
- Create: `scripts/generate-permission-fixture.mjs`
- Create: `src/lib/template/fixtures/permission-form.pdf`

**Interfaces:**
- Consumes: `FormDefinition`, `FormValues`, `normalizedToPdf`.
- Produces: `exportFlattenedPdf(sourceBytes: Uint8Array, definition: FormDefinition, values: FormValues, options?: ExportPdfOptions): Promise<Uint8Array>`.

- [ ] **Step 1: Create a deterministic two-page PDF fixture**

Create `scripts/generate-permission-fixture.mjs` using `PDFDocument.create()`, `StandardFonts.Helvetica`, two US Letter pages, and fixed strings `FIELD TRIP PERMISSION FORM — PAGE 1` and `MEDICAL AND SIGNATURE DETAILS — PAGE 2`. Save to `src/lib/template/fixtures/permission-form.pdf`, then run `node scripts/generate-permission-fixture.mjs` twice and confirm `shasum -a 256` is unchanged.

- [ ] **Step 2: Write failing export tests**

Verify source immutability, text on the correct page, PNG embedding, independent signature images, omitted empty optional fields, required-value rejection, rotated-page placement, font-size fitting, and a parseable output.

```ts
const output = await exportFlattenedPdf(source, definition, values);
expect(output).not.toBe(source);
expect(await PDFDocument.load(output)).toBeDefined();
expect(source).toEqual(originalSourceCopy);
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npm run test:unit -- --run src/lib/pdf/export.spec.ts`

Expected: FAIL because `exportFlattenedPdf` does not exist.

- [ ] **Step 4: Implement minimal flattening**

Load a copied byte array, embed Helvetica once, decode each PNG data URL once, use coordinate utilities for placement, fit text down to a documented minimum of 8 PDF points, reject text that cannot fit at that size with an `export-value-overflow` error, and save to new bytes.

- [ ] **Step 5: Run focused verification**

Run: `npm run test:unit -- --run src/lib/pdf/export.spec.ts src/lib/coordinates.spec.ts`

Expected: exporter and coordinate tests PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-permission-fixture.mjs src/lib/pdf/export.ts src/lib/pdf/export.spec.ts src/lib/template/fixtures/permission-form.pdf
git commit -m "feat: export flattened signed PDFs"
```

### Task 7: Designer state and field overlay

**Files:**
- Create: `src/lib/designer/state.ts`
- Test: `src/lib/designer/state.spec.ts`
- Create: `src/lib/components/FieldOverlay.svelte`
- Test: `src/lib/components/FieldOverlay.svelte.spec.ts`

**Interfaces:**
- Consumes: schema and coordinate utilities.
- Produces: immutable commands `addField`, `renameField`, `updateFieldRect`, `toggleRequired`, `deleteField`; produces `FieldOverlay` callbacks using normalized rectangles.

- [ ] **Step 1: Write failing pure state tests**

Cover required defaults, generated unique names, immutable updates, duplicate rename rejection, page-bound clamping, minimum normalized field size, and deletion.

- [ ] **Step 2: Write failing overlay browser tests**

Test selection, pointer drag, corner resize, keyboard arrow movement, Shift+arrow resizing, bounds, Delete callback, focus visibility, and accessible labels.

- [ ] **Step 3: Run tests to verify failure**

Run: `npm run test:unit -- --run src/lib/designer/state.spec.ts src/lib/components/FieldOverlay.svelte.spec.ts`

Expected: FAIL because state and overlay modules do not exist.

- [ ] **Step 4: Implement pure commands and overlay interaction**

Use pointer capture for drag/resize and normalized deltas derived from the current overlay bounds. Keep all mutation in pure state commands; the component emits requested rectangles and never edits a field object in place.

- [ ] **Step 5: Run `svelte-autofixer` until clean and verify**

Run: `npm run test:unit -- --run src/lib/designer/state.spec.ts src/lib/components/FieldOverlay.svelte.spec.ts && npm run check`

Expected: autofixer has no issues, focused tests PASS, check exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/designer/state.ts src/lib/designer/state.spec.ts src/lib/components/FieldOverlay.svelte src/lib/components/FieldOverlay.svelte.spec.ts
git commit -m "feat: add designer field interactions"
```

### Task 8: Form designer composition

**Files:**
- Create: `src/lib/components/PdfFormDesigner.svelte`
- Test: `src/lib/components/PdfFormDesigner.svelte.spec.ts`

**Interfaces:**
- Consumes: `PdfViewer`, `FieldOverlay`, designer commands, `FormDefinition`.
- Produces: `PdfFormDesigner` props `source`, `definition`, `requestInit`, `ondefinitionchange`, `onerror`; handle `validate(): ValidationResult`.

- [ ] **Step 1: Write failing browser workflow tests**

Verify the three-pane composition, page selection, add text/signature, immediate selection, property edits, exact x/y/width/height controls, inline duplicate-name errors, delete, zoom stability, responsive drawer controls, and callback payload immutability.

- [ ] **Step 2: Run the test to verify failure**

Run: `npm run test:unit -- --run src/lib/components/PdfFormDesigner.svelte.spec.ts`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the minimal designer**

Compose existing units; keep source definition synchronized only through cloned state and callbacks. Use semantic buttons/forms, labels for exact geometry controls, and snippets named `toolbar`, `loading`, and `error` with documented default renderers.

- [ ] **Step 4: Run `svelte-autofixer` until clean and verify**

Run: `npm run test:unit -- --run src/lib/components/PdfFormDesigner.svelte.spec.ts && npm run check`

Expected: autofixer clean, workflow tests PASS, check exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/PdfFormDesigner.svelte src/lib/components/PdfFormDesigner.svelte.spec.ts
git commit -m "feat: add PDF form designer"
```

### Task 9: Filler state, signature dialog, and submission component

**Files:**
- Create: `src/lib/filler/state.ts`
- Test: `src/lib/filler/state.spec.ts`
- Create: `src/lib/components/SignatureDialog.svelte`
- Test: `src/lib/components/SignatureDialog.svelte.spec.ts`
- Create: `src/lib/components/PdfFormFiller.svelte`
- Test: `src/lib/components/PdfFormFiller.svelte.spec.ts`

**Interfaces:**
- Consumes: viewer, signature pad, schema/prefill utilities, exporter.
- Produces: immutable filler commands and `PdfFormFiller` props `source`, `definition`, `prefill`, `requestInit`, `onsubmit`, `onvalidation`, `ondiagnostic`, `onerror`; handle `validate()`, `exportPdf()`, `submit()`.

- [ ] **Step 1: Write failing filler-state tests**

Cover editable text prefills, ignored signature/unknown prefills, independent signature values, required progress, optional omissions, first-invalid-field ordering, and input immutability.

- [ ] **Step 2: Write failing dialog and component tests**

Verify dialog focus, clear/cancel/apply, no apply when empty, independent captures, inline text editing, progress rail, field navigation, validation focus, value preservation after export failure, typed callbacks, busy state, cancellation, and successful flattened submission.

- [ ] **Step 3: Run tests to verify failure**

Run: `npm run test:unit -- --run src/lib/filler/state.spec.ts src/lib/components/SignatureDialog.svelte.spec.ts src/lib/components/PdfFormFiller.svelte.spec.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement state, dialog, and filler composition**

Use native `<dialog>` where supported with a controlled fallback only if browser tests prove it necessary. Route UI submit and imperative submit through one async function. Snapshot definition and values before export and emit copied payloads.

- [ ] **Step 5: Run `svelte-autofixer` on both components until clean**

Expected: no remaining issues or suggestions.

- [ ] **Step 6: Run focused verification**

Run: `npm run test:unit -- --run src/lib/filler/state.spec.ts src/lib/components/SignatureDialog.svelte.spec.ts src/lib/components/PdfFormFiller.svelte.spec.ts src/lib/pdf/export.spec.ts && npm run check`

Expected: focused tests PASS and check exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/filler/state.ts src/lib/filler/state.spec.ts src/lib/components/SignatureDialog.svelte src/lib/components/SignatureDialog.svelte.spec.ts src/lib/components/PdfFormFiller.svelte src/lib/components/PdfFormFiller.svelte.spec.ts
git commit -m "feat: add PDF form filling workflow"
```

### Task 10: Theme, public exports, and package documentation

**Files:**
- Create: `src/lib/styles.css`
- Modify: `src/lib/index.ts`
- Create: `src/lib/index.spec.ts`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Produces: package-root exports for both primary components, `SignaturePad`, all public types, schema helpers, and `exportFlattenedPdf`.

- [ ] **Step 1: Write failing package API and SSR tests**

Import the package entry in Node and assert expected named exports exist without DOM access. Add a browser style test that overrides representative `--bionic-sign-*` custom properties and observes the computed result.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test:unit -- --run src/lib/index.spec.ts`

Expected: FAIL because public exports and styles are incomplete.

- [ ] **Step 3: Implement exports and scoped theme tokens**

Define documented tokens for surface, text, muted text, border, accent, required, completed, invalid, focus ring, spacing, and radius. Keep component selectors under `.bionic-sign` and preserve consumer focus styles.

- [ ] **Step 4: Replace scaffold README with complete documentation**

Include installation, CSS import, URL and byte examples, designer and filler examples, schema/submission shapes, `RequestInit`, callbacks/methods, snippets, theme tokens, host-managed upload example, browser support, encrypted-PDF behavior, and the explicit non-cryptographic-signature warning.

- [ ] **Step 5: Run focused package verification**

Run: `npm run test:unit -- --run src/lib/index.spec.ts && npm run prepack && npm run check`

Expected: API tests PASS; package build, publint, and check exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/styles.css src/lib/index.ts src/lib/index.spec.ts package.json README.md
git commit -m "docs: publish Bionic Sign package API"
```

### Task 11: Backend-free demo site

**Files:**
- Modify: `src/routes/+page.svelte`
- Create: `src/routes/designer/+page.svelte`
- Create: `src/routes/designer/designer.spec.ts`
- Create: `src/routes/filler/+page.svelte`
- Create: `src/routes/filler/filler.spec.ts`
- Create: `static/demo/field-trip-permission.pdf`
- Create: `static/demo/field-trip-permission.schema.json`
- Modify: `src/app.html`
- Modify: `static/favicon.svg`

**Interfaces:**
- Consumes: package-root public API only, proving the consumer experience.
- Produces: navigable demo routes with local file/URL inputs, schema download/reload, prefills, and flattened PDF download.

- [ ] **Step 1: Write failing demo journey tests**

Test landing navigation; designer file input and URL input; adding named fields; schema preview/download; loading the saved definition in filler; visible student-name prefill; independent signing; validation; and flattened PDF download using browser download assertions.

- [ ] **Step 2: Run demo tests to verify failure**

Run: `npm run test:unit -- --run src/routes/designer/designer.spec.ts src/routes/filler/filler.spec.ts`

Expected: FAIL because the routes do not exist.

- [ ] **Step 3: Add deterministic demo fixtures**

Copy the verified two-page permission-form test fixture into `static/demo` and add a version-1 schema with `student_name`, `parent_name`, and `parent_signature` fields on known pages.

- [ ] **Step 4: Implement the landing, designer, and filler routes**

Use only exports from `$lib`. Keep all state in the browser, use object URLs for downloads and revoke them after use, show the live schema in the designer, and show structured submission values in the filler. Include concise notices that data stays local and signatures are not certificate-backed.

- [ ] **Step 5: Run `svelte-autofixer` on every changed route until clean**

Expected: no remaining issues or suggestions.

- [ ] **Step 6: Run demo and accessibility verification**

Run: `npm run test:unit -- --run src/routes/designer/designer.spec.ts src/routes/filler/filler.spec.ts && npm run check`

Expected: demo tests PASS and check exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/routes src/app.html static/favicon.svg static/demo
git commit -m "feat: add Bionic Sign demo workflows"
```

### Task 12: Full verification and release-readiness audit

**Files:**
- Modify only files required to fix failures discovered by the commands below.

**Interfaces:**
- Consumes: the complete package and demo.
- Produces: verified build artifacts and a clean release-readiness report.

- [ ] **Step 1: Run formatting and lint verification**

Run: `npm run lint`

Expected: Prettier and ESLint exit 0. If formatting fails, run `npm run format`, inspect the diff, and rerun `npm run lint`.

- [ ] **Step 2: Run all tests and type checks**

Run: `npm test && npm run check`

Expected: all Node and browser tests PASS and Svelte check reports zero errors.

- [ ] **Step 3: Build and inspect the package**

Run: `npm run build && npm pack --dry-run`

Expected: SvelteKit demo build, `svelte-package`, and publint exit 0; the tarball contains compiled library files, declarations, and CSS but excludes tests and demo fixtures.

- [ ] **Step 4: Run manual browser acceptance**

Run: `npm run dev -- --host 127.0.0.1`

Verify desktop and narrow mobile widths, file and URL loading, keyboard-only field manipulation, zoom alignment, independent mouse/touch-style signature input, schema reload, required validation, downloaded PDF appearance, and recovery from an invalid URL. Record browser/version and results in the final handoff.

- [ ] **Step 5: Audit the implementation against every acceptance criterion**

Read `docs/superpowers/specs/2026-08-20-pdf-signature-library-design.md` line by line and map each criterion to a passing automated test or the recorded manual check. Fix uncovered gaps test-first before continuing.

- [ ] **Step 6: Commit verification fixes if any**

If verification required fixes, inspect `git diff --name-only`, stage each listed project file explicitly (never `.superpowers/`), and run `git commit -m "fix: complete release verification"`. If no files changed, do not create an empty commit.
