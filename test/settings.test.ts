import assert from 'node:assert';
import { describe, it } from 'node:test';
import { DEFAULT_CHECKBOX_OPTIONS } from '../src/checkbox-preview';
import { DEFAULT_SETTINGS, normalizeCheckboxOptions } from '../src/settings-data';

describe('settings normalization', () => {
	it('falls back to defaults for non-array values', () => {
		const normalized = normalizeCheckboxOptions(undefined);
		assert.deepEqual(normalized, DEFAULT_CHECKBOX_OPTIONS);
		assert.notEqual(normalized, DEFAULT_CHECKBOX_OPTIONS);
	});

	it('normalizes invalid and overlong checkbox entries', () => {
		const normalized = normalizeCheckboxOptions([
			{ char: 'done', label: 'Done item' },
			{ char: '', label: 123 },
			{ nope: true },
		]);

		assert.deepEqual(normalized, [
			{ char: 'd', label: 'Done item' },
			{ char: ' ', label: '' },
			{ char: ' ', label: '' },
		]);
	});

	it('falls back to defaults for an empty array', () => {
		const normalized = normalizeCheckboxOptions([]);
		assert.deepEqual(normalized, DEFAULT_CHECKBOX_OPTIONS);
		assert.notEqual(normalized, DEFAULT_CHECKBOX_OPTIONS);
	});

	it('keeps default settings list cloned from source defaults', () => {
		assert.deepEqual(DEFAULT_SETTINGS.extendedCheckboxes, DEFAULT_CHECKBOX_OPTIONS);
		assert.notEqual(DEFAULT_SETTINGS.extendedCheckboxes, DEFAULT_CHECKBOX_OPTIONS);
	});
});
