import { calculate, CalculationError, errorMessage, operations, presets, type Operation } from './calculations';
import './styles.css';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
	<a class="skip-link" href="#lab">Skip to quantity lab</a>
	<header class="topbar">
		<a class="brand" href="https://neutrium.github.io/quantity/" aria-label="Quantity API home">
			<span class="brand-mark" aria-hidden="true"><img src="${import.meta.env.BASE_URL}neutrium-logo.png" alt="" /></span>
			<span>@neutrium/quantity</span>
		</a>
		<nav class="topnav" aria-label="Project links"><a href="https://neutrium.github.io/quantity/">API reference</a><a href="https://github.com/neutrium/quantity">GitHub</a></nav>
	</header>
	<main class="page" id="lab">
		<section class="intro" aria-labelledby="page-title">
			<div><p class="eyebrow">Interactive lab</p><h1 id="page-title">Different units.<br>Same measure.</h1></div>
			<p class="intro-copy">Convert measurements, calculate with units, and explore temperature scales. Change an expression and watch the dimensions follow.</p>
		</section>
		<div class="preset-bar" id="presets" role="group" aria-label="Example presets"></div>
		<div class="workspace">
			<form class="panel" id="controls" novalidate>
				<div class="panel-heading"><h2>Calculation</h2><span class="hint">Updates live</span></div>
				<div class="controls">
					<div class="field"><label for="value">Quantity</label><input id="value" spellcheck="false" autocomplete="off" maxlength="200" aria-describedby="value-help" /><span class="hint" id="value-help">A scalar and units, such as 1.5 m or 100 km/h.</span></div>
					<div class="field"><label for="operation">Operation</label><select id="operation">${Object.entries(operations).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div>
					<div class="field" id="operand-field"><label id="operand-label" for="operand">Target units</label><input id="operand" spellcheck="false" autocomplete="off" maxlength="200" aria-describedby="operand-help" /><span class="hint" id="operand-help"></span></div>
					<aside class="example-note"><p class="eyebrow">Try it out</p><p id="preset-note"></p></aside>
				</div>
			</form>
			<section class="panel result-panel" aria-labelledby="result-heading">
				<div class="panel-heading"><h2 id="result-heading">Result</h2><span class="status" id="status" role="status"></span></div>
				<div class="hero-output"><div class="output-label" id="output-label">Calculated quantity</div><div class="output-value" id="output" aria-live="polite"></div><div class="output-error" id="error" role="status" hidden></div></div>
				<dl class="summary-grid">
					<div class="summary-item"><dt id="base-label">In base units</dt><dd id="base">—</dd></div>
					<div class="summary-item"><dt>Unit expression</dt><dd id="units">—</dd></div>
					<div class="summary-item"><dt>Quantity type</dt><dd id="type">—</dd></div>
				</dl>
				<div class="code-heading"><h3>Use it in your code</h3><span class="hint">JavaScript</span></div>
				<div class="detail-view"><button class="copy-button" id="copy" type="button">Copy code</button><pre id="code" tabindex="0" aria-label="JavaScript example"></pre></div>
			</section>
		</div>
		<section class="reference-grid" aria-label="Unit syntax quick reference">
			<article><h2>Build an expression</h2><p>Combine units with <code>*</code>, <code>/</code>, and integer powers. Group with parentheses: <code>kg*(m/s)^2</code>.</p></article>
			<article><h2>Temperature or interval?</h2><p><code>20 tempC</code> is an absolute temperature. <code>20 degC</code> is a change in temperature. Add an interval to a temperature to shift it.</p></article>
			<article><h2>Keep dimensions consistent</h2><p>Add or compare compatible measurements, such as metres and feet. Multiplication and division create new unit expressions.</p></article>
		</section>
		<footer class="footnote"><p>Powered by @neutrium/quantity and @neutrium/decimal.</p><p>Calculations run locally in your browser.</p></footer>
	</main>
`;

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const value = element<HTMLInputElement>('value');
const operation = element<HTMLSelectElement>('operation');
const operand = element<HTMLInputElement>('operand');
const copy = element<HTMLButtonElement>('copy');
let copyTimer: ReturnType<typeof setTimeout> | undefined;

function update()
{
	clearTimeout(copyTimer);
	copy.textContent = 'Copy code';

	for (const field of [value, operand])
	{
		field.removeAttribute('aria-invalid');
		field.setAttribute('aria-describedby', `${field.id}-help`);
	}

	const op = operation.value as Operation;
	const unary = op === 'toBase' || op === 'inverse';
	element('operand-field').hidden = unary;
	operand.disabled = unary;
	element('operand-label').textContent = op === 'to' ? 'Target units' : op === 'pow' ? 'Integer power' : 'Second quantity';
	element('operand-help').textContent = op === 'to' ? 'A unit expression, such as ft, m/s, or tempF.' : op === 'pow' ? 'An integer between −12 and 12 for this demo.' : 'Include units, or use a scalar such as 2 to multiply or divide.';

	try
	{
		const result = calculate({ value: value.value, operation: op, operand: operand.value });
		for (const key of ['output', 'base', 'units', 'type', 'code'] as const) element(key).textContent = result[key];
		element('output-label').textContent = result.comparison ? operations[op] : 'Calculated quantity';
		element('base-label').textContent = result.comparison ? 'Input in base units' : 'In base units';
		element('error').hidden = true;
		element('status').textContent = 'Valid';
		element('status').classList.remove('error');
		copy.disabled = false;
	}
	catch (error)
	{
		element('output').textContent = '—';

		for (const key of ['base', 'units', 'type'])
		{
			element(key).textContent = '—';
		}

		element('code').textContent = '// Enter a valid calculation to see its JavaScript example.';
		element('error').textContent = errorMessage(error);

		if (error instanceof CalculationError && error.field)
		{
			const field = error.field === 'value' ? value : operand;
			field.setAttribute('aria-invalid', 'true');
			field.setAttribute('aria-describedby', `${field.id}-help error`);
		}

		element('error').hidden = false;
		element('status').textContent = 'Check input';
		element('status').classList.add('error');
		copy.disabled = true;
	}
}

const presetButtons = presets.map((preset, index) => {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'preset';
	button.textContent = preset.label;
	button.addEventListener('click', () => loadPreset(index));
	element('presets').append(button);
	return button;
});

function loadPreset(index: number)
{
	const preset = presets[index];
	value.value = preset.value;
	operation.value = preset.operation;
	operand.value = preset.operand;
	element('preset-note').textContent = preset.note;
	presetButtons.forEach((button, i) => {
		button.classList.toggle('active', index === i);
		button.setAttribute('aria-pressed', String(index === i));
	});
	update();
}

element('controls').addEventListener('submit', event => event.preventDefault());

element('controls').addEventListener('input', () => {
	presetButtons.forEach(button => {
		button.classList.remove('active');
		button.setAttribute('aria-pressed', 'false');
	});
	element('preset-note').textContent = 'Explore your own calculation, or choose a preset above. Check the unit spelling and use compatible dimensions for addition and conversion.';
	update();
});

copy.addEventListener('click', async () => {
	const code = element('code').textContent!;
	try {
		await navigator.clipboard.writeText(code);
		copy.textContent = 'Copied';
	} catch {
		copy.textContent = 'Select code to copy';
		const range = document.createRange();
		range.selectNodeContents(element('code'));
		window.getSelection()?.removeAllRanges();
		window.getSelection()?.addRange(range);
	}
	copyTimer = setTimeout(() => { copy.textContent = 'Copy code'; }, 2000);
});

loadPreset(0);
