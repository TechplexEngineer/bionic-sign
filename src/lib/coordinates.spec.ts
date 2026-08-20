import { describe, expect, it } from 'vitest';
import { normalizedToPdf, normalizedToViewport, viewportToNormalized } from './coordinates.js';

function expectRectCloseTo(
	received: { x: number; y: number; width: number; height: number },
	expected: { x: number; y: number; width: number; height: number }
): void {
	expect(received.x).toBeCloseTo(expected.x, 10);
	expect(received.y).toBeCloseTo(expected.y, 10);
	expect(received.width).toBeCloseTo(expected.width, 10);
	expect(received.height).toBeCloseTo(expected.height, 10);
}

describe('viewport coordinate transformations', () => {
	it('scales an A4 portrait rectangle to viewport pixels', () => {
		expectRectCloseTo(
			normalizedToViewport({ x: 0.1, y: 0.2, width: 0.3, height: 0.1 }, 595.28, 841.89),
			{ x: 59.528, y: 168.378, width: 178.584, height: 84.189 }
		);
	});

	it('scales a landscape rectangle at a non-unit zoom size', () => {
		expect(
			normalizedToViewport({ x: 0.25, y: 0.5, width: 0.5, height: 0.25 }, 1683.78, 1190.56)
		).toEqual({ x: 420.945, y: 595.28, width: 841.89, height: 297.64 });
	});

	it('preserves normalized rectangles through a viewport round trip', () => {
		const original = {
			x: 0.123456789,
			y: 0.987654321,
			width: 0.111111111,
			height: 0.012345679
		};

		const result = viewportToNormalized(
			normalizedToViewport(original, 927.5, 634.25),
			927.5,
			634.25
		);

		expect(result.x).toBeCloseTo(original.x, 8);
		expect(result.y).toBeCloseTo(original.y, 8);
		expect(result.width).toBeCloseTo(original.width, 8);
		expect(result.height).toBeCloseTo(original.height, 8);
	});

	it('keeps edge rectangles at the viewport edges', () => {
		expect(normalizedToViewport({ x: 0, y: 0, width: 1, height: 1 }, 1280, 720)).toEqual({
			x: 0,
			y: 0,
			width: 1280,
			height: 720
		});
		expect(viewportToNormalized({ x: 1280, y: 720, width: 0, height: 0 }, 1280, 720)).toEqual({
			x: 1,
			y: 1,
			width: 0,
			height: 0
		});
	});

	it('rejects zero or negative viewport dimensions', () => {
		expect(() => normalizedToViewport({ x: 0, y: 0, width: 1, height: 1 }, 0, 100)).toThrow(
			/viewport dimensions/i
		);
		expect(() => viewportToNormalized({ x: 0, y: 0, width: 1, height: 1 }, 100, -1)).toThrow(
			/viewport dimensions/i
		);
	});

	it('rejects non-finite viewport dimensions', () => {
		expect(() =>
			normalizedToViewport({ x: 0, y: 0, width: 1, height: 1 }, Number.NaN, 100)
		).toThrow(/viewport dimensions/i);
		expect(() => viewportToNormalized({ x: 0, y: 0, width: 1, height: 1 }, 100, Infinity)).toThrow(
			/viewport dimensions/i
		);
	});
});

describe('PDF coordinate transformations', () => {
	it('converts top-left normalized coordinates to unrotated PDF coordinates', () => {
		expect(
			normalizedToPdf(
				{ x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
				{ width: 600, height: 800, rotation: 0 }
			)
		).toEqual({ x: 60, y: 560, width: 180, height: 80 });
	});

	it.each([
		[90, { x: 120, y: 80, width: 60, height: 240 }],
		[180, { x: 360, y: 160, width: 180, height: 80 }],
		[270, { x: 420, y: 480, width: 60, height: 240 }]
	] as const)('maps a rectangle for a %i-degree rotated page', (rotation, expected) => {
		expectRectCloseTo(
			normalizedToPdf(
				{ x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
				{ width: 600, height: 800, rotation }
			),
			expected
		);
	});

	it('maps edge rectangles correctly on a 270-degree rotated page', () => {
		expect(
			normalizedToPdf(
				{ x: 0, y: 0, width: 1, height: 1 },
				{ width: 600, height: 800, rotation: 270 }
			)
		).toEqual({ x: 0, y: 0, width: 600, height: 800 });
	});

	it('rejects unsupported PDF page rotations', () => {
		expect(() =>
			normalizedToPdf(
				{ x: 0, y: 0, width: 1, height: 1 },
				{ width: 600, height: 800, rotation: 45 as 0 }
			)
		).toThrow(/rotation/i);
	});
});
