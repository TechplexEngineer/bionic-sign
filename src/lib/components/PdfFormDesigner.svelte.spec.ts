import { createRawSnippet } from 'svelte';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { FormDefinition } from '../types.js';
import PdfFormDesigner from './PdfFormDesigner.svelte';

const pdfMocks = vi.hoisted(() => ({
	getPdfJs: vi.fn(),
	loadPdfBytes: vi.fn()
}));

vi.mock('../pdf/runtime.js', () => ({ getPdfJs: pdfMocks.getPdfJs }));
vi.mock('../pdf/source.js', () => ({ loadPdfBytes: pdfMocks.loadPdfBytes }));

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});

	return { promise, resolve, reject };
}

function createPdfPage(pageNumber: number) {
	const render = vi.fn(
		() => ({ promise: Promise.resolve(), cancel: vi.fn() }) as unknown as RenderTask
	);
	const getViewport = vi.fn(({ scale }: { scale: number }) => ({
		width: pageNumber * 200 * scale,
		height: pageNumber * 300 * scale
	}));

	return { getViewport, page: { getViewport, render } as unknown as PDFPageProxy };
}

function usePdf(pageCount = 2) {
	const pages = Array.from({ length: pageCount }, (_, index) => createPdfPage(index + 1));
	const document = {
		getPage: vi.fn((pageNumber: number) => Promise.resolve(pages[pageNumber - 1].page)),
		numPages: pages.length
	} as unknown as PDFDocumentProxy;
	pdfMocks.getPdfJs.mockResolvedValue({
		getDocument: vi.fn(() => ({ destroy: vi.fn(), promise: Promise.resolve(document) }))
	});

	return pages;
}

function definition(): FormDefinition {
	return {
		version: 1,
		fields: [
			{
				id: 'student-id',
				name: 'student_name',
				type: 'text',
				page: 1,
				rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
				required: true
			},
			{
				id: 'signature-id',
				name: 'parent_signature',
				type: 'signature',
				page: 2,
				rect: { x: 0.2, y: 0.3, width: 0.4, height: 0.15 },
				required: true
			}
		]
	};
}

function invalidDefinition(
	kind: 'duplicate-id' | 'duplicate-name' | 'malformed-rect'
): FormDefinition {
	const invalid = definition();
	if (kind === 'duplicate-id') {
		(invalid.fields[1] as { id: string }).id = invalid.fields[0].id;
	}
	if (kind === 'duplicate-name') invalid.fields[1].name = invalid.fields[0].name;
	if (kind === 'malformed-rect') {
		invalid.fields[0].rect = { x: 0.9, y: 0.2, width: 0.3, height: 0.1 };
	}
	return invalid;
}

