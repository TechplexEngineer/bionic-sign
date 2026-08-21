<script lang="ts">
	import { tick, untrack } from 'svelte';
	import type { SignatureValue } from '../types.js';
	import SignaturePad from './SignaturePad.svelte';

	interface Props {
		open: boolean;
		fieldName: string;
		value?: SignatureValue;
		onapply?: (value: SignatureValue) => void;
		oncancel?: () => void;
	}

	let { open, fieldName, value, onapply, oncancel }: Props = $props();
	const uid = $props.id();
	let dialog: HTMLDialogElement;
	let cancelButton: HTMLButtonElement;
	let pad = $state<{ clear(): void }>();
	let draft = $state<SignatureValue>();
	let empty = $state(true);

	function copyValue(next: SignatureValue | undefined): SignatureValue | undefined {
		return next ? { type: 'signature', image: next.image } : undefined;
	}

	function cancel(): void {
		oncancel?.();
	}

	function handleNativeCancel(event: Event): void {
		event.preventDefault();
		cancel();
	}

	function clearDraft(): void {
		pad?.clear();
		draft = undefined;
		empty = true;
	}

	function apply(): void {
		if (!draft || empty) return;
		onapply?.(copyValue(draft)!);
	}

	$effect(() => {
		const nextOpen = open;
		const nextValue = copyValue(value);

		untrack(() => {
			if (!nextOpen) {
				if (dialog?.open) dialog.close();
				return;
			}

			draft = nextValue;
			empty = nextValue === undefined;
			void tick().then(() => {
				if (!open || dialog.open) return;
				dialog.showModal();
				cancelButton.focus();
			});
		});
	});
</script>

<dialog
	bind:this={dialog}
	aria-labelledby={`${uid}-title`}
	oncancel={handleNativeCancel}
	onclose={() => {
		if (open) cancel();
	}}
>
	<div class="signature-dialog">
		<header>
			<h2 id={`${uid}-title`}>Sign {fieldName}</h2>
			<p>Draw a signature for this field. It will not be reused for other fields.</p>
		</header>
		{#if open}
			{#key fieldName}
				<SignaturePad
					bind:this={pad}
					value={draft}
					onchange={(next) => {
						draft = copyValue(next);
						empty = next === undefined;
					}}
					onemptychange={(nextEmpty) => (empty = nextEmpty)}
				/>
			{/key}
		{/if}
		<footer>
			<button
				type="button"
				aria-label="Clear signature draft"
				onclick={clearDraft}
				disabled={empty}
			>
				Clear
			</button>
			<span class="spacer"></span>
			<button bind:this={cancelButton} type="button" aria-label="Cancel signature" onclick={cancel}>
				Cancel
			</button>
			<button type="button" aria-label="Apply signature" onclick={apply} disabled={empty}>
				Apply
			</button>
		</footer>
	</div>
</dialog>

<style>
	dialog {
		width: min(38rem, calc(100vw - 2rem));
		max-width: none;
		padding: 0;
		border: 1px solid var(--bionic-sign-border, #cbd5e1);
		border-radius: var(--bionic-sign-radius, 0.75rem);
		background: var(--bionic-sign-surface, white);
		color: var(--bionic-sign-text, #0f172a);
	}

	dialog::backdrop {
		background: rgb(15 23 42 / 55%);
	}

	.signature-dialog {
		display: grid;
		gap: 1rem;
		padding: 1.25rem;
	}

	header,
	header p,
	h2 {
		margin: 0;
	}

	header {
		display: grid;
		gap: 0.35rem;
	}

	header p {
		color: var(--bionic-sign-muted-text, #475569);
	}

	footer {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.spacer {
		flex: 1;
	}

	button {
		min-height: 2.5rem;
		padding: 0.5rem 0.85rem;
		border: 1px solid var(--bionic-sign-border, #cbd5e1);
		border-radius: 0.4rem;
		background: var(--bionic-sign-surface, white);
		color: inherit;
		font: inherit;
	}

	button:last-child {
		border-color: var(--bionic-sign-accent, #2563eb);
		background: var(--bionic-sign-accent, #2563eb);
		color: white;
	}

	button:disabled {
		opacity: 0.5;
	}

	button:focus-visible {
		outline: 3px solid var(--bionic-sign-focus, #1d4ed8);
		outline-offset: 2px;
	}
</style>
