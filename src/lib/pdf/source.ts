import { BionicSignError, type PdfLoadOptions, type PdfSource } from '../types.js';

function isAbortError(reason: unknown): boolean {
	return reason instanceof Error && reason.name === 'AbortError';
}

function combineSignals(signals: Array<AbortSignal | null | undefined>): AbortSignal | undefined {
	const activeSignals = signals.filter((signal): signal is AbortSignal => signal != null);
	if (activeSignals.length === 0) return undefined;
	if (activeSignals.length === 1) return activeSignals[0];

	const controller = new AbortController();
	const abort = (signal: AbortSignal) => controller.abort(signal.reason);
	for (const signal of activeSignals) {
		if (signal.aborted) {
			abort(signal);
			break;
		}
		signal.addEventListener('abort', () => abort(signal), { once: true });
	}
	return controller.signal;
}

export async function loadPdfBytes(
	source: PdfSource,
	options: PdfLoadOptions = {}
): Promise<Uint8Array> {
	if (source instanceof Uint8Array) {
		return source.slice();
	}

	if (source instanceof ArrayBuffer) {
		return new Uint8Array(source).slice();
	}

	const signal = combineSignals([options.signal, options.requestInit?.signal]);
	const requestInit = options.signal ? { ...options.requestInit, signal } : options.requestInit;

	try {
		const response = await fetch(source, requestInit);
		if (!response.ok) {
			const status = [response.status, response.statusText].filter(Boolean).join(' ');
			throw new BionicSignError('pdf-load-http', `Failed to load PDF: HTTP ${status}`);
		}

		return new Uint8Array(await response.arrayBuffer());
	} catch (cause) {
		if (cause instanceof BionicSignError) {
			throw cause;
		}

		if (signal?.aborted) {
			throw signal.reason ?? cause;
		}

		if (isAbortError(cause)) {
			throw cause;
		}

		throw new BionicSignError('pdf-load-network', 'Failed to load PDF from URL', { cause });
	}
}
