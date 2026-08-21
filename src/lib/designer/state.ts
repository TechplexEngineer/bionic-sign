import { nextFieldName, validateDefinition } from '../schema.js';
import type { FieldRect, FormDefinition, FormField } from '../types.js';

export const MIN_FIELD_SIZE = 0.02;

const DEFAULT_FIELD_RECTS: Record<FormField['type'], FieldRect> = {
	text: { x: 0.1, y: 0.1, width: 0.3, height: 0.1 },
	signature: { x: 0.1, y: 0.1, width: 0.3, height: 0.15 }
};

function assertFiniteRect(rect: FieldRect): void {
	for (const [property, value] of Object.entries(rect)) {
		if (!Number.isFinite(value)) {
			throw new TypeError(`Field rect.${property} must be a finite number`);
		}
	}
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), maximum);
}

export function constrainFieldRect(rect: FieldRect): FieldRect {
	assertFiniteRect(rect);

	const x = clamp(rect.x, 0, 1 - MIN_FIELD_SIZE);
	const y = clamp(rect.y, 0, 1 - MIN_FIELD_SIZE);

	return {
		x,
		y,
		width: clamp(rect.width, MIN_FIELD_SIZE, 1 - x),
		height: clamp(rect.height, MIN_FIELD_SIZE, 1 - y)
	};
}

function updateField(
	definition: FormDefinition,
	id: string,
	update: (field: FormField) => FormField
): FormDefinition {
	let found = false;
	const fields = definition.fields.map((field) => {
		if (field.id !== id) return field;
		found = true;
		return update(field);
	});

	if (!found) {
		throw new RangeError(`No field with id "${id}" exists`);
	}

	return validateDefinition({ version: 1, fields });
}

export function addField(
	definition: FormDefinition,
	type: FormField['type'],
	page: number,
	rect: FieldRect = DEFAULT_FIELD_RECTS[type]
): FormDefinition {
	const field: FormField = {
		id: globalThis.crypto.randomUUID(),
		name: nextFieldName(type, definition.fields),
		type,
		page,
		rect: constrainFieldRect(rect),
		required: true
	};

	return validateDefinition({ version: 1, fields: [...definition.fields, field] });
}

export function renameField(definition: FormDefinition, id: string, name: string): FormDefinition {
	return updateField(definition, id, (field) => ({ ...field, name }));
}

export function updateFieldRect(
	definition: FormDefinition,
	id: string,
	rect: FieldRect
): FormDefinition {
	return updateField(definition, id, (field) => ({
		...field,
		rect: constrainFieldRect(rect)
	}));
}

export function toggleRequired(definition: FormDefinition, id: string): FormDefinition {
	return updateField(definition, id, (field) => ({ ...field, required: !field.required }));
}

export function deleteField(definition: FormDefinition, id: string): FormDefinition {
	if (!definition.fields.some((field) => field.id === id)) {
		throw new RangeError(`No field with id "${id}" exists`);
	}

	return validateDefinition({
		version: 1,
		fields: definition.fields.filter((field) => field.id !== id)
	});
}
