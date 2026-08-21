import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
	BionicSignDiagnostic,
	ExportPdfOptions,
	FieldRect,
	FormDefinition,
	FormField,
	FormSubmission,
	FormValues,
	PdfFormDesignerHandle,
	PdfFormFillerHandle,
	PdfLoadOptions,
	PdfSource,
	PrefillResult,
	SignatureField,
	SignatureValue,
	TextField,
	TextValue,
	ValidationIssue,
	ValidationResult
} from './index.js';

type PublicTypes = [
	BionicSignDiagnostic,
	ExportPdfOptions,
	FieldRect,
	FormDefinition,
	FormField,
	FormSubmission,
	FormValues,
	PdfFormDesignerHandle,
	PdfFormFillerHandle,
	PdfLoadOptions,
	PdfSource,
	PrefillResult,
	SignatureField,
	SignatureValue,
	TextField,
	TextValue,
	ValidationIssue,
	ValidationResult
];

describe('package entry', () => {
	it('imports without browser globals and exposes the public runtime API', async () => {
		expect(globalThis).not.toHaveProperty('window');
		expect(globalThis).not.toHaveProperty('document');

		const api = await import('./index.js');

		expect(api).toMatchObject({
			PdfFormDesigner: expect.any(Function),
			PdfFormFiller: expect.any(Function),
			SignaturePad: expect.any(Function),
			BionicSignError: expect.any(Function),
			applyTextPrefill: expect.any(Function),
			cloneDefinition: expect.any(Function),
			exportFlattenedPdf: expect.any(Function),
			nextFieldName: expect.any(Function),
			validateDefinition: expect.any(Function)
		});
		expectTypeOf<PublicTypes>().not.toBeNever();
	});
});
