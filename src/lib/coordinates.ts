import type { FieldRect } from './types.js';

export interface PixelRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export type PdfRect = PixelRect;

export interface PdfPageDimensions {
	width: number;
	height: number;
	rotation: 0 | 90 | 180 | 270;
}

function assertViewportDimensions(width: number, height: number): void {
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		throw new RangeError('Viewport dimensions must be greater than zero.');
	}
}

export function normalizedToViewport(rect: FieldRect, width: number, height: number): PixelRect {
	assertViewportDimensions(width, height);

	return {
		x: rect.x * width,
		y: rect.y * height,
		width: rect.width * width,
		height: rect.height * height
	};
}

export function viewportToNormalized(rect: PixelRect, width: number, height: number): FieldRect {
	assertViewportDimensions(width, height);

	return {
		x: rect.x / width,
		y: rect.y / height,
		width: rect.width / width,
		height: rect.height / height
	};
}

export function normalizedToPdf(rect: FieldRect, page: PdfPageDimensions): PdfRect {
	const width = page.width;
	const height = page.height;

	switch (page.rotation) {
		case 0:
			return {
				x: rect.x * width,
				y: (1 - rect.y - rect.height) * height,
				width: rect.width * width,
				height: rect.height * height
			};
		case 90:
			return {
				x: rect.y * width,
				y: rect.x * height,
				width: rect.height * width,
				height: rect.width * height
			};
		case 180:
			return {
				x: (1 - rect.x - rect.width) * width,
				y: rect.y * height,
				width: rect.width * width,
				height: rect.height * height
			};
		case 270:
			return {
				x: (1 - rect.y - rect.height) * width,
				y: (1 - rect.x - rect.width) * height,
				width: rect.height * width,
				height: rect.width * height
			};
		default:
			throw new RangeError(`Unsupported PDF page rotation: ${page.rotation}`);
	}
}
