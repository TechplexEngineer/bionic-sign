import { describe, expect, it } from 'vitest';
import type { FormDefinition, FormField } from '../types.js';
import {
	MIN_FIELD_SIZE,
	addField,
	constrainMovedFieldRect,
	deleteField,
	renameField,
	toggleRequired,
	updateFieldRect
} from './state.js';

function field(id: string, name: string, overrides: Partial<FormField> = {}): FormField {
	return {
		id,
		name,
		type: 'text',
		page: 1,
		rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
		required: true,
		...overrides
	} as FormField;
}

function definition(...fields: FormField[]): FormDefinition {
	return { version: 1, fields };
}

describe('designer state commands', () => {
	it('adds required fields with stable IDs and the first available generated name', () => {
		const original = definition(field('existing', 'text_1'));

		const first = addField(original, 'text', 2);
		const second = addField(first, 'text', 2);

		expect(first.fields[1]).toEqual(
			expect.objectContaining({ name: 'text_2', type: 'text', page: 2, required: true })
		);
		expect(first.fields[1].id).not.toBe('');
		expect(second.fields[2].name).toBe('text_3');
		expect(second.fields[2].id).not.toBe(first.fields[1].id);
		expect(original).toEqual(definition(field('existing', 'text_1')));
	});

	it('renames a field without changing the input definition', () => {
		const original = definition(field('student-id', 'student'));

		const renamed = renameField(original, 'student-id', 'student_name');

		expect(renamed.fields[0].name).toBe('student_name');
		expect(original.fields[0].name).toBe('student');
		expect(renamed).not.toBe(original);
		expect(renamed.fields[0]).not.toBe(original.fields[0]);
	});

	it('rejects a rename that duplicates another field name', () => {
		const original = definition(field('student-id', 'student'), field('guardian-id', 'guardian'));

		expect(() => renameField(original, 'guardian-id', 'student')).toThrow(/unique/i);
		expect(original.fields[1].name).toBe('guardian');
	});

	it('clamps rectangles to the page and enforces the normalized minimum size', () => {
		const original = definition(field('student-id', 'student'));

		const updated = updateFieldRect(original, 'student-id', {
			x: 0.99,
			y: -0.4,
			width: 0.001,
			height: 2
		});

		expect(updated.fields[0].rect).toEqual({
			x: 1 - MIN_FIELD_SIZE,
			y: 0,
			width: MIN_FIELD_SIZE,
			height: 1
		});
		expect(original.fields[0].rect).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.1 });
	});

	it('preserves the top-left anchor when size growth reaches the page edge', () => {
		const original = definition(field('student-id', 'student'));

		const updated = updateFieldRect(original, 'student-id', {
			x: 0.8,
			y: 0.9,
			width: 0.4,
			height: 0.4
		});

		expect(updated.fields[0].rect).toMatchObject({ x: 0.8, y: 0.9 });
		expect(updated.fields[0].rect.width).toBeCloseTo(0.2);
		expect(updated.fields[0].rect.height).toBeCloseTo(0.1);
	});

	it('clamps movement without changing field dimensions', () => {
		const moved = constrainMovedFieldRect({
			x: 1.4,
			y: 1.2,
			width: 0.3,
			height: 0.2
		});

		expect(moved).toEqual({ x: 0.7, y: 0.8, width: 0.3, height: 0.2 });
	});

	it('toggles required state immutably', () => {
		const original = definition(field('student-id', 'student'));

		const updated = toggleRequired(original, 'student-id');

		expect(updated.fields[0].required).toBe(false);
		expect(original.fields[0].required).toBe(true);
	});

	it('deletes only the requested field without changing the input definition', () => {
		const original = definition(field('student-id', 'student'), field('guardian-id', 'guardian'));

		const updated = deleteField(original, 'student-id');

		expect(updated.fields.map(({ id }) => id)).toEqual(['guardian-id']);
		expect(original.fields.map(({ id }) => id)).toEqual(['student-id', 'guardian-id']);
	});
});
