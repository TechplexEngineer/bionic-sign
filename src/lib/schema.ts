import type {
	BionicSignDiagnostic,
	FieldRect,
	FormDefinition,
	FormField,
	PrefillResult,
	TextValue
} from './types.js';

const FIELD_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, description: string): string {
	if (typeof value !== 'string') {
		throw new TypeError(`${description} must be a string`);
	}
	return value;
}

function readFiniteNumber(value: unknown, description: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new TypeError(`${description} must be a finite number`);
	}
	return value;
}

function readRect(value: unknown, fieldName: string): FieldRect {
	if (!isRecord(value)) {
		throw new TypeError(`Field "${fieldName}" rect must be an object`);
	}

	const rect = {
		x: readFiniteNumber(value.x, `Field "${fieldName}" rect.x`),
		y: readFiniteNumber(value.y, `Field "${fieldName}" rect.y`),
		width: readFiniteNumber(value.width, `Field "${fieldName}" rect.width`),
		height: readFiniteNumber(value.height, `Field "${fieldName}" rect.height`)
	};

	if (
		rect.x < 0 ||
		rect.y < 0 ||
		rect.width <= 0 ||
		rect.height <= 0 ||
		rect.x + rect.width > 1 ||
		rect.y + rect.height > 1
	) {
		throw new RangeError(`Field "${fieldName}" rect must remain within the normalized page`);
	}

	return rect;
}

function readField(value: unknown, index: number): FormField {
	if (!isRecord(value)) {
		throw new TypeError(`Field ${index} must be an object`);
	}

	const name = readString(value.name, `Field ${index} name`);
	if (!FIELD_NAME_PATTERN.test(name)) {
		throw new TypeError(
			`Field "${name}" name must start with a letter and contain only letters, numbers, underscores, or hyphens`
		);
	}

	const id = readString(value.id, `Field "${name}" id`);
	if (id.length === 0) {
		throw new TypeError(`Field "${name}" id must not be empty`);
	}

	const page = readFiniteNumber(value.page, `Field "${name}" page`);
	if (!Number.isInteger(page) || page < 1) {
		throw new RangeError(`Field "${name}" page must be a one-based integer`);
	}

	const required = value.required === undefined ? true : value.required;
	if (typeof required !== 'boolean') {
		throw new TypeError(`Field "${name}" required must be a boolean`);
	}

	const rect = readRect(value.rect, name);
	if (value.type === 'text') {
		return { id, name, type: 'text', page, rect, required };
	}
	if (value.type === 'signature') {
		return { id, name, type: 'signature', page, rect, required };
	}
	if (value.type === 'dropdown') {
		if (!Array.isArray(value.options) || value.options.length === 0) {
			throw new TypeError(`Field "${name}" dropdown options must be a non-empty array`);
		}
		const options = value.options.map((option, optionIndex) => {
			const parsed = readString(option, `Field "${name}" option ${optionIndex}`).trim();
			if (parsed.length === 0) {
				throw new TypeError(`Field "${name}" dropdown options must not contain empty values`);
			}
			return parsed;
		});
		if (new Set(options).size !== options.length) {
			throw new RangeError(`Field "${name}" dropdown options must be unique`);
		}
		return { id, name, type: 'dropdown', page, rect, required, options };
	}

	throw new TypeError(`Field "${name}" type must be "text", "dropdown", or "signature"`);
}

export function validateDefinition(input: unknown): FormDefinition {
	if (!isRecord(input)) {
		throw new TypeError('Form definition must be an object');
	}
	if (input.version !== 1) {
		throw new RangeError('Form definition version must be 1');
	}
	if (!Array.isArray(input.fields)) {
		throw new TypeError('Form definition fields must be an array');
	}

	const names = new Set<string>();
	const ids = new Set<string>();
	const fields = input.fields.map((value, index) => {
		const field = readField(value, index);
		if (names.has(field.name)) {
			throw new RangeError(`Field name "${field.name}" must be unique`);
		}
		names.add(field.name);
		if (ids.has(field.id)) {
			throw new RangeError(`Field id "${field.id}" must be unique`);
		}
		ids.add(field.id);
		return field;
	});

	return { version: 1, fields };
}

export function nextFieldName(type: FormField['type'], fields: readonly FormField[]): string {
	let index = 1;
	const names = new Set(fields.map((field) => field.name));
	while (names.has(`${type}_${index}`)) {
		index += 1;
	}
	return `${type}_${index}`;
}

export function cloneDefinition(definition: FormDefinition): FormDefinition {
	return {
		version: definition.version,
		fields: definition.fields.map((field) =>
			field.type === 'dropdown'
				? { ...field, rect: { ...field.rect }, options: [...field.options] }
				: { ...field, rect: { ...field.rect } }
		)
	};
}

function diagnostic(code: string, message: string, fieldName: string): BionicSignDiagnostic {
	return { code, message, fieldName };
}

export function applyTextPrefill(
	definition: FormDefinition,
	prefill: Record<string, string>
): PrefillResult {
	const values = Object.create(null) as Record<string, TextValue>;
	const diagnostics: BionicSignDiagnostic[] = [];
	const fieldsByName = new Map(definition.fields.map((field) => [field.name, field]));

	for (const [name, value] of Object.entries(prefill)) {
		const field = fieldsByName.get(name);
		if (!field) {
			diagnostics.push(
				diagnostic('unknown-prefill-field', `No field named "${name}" exists`, name)
			);
			continue;
		}
		if (field.type !== 'text') {
			diagnostics.push(
				diagnostic('invalid-prefill-type', `Field "${name}" is not a text field`, name)
			);
			continue;
		}
		values[name] = { type: 'text', value };
	}

	return { values, diagnostics };
}
