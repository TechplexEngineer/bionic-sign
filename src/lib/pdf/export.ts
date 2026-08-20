import { degrees, PDFDocument, type PDFImage, StandardFonts } from 'pdf-lib';

import { normalizedToPdf, type PdfPageDimensions, type PdfRect } from '../coordinates.js';
import {
	BionicSignError,
	type ExportPdfOptions,
	type FormDefinition,
	type FormField,
	type FormValues,
	type SignatureValue,
	type TextValue
} from '../types.js';

const MAX_TEXT_SIZE = 12;
const MIN_TEXT_SIZE = 8;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const PNG_DATA_URL_PATTERN =
	/^data:image\/png;base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/;

interface VisualFieldFrame {
	width: number;
	height: number;
	rotation: ReturnType<typeof degrees>;
	toPdf(x: number, y: number): { x: number; y: number };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (!signal?.aborted) return;
	if (signal.reason !== undefined) throw signal.reason;

	const error = new Error('The operation was aborted.');
	error.name = 'AbortError';
	throw error;
}

function fieldError(
	code: string,
	field: FormField,
	message: string,
	cause?: unknown
): BionicSignError {
	return new BionicSignError(
		code,
		`Field "${field.name}" ${message}`,
		cause === undefined ? undefined : { cause }
	);
}

function isTextValue(value: FormValues[string]): value is TextValue {
	return value.type === 'text' && typeof value.value === 'string';
}

function isSignatureValue(value: FormValues[string]): value is SignatureValue {
	return value.type === 'signature' && typeof value.image === 'string';
}

function isEmptyValue(field: FormField, value: FormValues[string]): boolean {
	return field.type === 'text'
		? isTextValue(value) && value.value.trim().length === 0
		: isSignatureValue(value) && value.image.length === 0;
}

function assertValueType(field: FormField, value: FormValues[string]): void {
	const matches = field.type === 'text' ? isTextValue(value) : isSignatureValue(value);
	if (!matches) {
		throw fieldError('export-value-type', field, `requires a ${field.type} value`);
	}
}

function pageDimensions(page: ReturnType<PDFDocument['getPage']>): PdfPageDimensions {
	const { width, height } = page.getSize();
	const angle = ((page.getRotation().angle % 360) + 360) % 360;
	if (angle !== 0 && angle !== 90 && angle !== 180 && angle !== 270) {
		throw new RangeError(`Unsupported PDF page rotation: ${angle}`);
	}
	return { width, height, rotation: angle };
}

function visualFieldFrame(
	rect: PdfRect,
	rotation: PdfPageDimensions['rotation']
): VisualFieldFrame {
	switch (rotation) {
		case 0:
			return {
				width: rect.width,
				height: rect.height,
				rotation: degrees(0),
				toPdf: (x, y) => ({ x: rect.x + x, y: rect.y + y })
			};
		case 90:
			return {
				width: rect.height,
				height: rect.width,
				rotation: degrees(90),
				toPdf: (x, y) => ({ x: rect.x + rect.width - y, y: rect.y + x })
			};
		case 180:
			return {
				width: rect.width,
				height: rect.height,
				rotation: degrees(180),
				toPdf: (x, y) => ({
					x: rect.x + rect.width - x,
					y: rect.y + rect.height - y
				})
			};
		case 270:
			return {
				width: rect.height,
				height: rect.width,
				rotation: degrees(270),
				toPdf: (x, y) => ({ x: rect.x + y, y: rect.y + rect.height - x })
			};
	}
}

function decodePngDataUrl(field: FormField, dataUrl: string): Uint8Array {
	const match = PNG_DATA_URL_PATTERN.exec(dataUrl);
	if (!match || match[1].length === 0) {
		throw fieldError('export-invalid-signature', field, 'must contain a PNG data URL');
	}

	let binary: string;
	try {
		binary = atob(match[1]);
	} catch (cause) {
		throw fieldError('export-invalid-signature', field, 'contains invalid PNG data', cause);
	}

	const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
	if (PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
		throw fieldError('export-invalid-signature', field, 'contains invalid PNG data');
	}
	return bytes;
}

