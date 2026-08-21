<script lang="ts">
	import { resolve } from '$app/paths';

	const features = [
		{
			step: '01',
			title: 'Place fields',
			copy: 'Load a PDF, place text and signature fields, then save a portable JSON definition.'
		},
		{
			step: '02',
			title: 'Collect intent',
			copy: 'Prefill known text, guide signers through required fields, and capture each mark separately.'
		},
		{
			step: '03',
			title: 'Export the result',
			copy: 'Receive structured values alongside a new flattened PDF, ready for your own workflow.'
		}
	];
</script>

<svelte:head>
	<title>Bionic Sign — PDF form workflows for Svelte</title>
	<meta
		name="description"
		content="Design and complete PDF forms entirely in the browser with Bionic Sign for Svelte 5."
	/>
</svelte:head>

<main class="landing-shell">
	<nav class="topbar" aria-label="Primary navigation">
		<a class="brand" href={resolve('/')} aria-label="Bionic Sign home">
			<span class="brand-mark" aria-hidden="true">B</span>
			<span>Bionic Sign</span>
		</a>
		<a class="nav-link" href={resolve('/filler')}>Try the demo</a>
	</nav>

	<section class="hero" aria-labelledby="hero-title">
		<div class="hero-copy">
			<p class="eyebrow"><span></span> Svelte 5 · browser native</p>
			<h1 id="hero-title">Bionic Sign</h1>
			<p class="lede">
				Turn existing PDFs into focused signing experiences without handing your documents to a
				third party.
			</p>
			<div class="hero-actions">
				<a class="primary-action" href={resolve('/designer')}
					>Design a form <span aria-hidden="true">↗</span></a
				>
				<a class="secondary-action" href={resolve('/filler')}
					>Fill and sign <span aria-hidden="true">→</span></a
				>
			</div>
		</div>

		<div class="hero-art" aria-label="A document moving from field design to signing">
			<div class="orbit orbit-one"></div>
			<div class="orbit orbit-two"></div>
			<article class="document-card">
				<header>
					<span class="document-dot"></span>
					<span>FIELD TRIP / 01</span>
				</header>
				<div class="document-lines">
					<span></span><span></span><span></span>
				</div>
				<div class="field-chip text-chip">STUDENT_NAME</div>
				<div class="field-chip signature-chip">
					<span>PARENT_SIGNATURE</span>
					<svg viewBox="0 0 150 36" role="img" aria-label="Example signature mark">
						<path
							d="M6 27c17-3 14-21 23-19 8 2-2 24 6 19 9-6 12-18 18-17 7 2-5 19 2 18 8-2 13-15 19-14 5 1-4 13 2 14 9 1 18-5 29-3 10 2 20 5 39 2"
						/>
					</svg>
				</div>
				<footer><span>2 pages</span><strong>READY</strong></footer>
			</article>
		</div>
	</section>

	<section class="workflow" aria-labelledby="workflow-title">
		<div class="section-heading">
			<p class="eyebrow"><span></span> One small library</p>
			<h2 id="workflow-title">A complete PDF workflow, minus the backend.</h2>
		</div>
		<div class="feature-grid">
			{#each features as feature (feature.step)}
				<article>
					<p class="step">{feature.step}</p>
					<h3>{feature.title}</h3>
					<p>{feature.copy}</p>
				</article>
			{/each}
		</div>
	</section>

	<section class="trust-note" aria-label="Local processing and signature notice">
		<div class="pulse" aria-hidden="true"></div>
		<div>
			<strong>Your data stays in this browser.</strong>
			<p>The demo has no upload endpoint, account, database, or hidden persistence.</p>
		</div>
		<p class="legal-note">
			Captured signatures are visual electronic marks, not cryptographic or certificate-backed
			digital signatures.
		</p>
	</section>
</main>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(html:has(.landing-shell)) {
		background: #07110e;
	}

	:global(body:has(.landing-shell)) {
		margin: 0;
		background:
			radial-gradient(circle at 85% 18%, rgb(132 255 184 / 12%), transparent 28rem), #07110e;
		color: #f5f8f4;
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}

	:global(a) {
		color: inherit;
	}

	.landing-shell {
		width: min(100% - 2rem, 76rem);
		min-height: 100vh;
		margin: 0 auto;
		padding-bottom: 3rem;
	}

	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 5.25rem;
		border-bottom: 1px solid rgb(255 255 255 / 12%);
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.7rem;
		font-size: 0.94rem;
		font-weight: 750;
		letter-spacing: -0.02em;
		text-decoration: none;
	}

	.brand-mark {
		display: grid;
		width: 2rem;
		height: 2rem;
		place-items: center;
		border-radius: 50%;
		background: #9affbb;
		color: #07110e;
		font-family: Georgia, serif;
		font-size: 1.15rem;
		font-style: italic;
		font-weight: 900;
	}

	.nav-link {
		color: #a9b7af;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-decoration: none;
		text-transform: uppercase;
	}

	.nav-link:hover {
		color: #9affbb;
	}

	.hero {
		display: grid;
		grid-template-columns: minmax(0, 1.05fr) minmax(24rem, 0.95fr);
		align-items: center;
		gap: clamp(3rem, 8vw, 8rem);
		min-height: 40rem;
		padding: 4rem 0 5rem;
	}

	.hero-copy {
		position: relative;
		z-index: 2;
	}

	.eyebrow {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		margin: 0 0 1.35rem;
		color: #9affbb;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}

	.eyebrow span {
		width: 1.8rem;
		height: 1px;
		background: currentcolor;
	}

	h1 {
		max-width: 9ch;
		margin: 0;
		font-family: Georgia, 'Times New Roman', serif;
		font-size: clamp(4.5rem, 10vw, 8.8rem);
		font-style: italic;
		font-weight: 500;
		letter-spacing: -0.075em;
		line-height: 0.78;
	}

	.lede {
		max-width: 35rem;
		margin: 2rem 0 0;
		color: #bbc7c0;
		font-size: clamp(1.05rem, 2vw, 1.35rem);
		line-height: 1.55;
	}

	.hero-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 2.2rem;
	}

	.hero-actions a {
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		min-width: 10.5rem;
		padding: 0.9rem 1.05rem;
		border: 1px solid rgb(255 255 255 / 24%);
		border-radius: 0.2rem;
		font-size: 0.86rem;
		font-weight: 720;
		text-decoration: none;
		transition:
			transform 160ms ease,
			border-color 160ms ease;
	}

	.hero-actions a:hover {
		transform: translateY(-2px);
		border-color: #9affbb;
	}

	.primary-action {
		background: #9affbb;
		color: #07110e;
	}

	.secondary-action {
		background: rgb(255 255 255 / 4%);
	}

	.hero-art {
		position: relative;
		display: grid;
		min-height: 31rem;
		place-items: center;
	}

	.orbit {
		position: absolute;
		border: 1px solid rgb(154 255 187 / 18%);
		border-radius: 50%;
	}

	.orbit-one {
		width: 29rem;
		height: 29rem;
	}

	.orbit-two {
		width: 20rem;
		height: 20rem;
		border-style: dashed;
	}

	.document-card {
		position: relative;
		z-index: 1;
		width: min(19rem, 76vw);
		min-height: 25rem;
		padding: 1rem;
		transform: rotate(3.5deg);
		border: 1px solid #dce5dd;
		border-radius: 0.2rem;
		background: #f5f5ed;
		box-shadow: 2.2rem 2.5rem 0 rgb(0 0 0 / 18%);
		color: #132019;
	}

	.document-card header,
	.document-card footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
	}

	.document-card header {
		padding-bottom: 0.85rem;
		border-bottom: 1px solid #cbd3cc;
	}

	.document-dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		background: #0c4e2f;
	}

	.document-lines {
		display: grid;
		gap: 0.55rem;
		margin: 2rem 0;
	}

	.document-lines span {
		display: block;
		height: 0.33rem;
		background: #d9ded8;
	}

	.document-lines span:nth-child(2) {
		width: 78%;
	}

	.document-lines span:nth-child(3) {
		width: 58%;
	}

	.field-chip {
		border: 1px solid #0d6339;
		background: rgb(154 255 187 / 14%);
		color: #0d6339;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.58rem;
		font-weight: 750;
		letter-spacing: 0.08em;
	}

	.text-chip {
		padding: 0.75rem;
	}

	.signature-chip {
		margin-top: 1rem;
		padding: 0.7rem 0.8rem 0.4rem;
	}

	.signature-chip svg {
		width: 100%;
		margin-top: 0.45rem;
	}

	.signature-chip path {
		fill: none;
		stroke: #132019;
		stroke-linecap: round;
		stroke-width: 1.6;
	}

	.document-card footer {
		position: absolute;
		right: 1rem;
		bottom: 1rem;
		left: 1rem;
		padding-top: 0.85rem;
		border-top: 1px solid #cbd3cc;
	}

	.document-card footer strong {
		color: #0d6339;
	}

	.workflow {
		padding: 4.5rem 0;
		border-top: 1px solid rgb(255 255 255 / 12%);
	}

	.section-heading {
		display: grid;
		grid-template-columns: 1fr minmax(18rem, 1.15fr);
		align-items: end;
		gap: 2rem;
	}

	.section-heading h2 {
		margin: 0;
		font-family: Georgia, 'Times New Roman', serif;
		font-size: clamp(2rem, 4vw, 3.5rem);
		font-weight: 500;
		letter-spacing: -0.045em;
		line-height: 1.05;
	}

	.feature-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1px;
		margin-top: 3rem;
		background: rgb(255 255 255 / 12%);
		border: 1px solid rgb(255 255 255 / 12%);
	}

	.feature-grid article {
		min-height: 15rem;
		padding: 1.5rem;
		background: #07110e;
	}

	.step {
		margin: 0 0 3.5rem;
		color: #9affbb;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.7rem;
	}

	.feature-grid h3 {
		margin: 0 0 0.7rem;
		font-size: 1.05rem;
	}

	.feature-grid article > p:last-child {
		margin: 0;
		color: #9fada5;
		font-size: 0.9rem;
		line-height: 1.6;
	}

	.trust-note {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) minmax(17rem, 0.75fr);
		align-items: center;
		gap: 1.2rem;
		padding: 1.4rem;
		border: 1px solid rgb(154 255 187 / 35%);
		background: rgb(154 255 187 / 6%);
	}

	.pulse {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		background: #9affbb;
		box-shadow: 0 0 0 0.35rem rgb(154 255 187 / 10%);
	}

	.trust-note strong {
		font-size: 0.9rem;
	}

	.trust-note p {
		margin: 0.25rem 0 0;
		color: #9fada5;
		font-size: 0.77rem;
		line-height: 1.5;
	}

	.legal-note {
		padding-left: 1.2rem;
		border-left: 1px solid rgb(255 255 255 / 12%);
	}

	:global(a:focus-visible) {
		outline: 3px solid #9affbb;
		outline-offset: 4px;
	}

	@media (max-width: 800px) {
		.hero {
			grid-template-columns: 1fr;
			gap: 1rem;
			padding-top: 4.5rem;
		}

		.hero-art {
			min-height: 27rem;
		}

		.orbit-one {
			width: min(27rem, 88vw);
			height: min(27rem, 88vw);
		}

		.section-heading,
		.trust-note {
			grid-template-columns: 1fr;
		}

		.feature-grid {
			grid-template-columns: 1fr;
		}

		.feature-grid article {
			min-height: auto;
		}

		.step {
			margin-bottom: 2rem;
		}

		.legal-note {
			padding: 1rem 0 0;
			border-top: 1px solid rgb(255 255 255 / 12%);
			border-left: 0;
		}
	}

	@media (max-width: 480px) {
		.landing-shell {
			width: min(100% - 1.25rem, 76rem);
		}

		.nav-link {
			display: none;
		}

		h1 {
			font-size: clamp(4rem, 24vw, 6rem);
		}

		.hero-actions {
			display: grid;
		}

		.hero-actions a {
			width: 100%;
		}
	}
</style>
