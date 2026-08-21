import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { FieldRect, FormField } from '../types.js';
import FieldOverlay from './FieldOverlay.svelte';

function textField(rect: FieldRect = { x: 0.1, y: 0.2, width: 0.3, height: 0.2 }): FormField {
	return {
		id: 'student-id',
		name: 'student_name',
		type: 'text',
		page: 1,
		rect,
		required: true
	};
}

function dispatchPointer(
	element: Element,
	type: 'pointerdown' | 'pointermove' | 'pointerup',
	x: number,
	y: number,
	pointerId = 7
): void {
	element.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			button: 0,
			clientX: x,
			clientY: y,
			pointerId
		})
	);
}

describe('FieldOverlay', () => {
	it('exposes labeled focusable controls and selects the field', async () => {
		const onselect = vi.fn();
		render(FieldOverlay, { field: textField(), width: 200, height: 100, onselect });
		const overlay = page.getByRole('button', { name: 'Text field "student_name"' });

		await expect.element(overlay).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Resize field "student_name"' }))
			.toBeVisible();
		expect((overlay.element() as HTMLElement).tabIndex).toBe(0);
		(overlay.element() as HTMLElement).focus();
		await expect.element(overlay).toHaveFocus();
		expect(getComputedStyle(overlay.element()).outlineStyle).toBe('solid');

		await overlay.click();

		expect(onselect).toHaveBeenCalledWith('student-id');
		await expect.element(overlay).toHaveFocus();
	});

	it('captures pointer drags and corner resizes as normalized rectangles', () => {
		const onrectchange = vi.fn();
		render(FieldOverlay, {
			field: textField(),
			width: 200,
			height: 100,
			onrectchange
		});
		const overlay = page.getByRole('button', { name: 'Text field "student_name"' }).element();
		const resize = page.getByRole('button', { name: 'Resize field "student_name"' }).element();
		const captureDrag = vi.spyOn(overlay, 'setPointerCapture').mockImplementation(() => undefined);
		const releaseDrag = vi
			.spyOn(overlay, 'releasePointerCapture')
			.mockImplementation(() => undefined);
		vi.spyOn(overlay, 'hasPointerCapture').mockReturnValue(true);
		const captureResize = vi.spyOn(resize, 'setPointerCapture').mockImplementation(() => undefined);

		dispatchPointer(overlay, 'pointerdown', 20, 20);
		dispatchPointer(overlay, 'pointermove', 40, 30);
		dispatchPointer(overlay, 'pointerup', 40, 30);

		expect(captureDrag).toHaveBeenCalledWith(7);
		expect(releaseDrag).toHaveBeenCalledWith(7);
		expect(onrectchange).toHaveBeenCalledWith({ x: 0.2, y: 0.3, width: 0.3, height: 0.2 });

		onrectchange.mockClear();
		dispatchPointer(resize, 'pointerdown', 80, 40);
		dispatchPointer(resize, 'pointermove', 120, 60);

		expect(captureResize).toHaveBeenCalledWith(7);
		expect(onrectchange).toHaveBeenCalledWith({ x: 0.1, y: 0.2, width: 0.5, height: 0.4 });
	});

	it('moves, resizes, clamps, and deletes from the keyboard without mutating the field', async () => {
		const field = textField({ x: 0.69, y: 0.79, width: 0.3, height: 0.2 });
		const onrectchange = vi.fn();
		const ondelete = vi.fn();
		render(FieldOverlay, { field, width: 200, height: 100, onrectchange, ondelete });
		const overlay = page.getByRole('button', { name: 'Text field "student_name"' });

		await overlay.click();
		await userEvent.keyboard('{ArrowRight}');
		expect(onrectchange).toHaveBeenLastCalledWith({ x: 0.7, y: 0.79, width: 0.3, height: 0.2 });

		await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
		expect(onrectchange).toHaveBeenLastCalledWith({ x: 0.69, y: 0.79, width: 0.31, height: 0.2 });

		await userEvent.keyboard('{Shift>}{ArrowUp}{/Shift}');
		expect(onrectchange).toHaveBeenLastCalledWith({ x: 0.69, y: 0.79, width: 0.3, height: 0.19 });

		await userEvent.keyboard('{Delete}');
		expect(ondelete).toHaveBeenCalledWith('student-id');
		expect(field.rect).toEqual({ x: 0.69, y: 0.79, width: 0.3, height: 0.2 });
	});
});
