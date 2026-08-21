import { applyTextPrefill } from '../schema.js';
import type {
	BionicSignDiagnostic,
	FormDefinition,
	FormField,
	FormValues,
	SignatureValue,
	TextValue,
	ValidationIssue,
	ValidationResult
} from '../types.js';

export interface FillerState {
	values: FormValues;
	diagnostics: BionicSignDiagnostic[];
}

export interface RequiredProgress {
	completed: number;
	total: number;
	remaining: number;
}

function cloneValue(value: FormValues[string]): FormValues[string] {
	return value.type === 'text'
		? { type: 'text', value: value.value }
		: { type: 'signature', image: value.image };
}

export function cloneValues(values: FormValues): FormValues {
	return Object.assign(
		Object.create(null) as FormValues,
		Object.fromEntries(Object.entries(values).map(([name, value]) => [name, cloneValue(value)]))
	);
}

export function createFillerState(
	definition: FormDefinition,
	prefill: Record<string, string> = {}
): FillerState {
	const result = applyTextPrefill(definition, { ...prefill });
	return {
		values: cloneValues(result.values),
		diagnostics: result.diagnostics.map((value) => ({ ...value }))
	};
}

export function setTextValue(values: FormValues, fieldName: string, value: string): FormValues {
	return {
		...cloneValues(values),
		[fieldName]: { type: 'text', value } satisfies TextValue
	};
}

export function setSignatureValue(
	values: FormValues,
	fieldName: string,
	value: SignatureValue
): FormValues {
	return {
		...cloneValues(values),
		[fieldName]: { type: 'signature', image: value.image }
	};
}

export function clearFieldValue(values: FormValues, fieldName: string): FormValues {
	const next = cloneValues(values);
	delete next[fieldName];
	return next;
}

export function isFieldComplete(field: FormField, values: FormValues): boolean {
	const value = values[field.name];
	if (!value) return false;
	if (field.type === 'signature') {
		return value.type === 'signature' && value.image.length > 0;
	}
	if (value.type !== 'text' || value.value.trim().length === 0) return false;
	return field.type === 'text' || field.options.includes(value.value);
}

export function requiredProgress(definition: FormDefinition, values: FormValues): RequiredProgress {
	const required = definition.fields.filter((field) => field.required);
	const completed = required.filter((field) => isFieldComplete(field, values)).length;
	return { completed, total: required.length, remaining: required.length - completed };
}

function requiredIssue(field: FormField): ValidationIssue {
	return {
		code: 'required-field',
		message: `Field "${field.name}" is required`,
		fieldName: field.name
	};
}

export function validateFiller(definition: FormDefinition, values: FormValues): ValidationResult {
	const issues = definition.fields
		.filter((field) => field.required && !isFieldComplete(field, values))
		.map(requiredIssue);
	return { valid: issues.length === 0, issues };
}

export function firstInvalidField(
	definition: FormDefinition,
	values: FormValues
): FormField | undefined {
	return definition.fields.find((field) => field.required && !isFieldComplete(field, values));
}

export function submissionValues(definition: FormDefinition, values: FormValues): FormValues {
	const submitted: FormValues = {};
	for (const field of definition.fields) {
		if (!isFieldComplete(field, values)) continue;
		const value = values[field.name];
		if (value) submitted[field.name] = cloneValue(value);
	}
	return submitted;
}
