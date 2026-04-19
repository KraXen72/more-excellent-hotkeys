import type { TextTransformerSettings } from './engine';
import { CheckboxOption, DEFAULT_CHECKBOX_OPTIONS } from './checkbox-preview';

export interface SmarterHotkeysSettings extends TextTransformerSettings {
	extendedCheckboxes: CheckboxOption[];
}

export function cloneCheckboxOptions(options: CheckboxOption[]): CheckboxOption[] {
	return options.map((option) => ({ char: option.char, label: option.label }));
}

export const DEFAULT_SETTINGS: SmarterHotkeysSettings = {
	useAsteriskForItalics: false,
	promoteRegularBulletPoints: true,
	extendedCheckboxes: cloneCheckboxOptions(DEFAULT_CHECKBOX_OPTIONS),
};

export function normalizeCheckboxOptions(value: unknown): CheckboxOption[] {
	if (!Array.isArray(value)) return cloneCheckboxOptions(DEFAULT_CHECKBOX_OPTIONS);
	const normalized = value
		.map((item) => {
			const record = item as Partial<CheckboxOption>;
			const char = typeof record.char === 'string' && record.char.length > 0
				? record.char.slice(0, 1)
				: ' ';
			const label = typeof record.label === 'string' ? record.label : '';
			return { char, label };
		});
	return normalized.length > 0 ? normalized : cloneCheckboxOptions(DEFAULT_CHECKBOX_OPTIONS);
}
