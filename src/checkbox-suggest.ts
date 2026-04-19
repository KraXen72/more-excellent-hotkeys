import type { App, Editor } from "obsidian";
import { SuggestModal } from 'obsidian';
import { CheckboxOption, renderCheckboxPreview } from './checkbox-preview';
import { TextTransformer } from './engine';

export class CheckboxTypeSuggestModal extends SuggestModal<CheckboxOption> {
	engine: TextTransformer;
	editor: Editor;
	options: CheckboxOption[];

	constructor(app: App, engine: TextTransformer, editor: Editor, options: CheckboxOption[]) {
		super(app);
		this.engine = engine;
		this.editor = editor;
		this.options = options;
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
		if (!q) return this.options;
		return this.options
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
		renderCheckboxPreview(el, item, { includeLabel: true });
	}

	onChooseSuggestion(item: CheckboxOption): void {
		this.engine.setEditor(this.editor);
		this.engine.changeCheckboxAtSelections(item.char);
	}
}
