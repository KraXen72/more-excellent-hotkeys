import type { App } from "obsidian";
import { Notice, Plugin, PluginSettingTab, setIcon, Setting } from 'obsidian';
import {
	CheckboxOption,
	DEFAULT_CHECKBOX_OPTIONS,
	renderCheckboxPreview,
	updateCheckboxPreview,
} from './checkbox-preview';
import { TextTransformer } from './engine';
import {
	cloneCheckboxOptions,
	SmarterHotkeysSettings,
} from './settings-data';

interface SettingsHost extends Plugin {
	settings: SmarterHotkeysSettings;
	engine: TextTransformer;
	saveSettings(): Promise<void>;
}

export { DEFAULT_SETTINGS, normalizeCheckboxOptions } from './settings-data';
export type { SmarterHotkeysSettings } from './settings-data';

export class SmarterHotkeysSettingTab extends PluginSettingTab {
	plugin: SettingsHost;

	constructor(app: App, plugin: SettingsHost) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Use * for italics')
			.setDesc('Use asterisks instead of underscores for italic toggles.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useAsteriskForItalics)
				.onChange(async (value) => {
					this.plugin.settings.useAsteriskForItalics = value;
					this.plugin.engine.setSettings(this.plugin.settings);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Promote regular bullet points')
			.setDesc('Allow "Change checkbox type" to turn regular bullet points into task list items.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.promoteRegularBulletPoints)
				.onChange(async (value) => {
					this.plugin.settings.promoteRegularBulletPoints = value;
					this.plugin.engine.setSettings(this.plugin.settings);
					await this.plugin.saveSettings();
				}));

		this.displayExtendedCheckboxSubmenu(containerEl);
	}

	private displayExtendedCheckboxSubmenu(containerEl: HTMLElement) {
		const submenuEl = containerEl.createDiv({ cls: 'meh-checkbox-settings-submenu' });
		const submenuContent = submenuEl.createDiv({ cls: 'meh-checkbox-settings-submenu-content' });

		new Setting(submenuContent)
			.setName('Extended checkbox icons')
			.setDesc('Configure checkbox markers shown in the picker. To see custom icons, install a theme (or snippet) that styles extended checkboxes.')
			.addExtraButton((button) => button
				.setIcon('rotate-ccw')
				.setTooltip('Reset to defaults')
				.onClick(async () => {
					this.plugin.settings.extendedCheckboxes = cloneCheckboxOptions(DEFAULT_CHECKBOX_OPTIONS);
					await this.plugin.saveSettings();
					this.display();
				}));

		for (let i = 0; i < this.plugin.settings.extendedCheckboxes.length; i++) {
			const option = this.plugin.settings.extendedCheckboxes[i];
			this.renderCheckboxOptionRow(submenuContent, option, i);
		}
	}

	private renderCheckboxOptionRow(containerEl: HTMLElement, option: CheckboxOption, index: number) {
		const rowSetting = new Setting(containerEl);
		rowSetting.settingEl.addClass('meh-checkbox-option-row');
		rowSetting.controlEl.empty();

		const previewContainer = rowSetting.controlEl.createDiv({ cls: 'meh-checkbox-option-preview' });
		const preview = renderCheckboxPreview(previewContainer, option, { rowClass: 'meh-checkbox-option-preview-row' });

		const markerWrap = rowSetting.controlEl.createSpan({ cls: 'meh-checkbox-option-marker-wrap' });
		markerWrap.createSpan({ cls: 'meh-checkbox-option-marker-prefix', text: '- [' });
		const markerInput = markerWrap.createEl('input', { cls: 'meh-checkbox-option-char', type: 'text' });
		markerInput.maxLength = 1;
		markerInput.value = option.char === ' ' ? '' : option.char;
		markerInput.placeholder = "␣";
		markerWrap.createSpan({ cls: 'meh-checkbox-option-marker-suffix', text: ']' });

		const labelInput = rowSetting.controlEl.createEl('input', { cls: 'meh-checkbox-option-label', type: 'text' });
		labelInput.placeholder = 'description';
		labelInput.value = option.label;

		const addButton = rowSetting.controlEl.createEl('button', {
			cls: 'clickable-icon meh-checkbox-option-btn',
			attr: { 'aria-label': 'Add row below' },
		});
		setIcon(addButton, 'plus');

		const deleteButton = rowSetting.controlEl.createEl('button', {
			cls: 'clickable-icon meh-checkbox-option-btn meh-checkbox-option-btn-danger',
			attr: { 'aria-label': 'Delete row' },
		});
		setIcon(deleteButton, 'trash-2');

		const getMarkerChar = () => markerInput.value.length > 0 ? markerInput.value.slice(0, 1) : ' ';
		const getPreviewOption = (): CheckboxOption => ({
			char: getMarkerChar(),
			label: labelInput.value,
		});

		markerInput.addEventListener('input', () => {
			markerInput.value = markerInput.value.slice(0, 1);
			updateCheckboxPreview(preview, getPreviewOption());
		});
		labelInput.addEventListener('input', () => {
			updateCheckboxPreview(preview, getPreviewOption());
		});
		markerInput.addEventListener('change', () => void this.updateCheckboxOption(index, {
			char: getMarkerChar(),
		}));
		labelInput.addEventListener('change', () => void this.updateCheckboxOption(index, {
			label: labelInput.value,
		}));
		addButton.addEventListener('click', () => void this.insertCheckboxOption(index + 1));
		deleteButton.addEventListener('click', () => void this.deleteCheckboxOption(index));
	}

	private async updateCheckboxOption(index: number, update: Partial<CheckboxOption>) {
		const option = this.plugin.settings.extendedCheckboxes[index];
		if (!option) return;
		this.plugin.settings.extendedCheckboxes[index] = { ...option, ...update };
		await this.plugin.saveSettings();
	}

	private async insertCheckboxOption(index: number) {
		this.plugin.settings.extendedCheckboxes.splice(index, 0, { char: ' ', label: '' });
		await this.plugin.saveSettings();
		this.display();
	}

	private async deleteCheckboxOption(index: number) {
		if (this.plugin.settings.extendedCheckboxes.length <= 1) {
			new Notice('At least one checkbox option is required.');
			return;
		}
		this.plugin.settings.extendedCheckboxes.splice(index, 1);
		await this.plugin.saveSettings();
		this.display();
	}
}
