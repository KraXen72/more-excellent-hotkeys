import type { Editor, Menu } from 'obsidian';
import { Notice, Plugin } from 'obsidian';
import { CheckboxTypeSuggestModal } from './checkbox-suggest';
import { TextTransformer } from './engine';
import {
	DEFAULT_SETTINGS,
	normalizeCheckboxOptions,
	SmarterHotkeysSettings,
	SmarterHotkeysSettingTab,
} from './settings';

const TextTransformOperations = [
  "bold",
  "highlight",
  "italics",
  "inlineCode",
  "comment",
  "strikethrough",
	"underscore",
	"removeFormatting",
	// "inlineMath"
] as const;

export type ValidOperations = typeof TextTransformOperations[number];
export type StyleOperations = Exclude<ValidOperations, "removeFormatting">;

const commandNames: Record<ValidOperations, string> = {
	bold: 'Toggle bold',
	highlight: 'Toggle highlight',
	italics: 'Toggle italics',
	inlineCode: 'Toggle inline code',
	comment: 'Toggle comment',
	strikethrough: 'Toggle strikethrough',
	underscore: 'Toggle underscore',
	removeFormatting: 'Remove formatting',
};

export default class SmarterHotkeys extends Plugin {
	settings: SmarterHotkeysSettings;
	engine: TextTransformer;

	async onload() {
		await this.loadSettings();
		this.engine = new TextTransformer(this.settings);

		// This adds an editor command that can perform some operation on the current editor instance
		for (const _op of TextTransformOperations) {
			const op = _op as ValidOperations;
			this.addCommand({
				id: 'meh-' + op,
				name: commandNames[op],
				editorCallback: (editor: Editor) => {
					this.engine.setEditor(editor);
					this.engine.transformText(op);
				}
			});
		}

		this.addCommand({
			id: 'meh-change-checkbox',
			name: 'Change checkbox type',
			editorCallback: (editor: Editor) => this.openCheckboxTypePicker(editor),
		});

		this.registerEvent(this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor) => {
			this.engine.setEditor(editor);
			if (!this.engine.canChangeCheckboxAtCursor(this.settings.promoteRegularBulletPoints)) return;
			menu.addItem((item) => item
				.setTitle('Change checkbox type')
				.setIcon('check-square')
				.onClick(() => this.openCheckboxTypePicker(editor)));
		}));

		this.addSettingTab(new SmarterHotkeysSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData, {
			extendedCheckboxes: normalizeCheckboxOptions(loadedData?.extendedCheckboxes),
		});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	openCheckboxTypePicker(editor: Editor) {
		this.engine.setEditor(editor);
		if (!this.engine.canChangeCheckboxAtCursor(this.settings.promoteRegularBulletPoints)) {
			new Notice('No checkbox found on the current line.');
			return;
		}
		new CheckboxTypeSuggestModal(
			this.app,
			this.engine,
			editor,
			this.settings.extendedCheckboxes,
			this.settings.promoteRegularBulletPoints,
		).open();
	}
}
