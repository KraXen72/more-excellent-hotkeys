import { App, Editor, Menu, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { TextTransformer, TextTransformerSettings } from './engine';
import { CheckboxTypeSuggestModal } from './checkbox-suggest';

interface SmarterHotkeysSettings extends TextTransformerSettings {}

const DEFAULT_SETTINGS: SmarterHotkeysSettings = {
	useAsteriskForItalics: false,
};

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
			if (!this.engine.getCheckboxAtCursor()) return;
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
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	openCheckboxTypePicker(editor: Editor) {
		this.engine.setEditor(editor);
		if (!this.engine.getCheckboxAtCursor()) {
			new Notice('No checkbox found on the current line.');
			return;
		}
		new CheckboxTypeSuggestModal(this.app, this.engine, editor).open();
	}
}

class SmarterHotkeysSettingTab extends PluginSettingTab {
	plugin: SmarterHotkeys;

	constructor(app: App, plugin: SmarterHotkeys) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

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
			.setName('Extended checkbox icons')
			.setDesc('To see custom checkbox icons, install a theme (or snippet) that provides extended checkbox styling.');
	}
}
