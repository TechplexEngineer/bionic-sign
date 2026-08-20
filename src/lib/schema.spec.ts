import { describe, expect, it } from 'vitest';
import { applyTextPrefill, nextFieldName, validateDefinition } from './schema.js';
import type { FormDefinition, FormField } from './types.js';

function field(id: string, name: string, type: FormField['type'] = 'text'): FormField {
	return {
		id,
		name,
		type,
		page: 1,
		rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
		required: true
	};
}

function definitionWithTextAndSignature(): FormDefinition {
	return {
		version: 1,
		fields: [
			field('text-id', 'student_name'),
			field('signature-id', 'parent_signature', 'signature')
		]
	};
}

describe('validateDefinition', () => {
	it('accepts an empty version-1 definition', () => {
		expect(validateDefinition({ version: 1, fields: [] })).toEqual({ version: 1, fields: [] });
	});

	it('rejects duplicate field names', () => {
		expect(() =>
			validateDefinition({
				version: 1,
				fields: [field('a', 'student'), field('b', 'student')]
			})
		).toThrow(/unique/i);
	});

	it('rejects empty and malformed field names', () => {
		expect(() => validateDefinition({ version: 1, fields: [field('a', '')] })).toThrow(/name/i);
		expect(() => validateDefinition({ version: 1, fields: [field('a', '1student')] })).toThrow(
			/name/i
		);
	});

	it('rejects rectangles outside a normalized page', () => {
		const outside = field('a', 'student');
		outside.rect.x = 0.8;
		expect(() => validateDefinition({ version: 1, fields: [outside] })).toThrow(/rect/i);

		const zeroWidth = field('b', 'guardian');
		zeroWidth.rect.width = 0;
		expect(() => validateDefinition({ version: 1, fields: [zeroWidth] })).toThrow(/rect/i);
	});

	it('rejects pages below one', () => {
		const invalidPage = field('a', 'student');
		invalidPage.page = 0;
		expect(() => validateDefinition({ version: 1, fields: [invalidPage] })).toThrow(/page/i);
	});

	it('returns a clone without mutating or retaining input objects', () => {
		const input = definitionWithTextAndSignature();
		const parsed = validateDefinition(input);
		parsed.fields[0].rect.x = 0.5;

		expect(input.fields[0].rect.x).toBe(0.1);
		expect(parsed).not.toBe(input);
		expect(parsed.fields).not.toBe(input.fields);
	});
});

describe('nextFieldName', () => {
	it('generates the first available name for each field type', () => {
		const fields = [field('a', 'text_2'), field('b', 'signature_2', 'signature')];
		expect(nextFieldName('text', fields)).toBe('text_1');
		expect(nextFieldName('signature', fields)).toBe('signature_1');
	});
});

describe('applyTextPrefill', () => {
	it('prefills text and diagnoses signature prefills', () => {
		const result = applyTextPrefill(definitionWithTextAndSignature(), {
			student_name: 'Jordan Lee',
			parent_signature: 'ignored'
		});

		expect(result.values.student_name).toEqual({ type: 'text', value: 'Jordan Lee' });
		expect(result.diagnostics[0].code).toBe('invalid-prefill-type');
		expect(result.diagnostics[0].fieldName).toBe('parent_signature');
	});

	it('diagnoses unknown prefill keys without creating values', () => {
		const result = applyTextPrefill(definitionWithTextAndSignature(), { unknown_name: 'ignored' });

		expect(result.values).toEqual({});
		expect(result.diagnostics).toEqual([
			expect.objectContaining({ code: 'unknown-prefill-field', fieldName: 'unknown_name' })
		]);
	});
});
