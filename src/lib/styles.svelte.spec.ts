import { afterEach, describe, expect, it } from 'vitest';

import './styles.css';

afterEach(() => {
	document.body.replaceChildren();
});

describe('Bionic Sign theme', () => {
	it('applies host color, spacing, and radius overrides inside the package scope', () => {
		const root = document.createElement('section');
		root.className = 'bionic-sign';
		root.style.setProperty('--bionic-sign-surface', 'rgb(1 2 3)');
		root.style.setProperty('--bionic-sign-text', 'rgb(4 5 6)');
		root.style.setProperty('--bionic-sign-spacing', '17px');
		root.style.setProperty('--bionic-sign-radius', '13px');
		document.body.append(root);

		const style = getComputedStyle(root);
		expect(style.backgroundColor).toBe('rgb(1, 2, 3)');
		expect(style.color).toBe('rgb(4, 5, 6)');
		expect(style.gap).toBe('17px');
		expect(style.borderRadius).toBe('13px');
	});
});