async function embedSignature(
	document: PDFDocument,
	field: FormField,
	dataUrl: string,
	cache: Map<string, PDFImage>,
	signal: AbortSignal | undefined
): Promise<PDFImage> {
	const cached = cache.get(dataUrl);
	if (cached) return cached;

	const bytes = decodePngDataUrl(field, dataUrl);
	throwIfAborted(signal);
	try {
		const image = await document.embedPng(bytes);
		throwIfAborted(signal);
		cache.set(dataUrl, image);
		return image;
	} catch (cause) {
		if (cause instanceof BionicSignError) throw cause;
		throwIfAborted(signal);
		throw fieldError('export-invalid-signature', field, 'contains invalid PNG data', cause);
	}
}

export async function exportFlattenedPdf(
	sourceBytes: Uint8Array,
	definition: FormDefinition,
	values: FormValues,
	options: ExportPdfOptions = {}
): Promise<Uint8Array> {
	const signal = options.signal;
	throwIfAborted(signal);

	const document = await PDFDocument.load(sourceBytes.slice());
	throwIfAborted(signal);
	const pages = document.getPages();

	for (const field of definition.fields) {
		if (!Number.isInteger(field.page) || field.page < 1 || field.page > pages.length) {
			throw fieldError(
				'export-page-out-of-range',
				field,
				`references page ${field.page}, but the PDF has ${pages.length} pages`
			);
		}
	}

	const font = await document.embedFont(StandardFonts.Helvetica);
	throwIfAborted(signal);
	const images = new Map<string, PDFImage>();

	for (const field of definition.fields) {
		throwIfAborted(signal);
		const value = values[field.name];
		if (value === undefined) {
			if (field.required) {
				throw fieldError('export-required-value', field, 'requires a value');
			}
			continue;
		}

		assertValueType(field, value);
		if (isEmptyValue(field, value)) {
			if (field.required) {
				throw fieldError('export-required-value', field, 'requires a value');
			}
			continue;
		}

		const page = pages[field.page - 1];
		const dimensions = pageDimensions(page);
		const rect = normalizedToPdf(field.rect, dimensions);
		const frame = visualFieldFrame(rect, dimensions.rotation);

		if (field.type === 'text' && isTextValue(value)) {
			const widthAtOnePoint = font.widthOfTextAtSize(value.value, 1);
			const heightAtOnePoint = font.heightAtSize(1, { descender: true });
			const widthLimitedSize =
				widthAtOnePoint === 0 ? MAX_TEXT_SIZE : frame.width / widthAtOnePoint;
			const fittedSize = Math.min(MAX_TEXT_SIZE, widthLimitedSize, frame.height / heightAtOnePoint);

			if (fittedSize < MIN_TEXT_SIZE) {
				throw fieldError(
					'export-value-overflow',
					field,
					`cannot fit its text value at the minimum ${MIN_TEXT_SIZE}pt size`
				);
			}

			const textHeight = font.heightAtSize(fittedSize, { descender: true });
			const ascenderHeight = font.heightAtSize(fittedSize, { descender: false });
			const descent = textHeight - ascenderHeight;
			const baseline = (frame.height - textHeight) / 2 + descent;
			const position = frame.toPdf(0, baseline);
			page.drawText(value.value, {
				x: position.x,
				y: position.y,
				size: fittedSize,
				font,
				rotate: frame.rotation
			});
			continue;
		}

		if (field.type === 'signature' && isSignatureValue(value)) {
			const image = await embedSignature(document, field, value.image, images, signal);
			const scale = Math.min(frame.width / image.width, frame.height / image.height);
			const width = image.width * scale;
			const height = image.height * scale;
			const position = frame.toPdf((frame.width - width) / 2, (frame.height - height) / 2);
			page.drawImage(image, {
				x: position.x,
				y: position.y,
				width,
				height,
				rotate: frame.rotation
			});
		}
	}

	throwIfAborted(signal);
	const output = await document.save();
	throwIfAborted(signal);
	return output;
}
