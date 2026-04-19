export interface CheckboxOption {
	char: string;
	label: string;
}

export interface CheckboxPreviewElements {
	row: HTMLElement;
	checkboxLabel: HTMLLabelElement;
	checkbox: HTMLInputElement;
	marker: HTMLSpanElement;
	label: HTMLSpanElement | null;
}

export const DEFAULT_CHECKBOX_OPTIONS: CheckboxOption[] = [
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

export function getCheckboxMarker(char: string): string {
	return char === ' ' ? '[ ]' : `[${char}]`;
}

export function renderCheckboxPreview(
	container: HTMLElement,
	item: CheckboxOption,
	options: { rowClass?: string; includeLabel?: boolean } = {},
): CheckboxPreviewElements {
	const rowClasses = ['meh-checkbox-suggest-row'];
	if (options.rowClass) rowClasses.push(options.rowClass);
	const row = container.createDiv({ cls: rowClasses.join(' ') });
	// try to get other themes to render their alt checkboxes in the settings & in the picker
	row.addClass('HyperMD-task-line');
	row.addClass('is-live-preview');

	const checkboxLabel = row.createEl('label');
	const checkbox = checkboxLabel.createEl('input', { cls: 'task-list-item-checkbox', type: 'checkbox' });
	checkbox.disabled = true;

	const marker = row.createSpan({ cls: 'meh-checkbox-suggest-marker' });
	const includeLabel = options.includeLabel ?? false;
	const label = includeLabel
		? row.createSpan({ cls: 'meh-checkbox-suggest-label' })
		: null;

	updateCheckboxPreview({ row, checkboxLabel, checkbox, marker, label }, item);
	return { row, checkboxLabel, checkbox, marker, label };
}

export function updateCheckboxPreview(preview: CheckboxPreviewElements, item: CheckboxOption) {
	preview.row.setAttr('data-task', item.char);
	preview.checkbox.checked = item.char !== ' ';
	preview.checkbox.setAttr('data-task', item.char);
	preview.marker.setText(getCheckboxMarker(item.char));
	if (preview.label) preview.label.setText(item.label);
}
