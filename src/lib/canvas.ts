const MAX_DEVICE_PIXEL_RATIO = 2;
const MAX_BACKING_DIMENSION = 8192;
const MAX_BACKING_PIXELS = 16_777_216;

export function canvasBackingScale(
	width: number,
	height: number,
	devicePixelRatio: number
): number {
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		return 1;
	}

	const requestedScale =
		Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
	const dimensionScale = Math.min(MAX_BACKING_DIMENSION / width, MAX_BACKING_DIMENSION / height);
	let scale = Math.min(
		requestedScale,
		MAX_DEVICE_PIXEL_RATIO,
		dimensionScale,
		Math.sqrt(MAX_BACKING_PIXELS / (width * height))
	);
	if (Math.ceil(width * scale) * Math.ceil(height * scale) <= MAX_BACKING_PIXELS) {
		return scale;
	}

	let lower = 0;
	let upper = scale;
	for (let iteration = 0; iteration < 32; iteration += 1) {
		const candidate = (lower + upper) / 2;
		if (Math.ceil(width * candidate) * Math.ceil(height * candidate) <= MAX_BACKING_PIXELS) {
			lower = candidate;
		} else {
			upper = candidate;
		}
	}
	scale = lower;
	return scale;
}
