import assert from 'node:assert';
import { describe, it } from 'node:test';
import { Window } from 'happy-dom';
import {
	getCheckboxMarker,
	renderCheckboxPreview,
	updateCheckboxPreview,
} from '../src/checkbox-preview';

type CreateElOptions = {
	cls?: string;
	text?: string;
	type?: string;
	attr?: Record<string, string>;
};

declare global {
	interface HTMLElement {
		createDiv(options?: CreateElOptions): HTMLDivElement;
		createSpan(options?: CreateElOptions): HTMLSpanElement;
		createEl<K extends keyof HTMLElementTagNameMap>(
			tag: K,
			options?: CreateElOptions,
		): HTMLElementTagNameMap[K];
		addClass(...classes: string[]): void;
		setAttr(name: string, value: string): void;
		setText(text: string): void;
	}
}

function applyCreateOptions(el: HTMLElement, options?: CreateElOptions) {
	if (!options) return;
	if (options.cls) el.className = options.cls;
	if (typeof options.text === 'string') el.textContent = options.text;
	if (options.type && 'type' in el) {
		(el as HTMLInputElement).type = options.type;
	}
	if (options.attr) {
		for (const [key, value] of Object.entries(options.attr)) {
			el.setAttribute(key, value);
		}
	}
}

function installObsidianElementHelpers() {
	const proto = window.HTMLElement.prototype as unknown as HTMLElement;
	if (!proto.createDiv) {
		proto.createDiv = function createDiv(options?: CreateElOptions): HTMLDivElement {
			const el = document.createElement('div');
			applyCreateOptions(el, options);
			this.appendChild(el);
			return el;
		};
	}
	if (!proto.createSpan) {
		proto.createSpan = function createSpan(options?: CreateElOptions): HTMLSpanElement {
			const el = document.createElement('span');
			applyCreateOptions(el, options);
			this.appendChild(el);
			return el;
		};
	}
	if (!proto.createEl) {
		proto.createEl = function createEl<K extends keyof HTMLElementTagNameMap>(
			tag: K,
			options?: CreateElOptions,
		): HTMLElementTagNameMap[K] {
			const el = document.createElement(tag);
			applyCreateOptions(el as HTMLElement, options);
			this.appendChild(el);
			return el;
		};
	}
	if (!proto.addClass) {
		proto.addClass = function addClass(...classes: string[]) {
			this.classList.add(...classes);
		};
	}
	if (!proto.setAttr) {
		proto.setAttr = function setAttr(name: string, value: string) {
			this.setAttribute(name, value);
		};
	}
	if (!proto.setText) {
		proto.setText = function setText(text: string) {
			this.textContent = text;
		};
	}
}

const mockWindow = new Window({ url: 'https://localhost:8080' });
(globalThis as any).window = mockWindow;
(globalThis as any).document = mockWindow.document;
(globalThis as any).MutationObserver = mockWindow.MutationObserver;
installObsidianElementHelpers();

describe('checkbox preview helpers', () => {
	it('formats checkbox markers', () => {
		assert.equal(getCheckboxMarker(' '), '[ ]');
		assert.equal(getCheckboxMarker('x'), '[x]');
	});

	it('renders preview with Prism-compatible hooks and label', () => {
		const container = document.createElement('div');
		const preview = renderCheckboxPreview(
			container,
			{ char: 'x', label: 'done' },
			{ includeLabel: true, rowClass: 'custom-row' },
		);

		assert.equal(preview.row.getAttribute('data-task'), 'x');
		assert.equal(preview.checkbox.getAttribute('data-task'), 'x');
		assert.equal(preview.checkbox.checked, true);
		assert.equal(preview.checkbox.disabled, true);
		assert.equal(preview.marker.textContent, '[x]');
		assert.equal(preview.label?.textContent, 'done');
		assert.equal(preview.row.classList.contains('HyperMD-task-line'), true);
		assert.equal(preview.row.classList.contains('is-live-preview'), true);
		assert.equal(preview.row.classList.contains('custom-row'), true);
		assert.equal(preview.checkboxLabel.tagName, 'LABEL');
	});

	it('updates preview marker and checkbox state in real time', () => {
		const container = document.createElement('div');
		const preview = renderCheckboxPreview(container, { char: 'x', label: 'done' }, { includeLabel: true });

		updateCheckboxPreview(preview, { char: ' ', label: 'todo' });
		assert.equal(preview.row.getAttribute('data-task'), ' ');
		assert.equal(preview.checkbox.getAttribute('data-task'), ' ');
		assert.equal(preview.checkbox.checked, false);
		assert.equal(preview.marker.textContent, '[ ]');
		assert.equal(preview.label?.textContent, 'todo');
	});
});