describe('PdfFormDesigner', () => {
	beforeEach(async () => {
		await page.viewport(1000, 800);
		pdfMocks.getPdfJs.mockReset();
		pdfMocks.loadPdfBytes.mockReset();
		pdfMocks.loadPdfBytes.mockResolvedValue(new Uint8Array([7, 8, 9]));
	});

	afterEach(async () => {
		await page.viewport(1000, 800);
	});

	it.each(['duplicate-id', 'duplicate-name', 'malformed-rect'] as const)(
		'reports and recovers from a %s definition at the prop boundary',
		async (kind) => {
			usePdf();
			const onerror = vi.fn();
			const source = new Uint8Array([1]);
			const result = render(PdfFormDesigner, {
				source,
				definition: invalidDefinition(kind),
				onerror
			});

			await expect.element(page.getByRole('alert')).toBeVisible();
			expect(onerror).toHaveBeenCalledWith(
				expect.objectContaining({ code: 'invalid-form-definition' })
			);
			await expect.element(page.getByRole('button', { name: 'Add text field' })).toBeDisabled();

			await result.rerender({ source, definition: definition(), onerror });
			await expect
				.element(page.getByRole('button', { name: 'Text field "student_name"' }))
				.toBeVisible();
			await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
		}
	);

	it('rejects fields beyond the loaded document page count and recovers after correction', async () => {
		usePdf(1);
		const onerror = vi.fn();
		const source = new Uint8Array([1]);
		const result = render(PdfFormDesigner, {
			source,
			definition: definition(),
			onerror
		});

		await vi.waitFor(() =>
			expect(onerror).toHaveBeenCalledWith(
				expect.objectContaining({ code: 'definition-page-out-of-range' })
			)
		);
		await expect.element(page.getByRole('button', { name: 'Add text field' })).toBeDisabled();

		await result.rerender({ source, definition: { version: 1, fields: [] }, onerror });
		await expect.element(page.getByRole('button', { name: 'Add text field' })).toBeEnabled();
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
	});

	it('composes the three panes, selects pages, and adds immediately selected fields immutably', async () => {
		usePdf();
		const sourceDefinition = definition();
		const original = structuredClone(sourceDefinition);
		const emitted: FormDefinition[] = [];
		const source = new Uint8Array([1]);
		const requestInit = { headers: { Authorization: 'Bearer test' } };
		const ondefinitionchange = vi.fn((next: FormDefinition) => {
			emitted.push(structuredClone(next));
			next.fields[0].name = 'mutated_by_host';
			next.fields[0].rect.x = 0.99;
			next.fields.length = 0;
		});
		const result = render(PdfFormDesigner, {
			source,
			definition: sourceDefinition,
			requestInit,
			ondefinitionchange
		});

		await expect
			.element(page.getByRole('complementary', { name: 'Fields and pages' }))
			.toBeVisible();
		await expect.element(page.getByRole('main', { name: 'PDF form canvas' })).toBeVisible();
		await expect
			.element(page.getByRole('complementary', { name: 'Field properties' }))
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Page 2' })).toBeVisible();
		expect(pdfMocks.loadPdfBytes).toHaveBeenCalledWith(
			source,
			expect.objectContaining({ requestInit })
		);

		await page.getByRole('button', { name: 'Page 2' }).click();
		await expect
			.element(page.getByLabelText('PDF page 2').element().parentElement!)
			.toHaveAttribute('aria-current', 'page');
		await page.getByRole('button', { name: 'Add text field' }).click();

		await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveValue('text_1');
		await expect
			.element(page.getByRole('button', { name: 'Text field "text_1"' }))
			.toHaveAttribute('aria-pressed', 'true');
		expect(emitted.at(-1)?.fields.at(-1)).toEqual(
			expect.objectContaining({ name: 'text_1', page: 2, type: 'text', required: true })
		);
		expect(sourceDefinition).toEqual(original);
		await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveValue('text_1');

		await page.getByRole('button', { name: 'Add signature field' }).click();
		await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveValue('signature_1');
		expect(result.component.validate()).toEqual({ valid: true, issues: [] });

		const replacement: FormDefinition = {
			version: 1,
			fields: [
				{
					id: 'replacement-id',
					name: 'replacement',
					type: 'text',
					page: 1,
					rect: { x: 0.3, y: 0.3, width: 0.2, height: 0.1 },
					required: true
				}
			]
		};
		await result.rerender({ source, definition: replacement, requestInit, ondefinitionchange });
		await expect
			.element(page.getByRole('button', { name: 'Text field "replacement"' }))
			.toBeVisible();
		replacement.fields[0].name = 'mutated_after_render';
		await expect
			.element(page.getByRole('button', { name: 'Text field "replacement"' }))
			.toBeVisible();
	});

	it('adds a dropdown and configures its string options', async () => {
		usePdf();
		const changes: FormDefinition[] = [];
		render(PdfFormDesigner, {
			source: new Uint8Array([1]),
			definition: { version: 1, fields: [] },
			ondefinitionchange: (next) => changes.push(next)
		});

		await page.getByRole('button', { name: 'Add dropdown field' }).click();
		await expect.element(page.getByRole('textbox', { name: 'Options' })).toHaveValue('Option 1');
		await page.getByRole('textbox', { name: 'Options' }).fill('Freshman\nSophomore');

		expect(changes.at(-1)?.fields[0]).toEqual(
			expect.objectContaining({
				type: 'dropdown',
				options: ['Freshman', 'Sophomore']
			})
		);
	});

	it('edits every property, rejects duplicate names inline, deletes, and preserves geometry across zoom', async () => {
		const pages = usePdf();
		const changes: FormDefinition[] = [];
		const result = render(PdfFormDesigner, {
			source: new Uint8Array([1]),
			definition: definition(),
			ondefinitionchange: (next) => changes.push(next)
		});
		await expect
			.element(page.getByRole('button', { name: 'Text field "student_name"' }))
			.toBeVisible();
		await page.getByRole('button', { name: 'Text field "student_name"' }).click();

		await page.getByRole('textbox', { name: 'Name' }).fill('parent_signature');
		await expect.element(page.getByRole('alert')).toHaveTextContent('unique');
		expect(result.component.validate()).toEqual({
			valid: false,
			issues: [
				expect.objectContaining({ code: 'invalid-field-name', fieldName: 'parent_signature' })
			]
		});

		await page.getByRole('textbox', { name: 'Name' }).fill('student');
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
		await page.getByRole('checkbox', { name: 'Required' }).click();
		await page.getByRole('spinbutton', { name: 'X' }).fill('0.25');
		await page.getByRole('spinbutton', { name: 'Y' }).fill('0.35');
		await page.getByRole('spinbutton', { name: 'Width' }).fill('0.45');
		await page.getByRole('spinbutton', { name: 'Height' }).fill('0.2');

		await vi.waitFor(() => {
			expect(changes.at(-1)?.fields[0]).toEqual({
				id: 'student-id',
				name: 'student',
				type: 'text',
				page: 1,
				rect: { x: 0.25, y: 0.35, width: 0.45, height: 0.2 },
				required: false
			});
		});
		const beforeZoom = structuredClone(changes.at(-1)!);
		const overlay = page.getByRole('group', { name: 'Field "student" controls' }).element();
		expect((overlay as HTMLElement).style.left).toBe('50px');

		await page.getByRole('button', { name: 'Zoom in' }).click();
		await vi.waitFor(() => expect(pages[0].getViewport).toHaveBeenCalledWith({ scale: 1.25 }));
		expect((overlay as HTMLElement).style.left).toBe('62.5px');
		expect(changes.at(-1)).toEqual(beforeZoom);

		await page.getByRole('button', { name: 'Delete field' }).click();
		await expect.element(page.getByText('Select a field to edit its properties.')).toBeVisible();
		expect(changes.at(-1)?.fields.map(({ id }) => id)).toEqual(['signature-id']);
	});

	it('keeps zoomed PDF overflow inside the center document pane', async () => {
		usePdf();
		const result = render(PdfFormDesigner, {
			source: new Uint8Array([1]),
			definition: definition()
		});
		await expect.element(page.getByLabelText('PDF page 2')).toBeVisible();

		const designer = result.container.querySelector<HTMLElement>('.pdf-form-designer')!;
		const documentPane = page.getByRole('main', { name: 'PDF form canvas' }).element();
		const initialDesignerHeight = designer.getBoundingClientRect().height;

		for (let index = 0; index < 4; index += 1) {
			await page.getByRole('button', { name: 'Zoom in' }).click();
		}

		await vi.waitFor(() =>
			expect(documentPane.scrollHeight).toBeGreaterThan(documentPane.clientHeight)
		);
		expect(designer.getBoundingClientRect().height).toBe(initialDesignerHeight);
		documentPane.scrollTop = 100;
		expect(documentPane.scrollTop).toBe(100);
	});

	it('synchronizes a rejected name draft when a valid definition prop replaces it', async () => {
		usePdf();
		const source = new Uint8Array([1]);
		const result = render(PdfFormDesigner, {
			source,
			definition: definition()
		});
		await expect
			.element(page.getByRole('button', { name: 'Text field "student_name"' }))
			.toBeVisible();
		await page.getByRole('button', { name: 'Text field "student_name"' }).click();
		await page.getByRole('textbox', { name: 'Name' }).fill('parent_signature');
		await expect.element(page.getByRole('alert')).toHaveTextContent('unique');

		const replacement = definition();
		replacement.fields[0].name = 'student_replaced';
		await result.rerender({ source, definition: replacement });

		await expect
			.element(page.getByRole('textbox', { name: 'Name' }))
			.toHaveValue('student_replaced');
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
		expect(result.component.validate()).toEqual({ valid: true, issues: [] });
	});

	it('clears rejected name state when a required toggle commits the selected stored field', async () => {
		usePdf();
		const result = render(PdfFormDesigner, {
			source: new Uint8Array([1]),
			definition: definition()
		});
		await expect
			.element(page.getByRole('button', { name: 'Text field "student_name"' }))
			.toBeVisible();
		await page.getByRole('button', { name: 'Text field "student_name"' }).click();
		await page.getByRole('textbox', { name: 'Name' }).fill('parent_signature');
		await expect.element(page.getByRole('alert')).toHaveTextContent('unique');

		await page.getByRole('checkbox', { name: 'Required' }).click();

		await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveValue('student_name');
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
		expect(result.component.validate()).toEqual({ valid: true, issues: [] });
	});

	it('clears rejected name state when an exact geometry edit commits the selected stored field', async () => {
		usePdf();
		const result = render(PdfFormDesigner, {
			source: new Uint8Array([1]),
			definition: definition()
		});
		await expect
			.element(page.getByRole('button', { name: 'Text field "student_name"' }))
			.toBeVisible();
		await page.getByRole('button', { name: 'Text field "student_name"' }).click();
		await page.getByRole('textbox', { name: 'Name' }).fill('parent_signature');
		await expect.element(page.getByRole('alert')).toHaveTextContent('unique');

		await page.getByRole('spinbutton', { name: 'X' }).fill('0.25');

		await expect.element(page.getByRole('textbox', { name: 'Name' })).toHaveValue('student_name');
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
		expect(result.component.validate()).toEqual({ valid: true, issues: [] });
	});

	it('provides responsive drawer controls and customizable toolbar, loading, and error snippets', async () => {
		const loadingBytes = deferred<Uint8Array>();
		pdfMocks.loadPdfBytes.mockReturnValueOnce(loadingBytes.promise);
		const toolbar = createRawSnippet(() => ({ render: () => '<button>Save draft</button>' }));
		const loading = createRawSnippet(() => ({
			render: () => '<p role="status">Preparing pages</p>'
		}));
		const error = createRawSnippet<[unknown]>((reason) => ({
			render: () => `<p role="alert">Custom failure: ${String(reason())}</p>`
		}));
		const result = render(PdfFormDesigner, {
			source: new Uint8Array([1]),
			definition: { version: 1, fields: [] },
			toolbar,
			loading,
			error
		});

		await expect.element(page.getByRole('button', { name: 'Save draft' })).toBeVisible();
		await expect.element(page.getByRole('status')).toHaveTextContent('Preparing pages');
		const fieldsPane = result.container.querySelector<HTMLElement>(
			'[aria-label="Fields and pages"]'
		)!;
		await page.viewport(500, 800);
		await expect.element(page.getByRole('button', { name: 'Open fields panel' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Open properties panel' })).toBeVisible();
		await expect.element(fieldsPane).not.toBeVisible();
		await page.getByRole('button', { name: 'Open fields panel' }).click();
		await expect.element(fieldsPane).toBeVisible();
		await page.getByRole('button', { name: 'Close fields panel' }).click();
		await expect.element(fieldsPane).not.toBeVisible();
		await page.getByRole('button', { name: 'Open properties panel' }).click();
		await expect
			.element(page.getByRole('complementary', { name: 'Field properties' }))
			.toBeVisible();

		loadingBytes.reject(new Error('broken PDF'));
		await result.unmount();
		pdfMocks.loadPdfBytes.mockRejectedValueOnce(new Error('broken PDF'));
		const onerror = vi.fn();
		render(PdfFormDesigner, {
			source: new Uint8Array([2]),
			definition: { version: 1, fields: [] },
			error,
			onerror
		});
		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent('Custom failure: Error: broken PDF');
		expect(onerror).toHaveBeenCalledWith(expect.objectContaining({ message: 'broken PDF' }));
	});
});
