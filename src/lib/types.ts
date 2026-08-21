export type PdfSource = string | Uint8Array | ArrayBuffer;

export interface PdfLoadOptions {
	requestInit?: RequestInit;
	signal?: AbortSignal;
}

export interface ExportPdfOptions {
	signal?: AbortSignal;
}

export interface FieldRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface BaseField {
	readonly id: string;
	name: string;
	page: number;
	rect: FieldRect;
	required: boolean;
}

export interface TextField extends BaseField {
	type: 'text';
}

export interface SignatureField extends BaseField {
	type: 'signature';
}

export interface DropdownField extends BaseField {
	type: 'dropdown';
	options: string[];
}

export type FormField = TextField | SignatureField | DropdownField;

export interface FormDefinition {
	version: 1;
	fields: FormField[];
}

export interface TextValue {
	type: 'text';
	value: string;
}

export interface SignatureValue {
	type: 'signature';
	image: string;
}

export type FormValues = Record<string, TextValue | SignatureValue>;

export interface FormSubmission {
	values: FormValues;
	pdf: Uint8Array;
}

export interface ValidationIssue {
	code: string;
	message: string;
	fieldName?: string;
}

export interface ValidationResult {
	valid: boolean;
	issues: ValidationIssue[];
}

export interface PdfFormDesignerHandle {
	validate(): ValidationResult;
}

export interface PdfFormFillerHandle {
	validate(): ValidationResult;
	exportPdf(): Promise<Uint8Array>;
	submit(): Promise<FormSubmission>;
}

export class BionicSignError extends Error {
	constructor(
		public readonly code: string,
		message: string,
		options?: ErrorOptions
	) {
		super(message, options);
		this.name = 'BionicSignError';
	}
}

export interface BionicSignDiagnostic {
	code: string;
	message: string;
	fieldName?: string;
}

export interface PrefillResult {
	values: Record<string, TextValue>;
	diagnostics: BionicSignDiagnostic[];
}
