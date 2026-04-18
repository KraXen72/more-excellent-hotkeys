import { App, Editor, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { TextTransformer, TextTransformerSettings } from './engine';

// Remember to rename these classes and interfaces!

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
	}
}
