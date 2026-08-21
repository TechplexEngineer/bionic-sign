import { readFile } from 'node:fs/promises';

import {
	decodePDFRawStream,
	degrees,
	PDFArray,
	PDFContentStream,
	PDFDict,
	PDFDocument,
	PDFName,
	PDFRawStream
} from 'pdf-lib';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { FormDefinition, FormValues } from '../types.js';
import { BionicSignError } from '../types.js';
import { exportFlattenedPdf } from './export.js';

const TWO_BY_ONE_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFElEQVR42mP8z8Dwn4GBgYGJAQoAHgAD/VoS8AAAAABJRU5ErkJggg==';
const ONE_BY_ONE_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2+XkAAAAASUVORK5CYII=';
const NON_CANONICAL_ONE_BY_ONE_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2+XkAAAAASUVORK5CYIJ=';

let fixture: Uint8Array;

beforeAll(async () => {
	fixture = new Uint8Array(
		await readFile(new URL('../template/fixtures/permission-form.pdf', import.meta.url))
	);
});

function definition(fields: FormDefinition['fields']): FormDefinition {
	return { version: 1, fields };
}

function contentForPage(document: PDFDocument, pageIndex: number): string {
	const contents = document.getPage(pageIndex).node.Contents();
	if (!contents) return '';

	const objects = contents instanceof PDFArray ? contents.asArray() : [contents];
	return objects
		.map((object) => {
			const stream = document.context.lookup(object);
			const bytes =
				stream instanceof PDFRawStream
					? decodePDFRawStream(stream).decode()
					: stream instanceof PDFContentStream
						? stream.getUnencodedContents()
						: new Uint8Array();
			return new TextDecoder().decode(bytes);
		})
		.join('\n');
}

type Matrix = [number, number, number, number, number, number];

function matrixValues(match: RegExpMatchArray): Matrix {
	return match.slice(1).map(Number) as Matrix;
}

function imageTransformBlocks(content: string): Matrix[][] {
	return [...content.matchAll(/q\s+([\s\S]*?)\/\S+ Do\s+Q/g)].map((block) =>
		[
			...block[1].matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) cm/g)
		].map(matrixValues)
	);
}

function imageMatrices(content: string): number[][] {
	return imageTransformBlocks(content).map((matrices) => {
		const translation = matrices[0];
		const scale = matrices[2];
		return [scale[0], scale[3], translation[4], translation[5]];
	});
}

function textMatrices(content: string): Matrix[] {
	return [
		...content.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) Tm/g)
	].map(matrixValues);
}

async function sourceWithRotation(rotation: 0 | 90 | 180 | 270): Promise<Uint8Array> {
	const document = await PDFDocument.create();
	const page = document.addPage([612, 792]);
	page.setRotation(degrees(rotation));
	return document.save();
}

async function sourceWithVisibleBox(rotation: 0 | 90 | 180 | 270): Promise<Uint8Array> {
	const document = await PDFDocument.create();
	const page = document.addPage([600, 800]);
	page.setMediaBox(20, 30, 600, 800);
	page.setCropBox(0, 130, 320, 400);
	page.setRotation(degrees(rotation));
	return document.save();
}

function imageResourceCount(document: PDFDocument, pageIndex: number): number {
	const resources = document.getPage(pageIndex).node.Resources();
	const xObjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
	return xObjects?.keys().length ?? 0;
}

async function extractedText(bytes: Uint8Array): Promise<string[][]> {
	const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const loadingTask = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
	const document = await loadingTask.promise;
	try {
		const pages: string[][] = [];
		for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
			const content = await (await document.getPage(pageNumber)).getTextContent();
			pages.push(content.items.flatMap((item) => ('str' in item ? [item.str] : [])));
		}
		return pages;
	} finally {
		await loadingTask.destroy();
	}
}

