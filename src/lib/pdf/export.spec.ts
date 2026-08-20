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
import { beforeAll, describe, expect, it } from 'vitest';

import type { FormDefinition, FormValues } from '../types.js';
import { BionicSignError } from '../types.js';
import { exportFlattenedPdf } from './export.js';

const TWO_BY_ONE_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFElEQVR42mP8z8Dwn4GBgYGJAQoAHgAD/VoS8AAAAABJRU5ErkJggg==';
const ONE_BY_ONE_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2+XkAAAAASUVORK5CYII=';

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

function imageMatrices(content: string): number[][] {
	return [...content.matchAll(/q\s+([\s\S]*?)\/\S+ Do\s+Q/g)].map((block) => {
		const matrices = [
			...block[1].matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) cm/g)
		].map((match) => match.slice(1).map(Number));
		const translation = matrices[0];
		const scale = matrices[2];
		return [scale[0], scale[3], translation[4], translation[5]];
	});
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

	it('places text using the source page rotation', async () => {
		const sourceDocument = await PDFDocument.create();
		const page = sourceDocument.addPage([612, 792]);
		page.setRotation(degrees(90));
		const source = await sourceDocument.save();
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
		const content = contentForPage(document, 0);
		const matrix = content.match(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm/);

		expect(matrix).not.toBeNull();
		expect(Number(matrix?.[1])).toBeCloseTo(122.4, 5);
		expect(Number(matrix?.[2])).toBeGreaterThan(79.2);
		expect(Number(matrix?.[2])).toBeLessThan(316.8);
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
});
