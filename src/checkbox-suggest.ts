import { App, Editor, SuggestModal } from 'obsidian';
import { TextTransformer } from './engine';

export interface CheckboxOption {
	char: string;
	label: string;
}

export const checkboxOptions: CheckboxOption[] = [
	{ char: ' ', label: 'to-do (unchecked)' },
	{ char: '/', label: 'incomplete (half done)' },
	{ char: 'x', label: 'done' },
	{ char: '>', label: 'forwarded' },
	{ char: '<', label: 'scheduling' },
	{ char: '?', label: 'question' },
	{ char: '!', label: 'important' },
	{ char: '"', label: 'quote' },
	{ char: '-', label: 'canceled' },
	{ char: '*', label: 'star' },
	{ char: 'l', label: 'location' },
	{ char: 'i', label: 'information' },
	{ char: 'S', label: 'savings' },
	{ char: 'I', label: 'idea' },
	{ char: 'f', label: 'fire' },
	{ char: 'k', label: 'key' },
	{ char: 'u', label: 'up' },
	{ char: 'd', label: 'down' },
	{ char: 'w', label: 'win' },
	{ char: 'p', label: 'pros' },
	{ char: 'c', label: 'cons' },
	{ char: 'b', label: 'bookmark' },
];

export class CheckboxTypeSuggestModal extends SuggestModal<CheckboxOption> {
	engine: TextTransformer;
	editor: Editor;

	constructor(app: App, engine: TextTransformer, editor: Editor) {
		super(app);
		this.engine = engine;
		this.editor = editor;
		this.setPlaceholder('Choose checkbox type...');
		this.setInstructions([
			{ command: '↑↓', purpose: 'navigate checkbox types' },
			{ command: '↵', purpose: 'apply selected checkbox type' },
			{ command: 'esc', purpose: 'close' },
		]);
	}

	getSuggestions(query: string): CheckboxOption[] {
		const raw = query.trim();
		const q = query.trim().toLowerCase();
		if (!q) return checkboxOptions;
		return checkboxOptions
			.filter((item) => {
				const marker = item.char === ' ' ? '[ ]' : `[${item.char}]`;
				return marker.toLowerCase().includes(q)
					|| item.label.toLowerCase().includes(q);
			})
			.sort((a, b) => {
				const aDirectCodeExact = this.getDirectCodeMatchScore(a, raw, q);
				const bDirectCodeExact = this.getDirectCodeMatchScore(b, raw, q);
				if (aDirectCodeExact !== bDirectCodeExact) return bDirectCodeExact - aDirectCodeExact;

				const aLabelStarts = a.label.toLowerCase().startsWith(q) ? 1 : 0;
				const bLabelStarts = b.label.toLowerCase().startsWith(q) ? 1 : 0;
				if (aLabelStarts !== bLabelStarts) return bLabelStarts - aLabelStarts;

				const aMarker = a.char === ' ' ? '[ ]' : `[${a.char}]`;
				const bMarker = b.char === ' ' ? '[ ]' : `[${b.char}]`;
				const aMarkerStarts = aMarker.toLowerCase().startsWith(q) ? 1 : 0;
				const bMarkerStarts = bMarker.toLowerCase().startsWith(q) ? 1 : 0;
				if (aMarkerStarts !== bMarkerStarts) return bMarkerStarts - aMarkerStarts;

				return a.label.localeCompare(b.label);
			});
	}

	getDirectCodeMatchScore(item: CheckboxOption, raw: string, q: string) {
		const marker = item.char === ' ' ? '[ ]' : `[${item.char}]`;
		const markerLower = marker.toLowerCase();
		if (raw === item.char || raw === marker) return 2;
		if (q === item.char.toLowerCase() || q === markerLower) return 1;
		return 0;
	}

	renderSuggestion(item: CheckboxOption, el: HTMLElement): void {
		el.addClass('meh-checkbox-suggest-item');
		el.setAttr('data-checkbox-type', item.char === ' ' ? 'space' : item.char);

		const row = el.createDiv({ cls: 'meh-checkbox-suggest-row' });
		const checkbox = row.createEl('input', { cls: 'task-list-item-checkbox', type: 'checkbox' });
		checkbox.checked = item.char !== ' ';
		checkbox.setAttr('data-task', item.char);
		checkbox.disabled = true;

		const marker = item.char === ' ' ? '[ ]' : `[${item.char}]`;
		row.createSpan({ cls: 'meh-checkbox-suggest-marker', text: marker });
		row.createSpan({ cls: 'meh-checkbox-suggest-label', text: item.label });
	}

	onChooseSuggestion(item: CheckboxOption): void {
		this.engine.setEditor(this.editor);
		this.engine.changeCheckboxAtSelections(item.char);
	}
}