describe('exportFlattenedPdf', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns a new parseable PDF with text on its defined page without mutating inputs', async () => {
		const source = fixture.slice();
		const originalSource = source.slice();
		const form = definition([
			{
				id: 'student-id',
				name: 'student_name',
				type: 'text',
				page: 2,
				rect: { x: 0.1, y: 0.2, width: 0.4, height: 0.06 },
				required: true
			}
		]);
		const values: FormValues = { student_name: { type: 'text', value: 'Jordan Lee' } };
		const originalForm = structuredClone(form);
		const originalValues = structuredClone(values);

		const output = await exportFlattenedPdf(source, form, values);
		const loaded = await PDFDocument.load(output);
		const pageText = await extractedText(output);

		expect(output).not.toBe(source);
		expect(loaded.getPageCount()).toBe(2);
		expect(pageText[0]).not.toContain('Jordan Lee');
		expect(pageText[1]).toContain('Jordan Lee');
		expect(source).toEqual(originalSource);
		expect(form).toEqual(originalForm);
		expect(values).toEqual(originalValues);
	});

	it('flattens a selected dropdown option as text', async () => {
		const form = definition([
			{
				id: 'grade-id',
				name: 'grade',
				type: 'dropdown',
				options: ['Freshman', 'Sophomore'],
				page: 1,
				rect: { x: 0.1, y: 0.2, width: 0.4, height: 0.06 },
				required: true
			}
		]);

		const output = await exportFlattenedPdf(fixture, form, {
			grade: { type: 'text', value: 'Sophomore' }
		});

		expect((await extractedText(output))[0]).toContain('Sophomore');
	});

	it('embeds independent PNG signatures and aspect-fits each image inside its field', async () => {
		const form = definition([
			{
				id: 'first-signature-id',
				name: 'first_signature',
				type: 'signature',
				page: 1,
				rect: { x: 0.1, y: 0.2, width: 0.2, height: 0.1 },
				required: true
			},
			{
				id: 'second-signature-id',
				name: 'second_signature',
				type: 'signature',
				page: 1,
				rect: { x: 0.5, y: 0.5, width: 0.2, height: 0.1 },
				required: true
			}
		]);

		const output = await exportFlattenedPdf(fixture, form, {
			first_signature: { type: 'signature', image: TWO_BY_ONE_PNG },
			second_signature: { type: 'signature', image: ONE_BY_ONE_PNG }
		});
		const document = await PDFDocument.load(output);
		const matrices = imageMatrices(contentForPage(document, 0));
		const imageReferences = document
			.getPage(0)
			.node.normalizedEntries()
			.XObject.values()
			.map((reference) => reference.toString());

		expect(imageResourceCount(document, 0)).toBe(2);
		expect(new Set(imageReferences).size).toBe(2);
		expect(matrices).toHaveLength(2);
		expect(matrices[0]).toEqual([
			expect.closeTo(122.4, 5),
			expect.closeTo(61.2, 5),
			expect.closeTo(61.2, 5),
			expect.closeTo(563.4, 5)
		]);
		expect(matrices[1]).toEqual([
			expect.closeTo(79.2, 5),
			expect.closeTo(79.2, 5),
			expect.closeTo(327.6, 5),
			expect.closeTo(316.8, 5)
		]);
	});

	it('reuses one embedded image while drawing the same signature in multiple fields', async () => {
		const form = definition([
			{
				id: 'first-id',
				name: 'first',
				type: 'signature',
				page: 1,
				rect: { x: 0.1, y: 0.2, width: 0.2, height: 0.1 },
				required: true
			},
			{
				id: 'second-id',
				name: 'second',
				type: 'signature',
				page: 1,
				rect: { x: 0.5, y: 0.5, width: 0.2, height: 0.1 },
				required: true
			}
		]);

		const output = await exportFlattenedPdf(fixture, form, {
			first: { type: 'signature', image: ONE_BY_ONE_PNG },
			second: { type: 'signature', image: ONE_BY_ONE_PNG }
		});
		const document = await PDFDocument.load(output);

		const imageReferences = document
			.getPage(0)
			.node.normalizedEntries()
			.XObject.values()
			.map((reference) => reference.toString());
		expect(new Set(imageReferences).size).toBe(1);
		expect(imageMatrices(contentForPage(document, 0))).toHaveLength(2);
	});

	it('reuses one embedded image for data URLs that decode to identical PNG bytes', async () => {
		const form = definition([
			{
				id: 'first-id',
				name: 'first',
				type: 'signature',
				page: 1,
				rect: { x: 0.1, y: 0.2, width: 0.2, height: 0.1 },
				required: true
			},
			{
				id: 'second-id',
				name: 'second',
				type: 'signature',
				page: 1,
				rect: { x: 0.5, y: 0.5, width: 0.2, height: 0.1 },
				required: true
			}
		]);

		const output = await exportFlattenedPdf(fixture, form, {
			first: { type: 'signature', image: ONE_BY_ONE_PNG },
			second: { type: 'signature', image: NON_CANONICAL_ONE_BY_ONE_PNG }
		});
		const document = await PDFDocument.load(output);
		const imageReferences = document
			.getPage(0)
			.node.normalizedEntries()
			.XObject.values()
			.map((reference) => reference.toString());

		expect(new Set(imageReferences).size).toBe(1);
		expect(imageMatrices(contentForPage(document, 0))).toHaveLength(2);
	});

	it('omits empty optional text and signature values', async () => {
		const form = definition([
			{
				id: 'notes-id',
				name: 'notes',
				type: 'text',
				page: 1,
				rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.05 },
				required: false
			},
			{
				id: 'optional-signature-id',
				name: 'optional_signature',
				type: 'signature',
				page: 1,
				rect: { x: 0.1, y: 0.4, width: 0.3, height: 0.1 },
				required: false
			}
		]);

		const output = await exportFlattenedPdf(fixture, form, {
			notes: { type: 'text', value: '   ' },
			optional_signature: { type: 'signature', image: '' }
		});
		const document = await PDFDocument.load(output);
		const pageText = await extractedText(output);

		expect(pageText[0]).toEqual(['FIELD TRIP PERMISSION FORM — PAGE 1']);
		expect(imageResourceCount(document, 0)).toBe(0);
	});

	it.each([
		['missing text', 'text', undefined],
		['blank text', 'text', { type: 'text', value: '  ' }],
		['missing signature', 'signature', undefined],
		['empty signature', 'signature', { type: 'signature', image: '' }]
	] as const)('rejects a %s required value', async (_description, type, value) => {
		const form = definition([
			{
				id: 'required-id',
				name: 'required_field',
				type: type as 'text',
				page: 1,
				rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
				required: true
			} as FormDefinition['fields'][number]
		]);
		const values = value ? ({ required_field: value } as FormValues) : {};

		const error = await exportFlattenedPdf(fixture, form, values).catch(
			(reason: unknown) => reason
		);

		expect(error).toBeInstanceOf(BionicSignError);
		expect(error).toMatchObject({ code: 'export-required-value' });
	});

	it('rejects a present value whose discriminator does not match its field', async () => {
		const form = definition([
			{
				id: 'name-id',
				name: 'name',
				type: 'text',
				page: 1,
				rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
				required: false
			}
		]);

		const error = await exportFlattenedPdf(fixture, form, {
			name: { type: 'signature', image: ONE_BY_ONE_PNG }
		}).catch((reason: unknown) => reason);

		expect(error).toBeInstanceOf(BionicSignError);
		expect(error).toMatchObject({ code: 'export-value-type' });
	});

	it('maps a runtime null value to the typed value-mismatch error', async () => {
		const form = definition([
			{
				id: 'name-id',
				name: 'name',
				type: 'text',
				page: 1,
				rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
				required: false
			}
		]);
		const runtimeValues = { name: null } as unknown as FormValues;

		const error = await exportFlattenedPdf(fixture, form, runtimeValues).catch(
			(reason: unknown) => reason
		);

		expect(error).toBeInstanceOf(BionicSignError);
		expect(error).toMatchObject({ code: 'export-value-type' });
	});

	it.each([true, false])(
		'treats an inherited prototype value as missing for a %s prototype-named field',
		async (required) => {
			const form = definition([
				{
					id: 'prototype-id',
					name: 'toString',
					type: 'text',
					page: 1,
					rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
					required
				}
			]);

			const result = await exportFlattenedPdf(fixture, form, {}).catch((reason: unknown) => reason);

			if (required) {
				expect(result).toBeInstanceOf(BionicSignError);
				expect(result).toMatchObject({ code: 'export-required-value' });
			} else {
				expect(result).toBeInstanceOf(Uint8Array);
				expect(await PDFDocument.load(result as Uint8Array)).toBeDefined();
			}
		}
	);

	it.each([0, 1.5, 3])('rejects a field page outside the source PDF: %s', async (fieldPage) => {
		const form = definition([
			{
				id: 'off-page-id',
				name: 'off_page',
				type: 'text',
				page: fieldPage,
				rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
				required: false
			}
		]);

		const error = await exportFlattenedPdf(fixture, form, {}).catch((reason: unknown) => reason);

		expect(error).toBeInstanceOf(BionicSignError);
		expect(error).toMatchObject({ code: 'export-page-out-of-range' });
	});

	it.each([
		['wrong media type', 'data:image/jpeg;base64,bm90LXBuZw=='],
		['invalid base64', 'data:image/png;base64,%%%%'],
		['non-PNG bytes', 'data:image/png;base64,bm90LXBuZw==']
	])('rejects a malformed PNG signature with a stable error: %s', async (_case, image) => {
		const form = definition([
			{
				id: 'signature-id',
				name: 'signature',
				type: 'signature',
				page: 1,
				rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
				required: false
			}
		]);

		const error = await exportFlattenedPdf(fixture, form, {
			signature: { type: 'signature', image }
		}).catch((reason: unknown) => reason);

		expect(error).toBeInstanceOf(BionicSignError);
		expect(error).toMatchObject({ code: 'export-invalid-signature' });
	});

	it.each([
		[90, [0, 1, -1, 0, 156.066, 79.2]],
		[180, [-1, 0, 0, -1, 550.8, 201.066]],
		[270, [0, -1, 1, 0, 455.934, 712.8]]
	] as const)(
		'orients text with the visual viewport on a %i-degree page',
		async (rotation, expectedMatrix) => {
			const source = await sourceWithRotation(rotation);
			const form = definition([
				{
					id: 'rotated-id',
					name: 'rotated',
					type: 'text',
					page: 1,
					rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
					required: true
				}
			]);

			const output = await exportFlattenedPdf(source, form, {
				rotated: { type: 'text', value: 'Rotated' }
			});
			const document = await PDFDocument.load(output);
			const matrices = textMatrices(contentForPage(document, 0));

			expect(matrices).toHaveLength(1);
			expect(matrices[0]).toEqual(expectedMatrix.map((value) => expect.closeTo(value, 5)));
		}
	);

	it.each([
		[0, [1, 0, 0, 1, 50, 406.934], [1, 0, 0, 1, 50, 380], [1, 0, 0, 1, 0, 0]],
		[90, [0, 1, -1, 0, 113.066, 170], [1, 0, 0, 1, 140, 190], [0, 1, -1, 0, 0, 0]],
		[180, [-1, 0, 0, -1, 290, 253.066], [1, 0, 0, 1, 290, 280], [-1, 0, 0, -1, 0, 0]],
		[270, [0, -1, 1, 0, 226.934, 490], [1, 0, 0, 1, 200, 470], [0, -1, 1, 0, 0, 0]]
	] as const)(
		'places text and signatures against the PDF.js-visible crop box on a %i-degree page',
		async (rotation, expectedText, expectedImageTranslation, expectedImageRotation) => {
			const source = await sourceWithVisibleBox(rotation);
			const rect = { x: 0.1, y: 0.2, width: 0.4, height: 0.2 };
			const form = definition([
				{
					id: 'cropped-text-id',
					name: 'cropped_text',
					type: 'text',
					page: 1,
					rect,
					required: true
				},
				{
					id: 'cropped-signature-id',
					name: 'cropped_signature',
					type: 'signature',
					page: 1,
					rect,
					required: true
				}
			]);

			const output = await exportFlattenedPdf(source, form, {
				cropped_text: { type: 'text', value: 'Crop' },
				cropped_signature: { type: 'signature', image: TWO_BY_ONE_PNG }
			});
			const document = await PDFDocument.load(output);
			const content = contentForPage(document, 0);
			const text = textMatrices(content);
			const image = imageTransformBlocks(content);

			expect(text).toHaveLength(1);
			expect(text[0]).toEqual(expectedText.map((value) => expect.closeTo(value, 5)));
			expect(image).toHaveLength(1);
			expect(image[0][0]).toEqual(
				expectedImageTranslation.map((value) => expect.closeTo(value, 5))
			);
			expect(image[0][1]).toEqual(expectedImageRotation.map((value) => expect.closeTo(value, 5)));
			expect(image[0][2]).toEqual([120, 0, 0, 60, 0, 0].map((value) => expect.closeTo(value, 5)));
		}
	);

	it.each([
		[90, [1, 0, 0, 1, 183.6, 136.8], [0, 1, -1, 0, 0, 0], [122.4, 0, 0, 61.2, 0, 0]],
		[180, [1, 0, 0, 1, 538.2, 237.6], [-1, 0, 0, -1, 0, 0], [158.4, 0, 0, 79.2, 0, 0]],
		[270, [1, 0, 0, 1, 428.4, 655.2], [0, -1, 1, 0, 0, 0], [122.4, 0, 0, 61.2, 0, 0]]
	] as const)(
		'orients and aspect-fits a signature in the visual viewport on a %i-degree page',
		async (rotation, expectedTranslation, expectedRotation, expectedScale) => {
			const source = await sourceWithRotation(rotation);
			const form = definition([
				{
					id: 'rotated-signature-id',
					name: 'rotated_signature',
					type: 'signature',
					page: 1,
					rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
					required: true
				}
			]);

			const output = await exportFlattenedPdf(source, form, {
				rotated_signature: { type: 'signature', image: TWO_BY_ONE_PNG }
			});
			const document = await PDFDocument.load(output);
			const transforms = imageTransformBlocks(contentForPage(document, 0));

			expect(transforms).toHaveLength(1);
			expect(transforms[0][0]).toEqual(
				expectedTranslation.map((value) => expect.closeTo(value, 5))
			);
			expect(transforms[0][1]).toEqual(expectedRotation.map((value) => expect.closeTo(value, 5)));
			expect(transforms[0][2]).toEqual(expectedScale.map((value) => expect.closeTo(value, 5)));
		}
	);

	it('keeps descender-bearing glyph bounds inside a tightly fitted field', async () => {
		const source = await sourceWithRotation(0);
		const form = definition([
			{
				id: 'descenders-id',
				name: 'descenders',
				type: 'text',
				page: 1,
				rect: { x: 0.1, y: 0.2, width: 0.5, height: 7.5 / 792 },
				required: true
			}
		]);

		const output = await exportFlattenedPdf(source, form, {
			descenders: { type: 'text', value: 'gyp' }
		});
		const document = await PDFDocument.load(output);
		const content = contentForPage(document, 0);
		const sizeMatch = content.match(/\/Helvetica-\d+ ([\d.]+) Tf/);
		const matrix = textMatrices(content)[0];
		const fontSize = Number(sizeMatch?.[1]);
		const glyphBottom = matrix[5] - fontSize * 0.207;
		const glyphTop = matrix[5] + fontSize * 0.718;

		expect(fontSize).toBeCloseTo(7.5 / 0.925, 5);
		expect(glyphBottom).toBeGreaterThanOrEqual(626.1);
		expect(glyphTop).toBeLessThanOrEqual(633.6);
	});

	it('shrinks text below 12pt while keeping it at or above 8pt when it fits', async () => {
		const form = definition([
			{
				id: 'fitted-id',
				name: 'fitted',
				type: 'text',
				page: 1,
				rect: { x: 0.1, y: 0.2, width: 0.1, height: 0.05 },
				required: true
			}
		]);

		const output = await exportFlattenedPdf(fixture, form, {
			fitted: { type: 'text', value: 'Moderately long' }
		});
		const document = await PDFDocument.load(output);
		const sizes = [...contentForPage(document, 0).matchAll(/\/Helvetica-\d+ ([\d.]+) Tf/g)].map(
			(match) => Number(match[1])
		);
		const fittedSize = sizes.at(-1);

		expect(fittedSize).toBeDefined();
		expect(fittedSize).toBeGreaterThanOrEqual(8);
		expect(fittedSize).toBeLessThan(12);
	});

	it.each([
		['width', { x: 0.1, y: 0.2, width: 0.02, height: 0.1 }, 'Too wide'],
		['height', { x: 0.1, y: 0.2, width: 0.5, height: 0.005 }, 'Tall']
	] as const)('rejects text that cannot fit the field %s at 8pt', async (_axis, rect, value) => {
		const form = definition([
			{
				id: 'overflow-id',
				name: 'overflow',
				type: 'text',
				page: 1,
				rect,
				required: true
			}
		]);

		const error = await exportFlattenedPdf(fixture, form, {
			overflow: { type: 'text', value }
		}).catch((reason: unknown) => reason);

		expect(error).toBeInstanceOf(BionicSignError);
		expect(error).toMatchObject({ code: 'export-value-overflow' });
	});

	it('propagates an already-aborted signal reason without changing it', async () => {
		const controller = new AbortController();
		const reason = new DOMException('Export replaced.', 'AbortError');
		controller.abort(reason);

		const error = await exportFlattenedPdf(
			fixture,
			definition([]),
			{},
			{
				signal: controller.signal
			}
		).catch((caught: unknown) => caught);

		expect(error).toBe(reason);
	});

	it('observes an abort that occurs while PDF loading is in flight', async () => {
		const controller = new AbortController();
		const reason = new DOMException('Export cancelled.', 'AbortError');

		const promise = exportFlattenedPdf(
			fixture,
			definition([]),
			{},
			{
				signal: controller.signal
			}
		);
		controller.abort(reason);

		await expect(promise).rejects.toBe(reason);
	});

	it('maps a generic pdf-lib load failure to a stable typed error', async () => {
		const error = await exportFlattenedPdf(new Uint8Array([1, 2, 3]), definition([]), {}).catch(
			(reason: unknown) => reason
		);

		expect(error).toBeInstanceOf(BionicSignError);
		expect(error).toMatchObject({ code: 'export-pdf-load' });
	});

	it('maps an encrypted pdf-lib load failure to the shared encrypted-PDF code', async () => {
		const cause = Object.assign(new Error('encrypted'), { name: 'EncryptedPDFError' });
		vi.spyOn(PDFDocument, 'load').mockRejectedValueOnce(cause);

		const error = await exportFlattenedPdf(fixture, definition([]), {}).catch(
			(reason: unknown) => reason
		);

		expect(error).toBeInstanceOf(BionicSignError);
		expect(error).toMatchObject({ code: 'pdf-encrypted', cause });
	});

	it('maps a generic pdf-lib save failure to a stable typed error', async () => {
		const cause = new Error('save failed');
		vi.spyOn(PDFDocument.prototype, 'save').mockRejectedValueOnce(cause);

		const error = await exportFlattenedPdf(fixture, definition([]), {}).catch(
			(reason: unknown) => reason
		);

		expect(error).toBeInstanceOf(BionicSignError);
		expect(error).toMatchObject({ code: 'export-pdf-save', cause });
	});
});
