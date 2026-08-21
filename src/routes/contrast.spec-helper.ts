interface Rgba {
	r: number;
	g: number;
	b: number;
	a: number;
}

function parseCssColor(value: string): Rgba {
	const channels = value.match(/[\d.]+/g)?.map(Number);
	if (!channels || channels.length < 3) {
		throw new Error(`Could not parse computed color: ${value}`);
	}

	return {
		r: channels[0],
		g: channels[1],
		b: channels[2],
		a: channels[3] ?? 1
	};
}

function composite(foreground: Rgba, background: Rgba): Rgba {
	const alpha = foreground.a + background.a * (1 - foreground.a);
	if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };

	return {
		r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
		g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
		b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
		a: alpha
	};
}

function renderedBackground(element: HTMLElement): Rgba {
	const view = element.ownerDocument.defaultView;
	if (!view) throw new Error('Element is not attached to a browser window');

	const layers: Rgba[] = [];
	let current: HTMLElement | null = element;
	while (current) {
		layers.push(parseCssColor(view.getComputedStyle(current).backgroundColor));
		current = current.parentElement;
	}

	return layers.reverse().reduce((background, layer) => composite(layer, background), {
		r: 255,
		g: 255,
		b: 255,
		a: 1
	});
}

function luminance({ r, g, b }: Rgba): number {
	const [red, green, blue] = [r, g, b].map((channel) => {
		const normalized = channel / 255;
		return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
	});

	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function computedContrastRatio(element: HTMLElement): number {
	const view = element.ownerDocument.defaultView;
	if (!view) throw new Error('Element is not attached to a browser window');

	const background = renderedBackground(element);
	const foreground = composite(parseCssColor(view.getComputedStyle(element).color), background);
	const foregroundLuminance = luminance(foreground);
	const backgroundLuminance = luminance(background);

	return (
		(Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
		(Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
	);
}
