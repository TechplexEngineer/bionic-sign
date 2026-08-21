import { describe, expect, it } from 'vitest';

import { canvasBackingScale } from './canvas.js';

describe('canvasBackingScale', () => {
	it('caps high device-pixel ratios without changing CSS geometry', () => {
		expect(canvasBackingScale(320, 180, 8)).toBeLessThanOrEqual(2);
	});

	it('bounds backing dimensions and total pixels for very large CSS canvases', () => {
		const scale = canvasBackingScale(20_000, 10_000, 4);
		const width = Math.ceil(20_000 * scale);
		const height = Math.ceil(10_000 * scale);

		expect(width).toBeLessThanOrEqual(8192);
		expect(height).toBeLessThanOrEqual(8192);
		expect(width * height).toBeLessThanOrEqual(16_777_216);
	});
});
