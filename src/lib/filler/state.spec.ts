import { describe, expect, it } from 'vitest';
import type { FormDefinition, FormValues, SignatureValue } from '../types.js';
import {
	cloneValues,
	createFillerState,
	firstInvalidField,
	requiredProgress,
	setSignatureValue,
	setTextValue,
	submissionValues,
	validateFiller
} from './state.js';

function definition(): FormDefinition {
	return {
		version: 1,
		fields: [
			{
				id: 'student-id',
				name: 'student_name',
				type: 'text',
				page: 1,
				rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.05 },
				required: true
			},
			{
				id: 'first-signature-id',
				name: 'first_signature',
				type: 'signature',
				page: 1,
				rect: { x: 0.1, y: 0.3, width: 0.3, height: 0.1 },
				required: true
			},
			{
				id: 'second-signature-id',
				name: 'second_signature',
				type: 'signature',
				page: 2,
				rect: { x: 0.1, y: 0.3, width: 0.3, height: 0.1 },
				required: true
			},
			{
				id: 'notes-id',
				name: 'notes',
				type: 'text',
				page: 2,
				rect: { x: 0.1, y: 0.6, width: 0.3, height: 0.05 },
				required: false
			}
		]
	};
}

describe('filler state commands', () => {
	it('applies editable text prefills and diagnoses ignored signature and unknown keys', () => {
		const prefill = {
			student_name: 'Jordan Lee',
			first_signature: 'must not be reused',
			unknown: 'ignored'
		};
		const original = structuredClone(prefill);

		const initial = createFillerState(definition(), prefill);
		const edited = setTextValue(initial.values, 'student_name', 'Alex Morgan');

		expect(initial.values).toEqual({ student_name: { type: 'text', value: 'Jordan Lee' } });
		expect(initial.diagnostics.map(({ code }) => code)).toEqual([
			'invalid-prefill-type',
			'unknown-prefill-field'
		]);
		expect(edited.student_name).toEqual({ type: 'text', value: 'Alex Morgan' });
		expect(initial.values.student_name).toEqual({ type: 'text', value: 'Jordan Lee' });
		expect(prefill).toEqual(original);
	});

	it('stores each signature independently without mutating prior values or inputs', () => {
		const first: SignatureValue = { type: 'signature', image: 'data:image/png;base64,Zmlyc3Q=' };
		const second: SignatureValue = { type: 'signature', image: 'data:image/png;base64,c2Vjb25k' };
		const empty: FormValues = {};

		const withFirst = setSignatureValue(empty, 'first_signature', first);
		const withBoth = setSignatureValue(withFirst, 'second_signature', second);
		first.image = 'mutated';

		expect(empty).toEqual({});
		expect(withFirst).toEqual({
			first_signature: { type: 'signature', image: 'data:image/png;base64,Zmlyc3Q=' }
		});
		expect(withBoth).toEqual({
			first_signature: { type: 'signature', image: 'data:image/png;base64,Zmlyc3Q=' },
			second_signature: { type: 'signature', image: 'data:image/png;base64,c2Vjb25k' }
		});
	});

	it('counts only non-empty required values and allows optional omissions', () => {
		const values: FormValues = {
			student_name: { type: 'text', value: ' Jordan ' },
			first_signature: { type: 'signature', image: 'data:image/png;base64,c2ln' },
			notes: { type: 'text', value: '   ' }
		};

		expect(requiredProgress(definition(), values)).toEqual({
			completed: 2,
			total: 3,
			remaining: 1
		});
		expect(validateFiller(definition(), values)).toEqual({
			valid: false,
			issues: [expect.objectContaining({ code: 'required-field', fieldName: 'second_signature' })]
		});
		expect(submissionValues(definition(), values)).toEqual({
			student_name: { type: 'text', value: ' Jordan ' },
			first_signature: { type: 'signature', image: 'data:image/png;base64,c2ln' }
		});
	});

	it('reports missing required fields in definition order and returns the first field', () => {
		const values = setSignatureValue({}, 'second_signature', {
			type: 'signature',
			image: 'data:image/png;base64,c2ln'
		});

		const result = validateFiller(definition(), values);

		expect(result.issues.map(({ fieldName }) => fieldName)).toEqual([
			'student_name',
			'first_signature'
		]);
		expect(firstInvalidField(definition(), values)?.id).toBe('student-id');
	});

	it.each([true, false])(
		'treats a prototype-named %s field as absent unless it is an own value',
		(required) => {
			const prototypeDefinition: FormDefinition = {
				version: 1,
				fields: [
					{
						id: 'prototype-id',
						name: 'toString',
						type: 'text',
						page: 1,
						rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
						required
					}
				]
			};
			const empty = cloneValues({});

			expect(Object.getPrototypeOf(empty)).toBeNull();
			expect(requiredProgress(prototypeDefinition, empty)).toEqual({
				completed: 0,
				total: required ? 1 : 0,
				remaining: required ? 1 : 0
			});
			expect(submissionValues(prototypeDefinition, empty)).toEqual({});
			expect(validateFiller(prototypeDefinition, empty).valid).toBe(!required);
		}
	);
});
