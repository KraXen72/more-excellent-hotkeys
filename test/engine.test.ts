import type { EditorPosition, Editor } from 'obsidian';
import { test, describe, it } from 'node:test';
import assert from 'node:assert';
import { TextTransformer } from '../src/engine';

class MockEditor {
	selections: { anchor: EditorPosition; head: EditorPosition }[] = [];
	editorContent: string[] = [];

	constructor(initialText: string, initialSelections?: { anchor: EditorPosition; head: EditorPosition }[]) {
		this.editorContent = initialText.split('\n');
		if (initialSelections) this.selections = initialSelections;
	}
	private rebuildContent(before: string[], replacement: string[], after: string[]) {
		this.editorContent = [...before, ...replacement, ...after];
	}
	private comparePositions(a: EditorPosition, b: EditorPosition) {
		if (a.line !== b.line) return a.line - b.line;
		return a.ch - b.ch;
	}
	private normalizeRange(from: EditorPosition, to: EditorPosition) {
		return this.comparePositions(from, to) <= 0
			? { from, to }
			: { from: to, to: from };
	}

	listSelections() { return this.selections; }
	setSelection(from: EditorPosition, to: EditorPosition) {
		this.selections = [{ anchor: from, head: to }];
	}
	getLine(lineNo: number) {
		return this.editorContent[lineNo].toString();
	}
	getSelection() {
		if (!this.selections.length) return '';
		const { anchor, head } = this.selections[0];
		return this.getRange(anchor, head);
	}
	getRange(from: EditorPosition, to: EditorPosition) {
		const normalized = this.normalizeRange(from, to);
		from = normalized.from;
		to = normalized.to;

		if (from.line === to.line) {
			return this.editorContent[from.line].slice(from.ch, to.ch);
		}

		const start = this.editorContent[from.line].slice(from.ch);
		const middle = this.editorContent.slice(from.line + 1, to.line)
		const end = this.editorContent[to.line].slice(0, to.ch);

		return [start, ...middle, end].join('\n');
	}
	replaceSelection(newText: string) {
		if (!this.selections.length) return;
		const { anchor, head } = this.selections[0];
		const { from, to } = this.normalizeRange(anchor, head);
		const before = this.editorContent.slice(0, from.line);
		const after = this.editorContent.slice(to.line + 1);
		const startLine = this.editorContent[from.line].slice(0, from.ch);
		const endLine = this.editorContent[to.line].slice(to.ch);
		const replacementLines = newText.split('\n');
		replacementLines[0] = startLine + replacementLines[0];
		replacementLines[replacementLines.length - 1] += endLine;
		this.rebuildContent(before, replacementLines, after);

		const newLine = from.line + replacementLines.length - 1;
		const newCh = replacementLines[replacementLines.length - 1].length - endLine.length;
		const cursor = { line: newLine, ch: newCh };
		this.selections[0] = { anchor: cursor, head: cursor };
	}

	replaceRange(replacement: string, from: EditorPosition, to?: EditorPosition): void {
		if (!to) to = from;
		const normalized = this.normalizeRange(from, to);
		from = normalized.from;
		to = normalized.to;

		const before = this.editorContent.slice(0, from.line);
		const after = this.editorContent.slice(to.line + 1);
		const startLine = this.editorContent[from.line].slice(0, from.ch);
		const endLine = this.editorContent[to.line].slice(to.ch);
		const replacementLines = replacement.split('\n');
		replacementLines[0] = startLine + replacementLines[0];
		replacementLines[replacementLines.length - 1] += endLine;
		this.rebuildContent(before, replacementLines, after);
	}
	
	setCursor(pos: EditorPosition | number, ch?: number): void {
		let cursor: EditorPosition;

		if (typeof pos === 'number') {
			// If `pos` is a number, treat it as the line number
			if (ch === undefined) {
				throw new Error("Column (ch) must be provided when 'pos' is a number.");
			}
			cursor = { line: pos, ch: ch };
		} else {
			// If `pos` is an EditorPosition, use it directly
			cursor = pos;
		}

		// Validate line and column
		if (
			cursor.line < 0 ||
			cursor.line >= this.editorContent.length ||
			cursor.ch < 0 ||
			cursor.ch > this.editorContent[cursor.line].length
		) {
			throw new Error("Invalid cursor position");
		}

		// Set the cursor (zero-length selection)
		this.selections = [{ anchor: cursor, head: cursor }];
	}
	getEditorContent() { return this.editorContent.join('\n') }
}

const transformer = new TextTransformer();

// Helper function to setup test with shared transformer
function setupTest(content: string) {
	const mockEditor = new MockEditor(content);
	transformer.setSettings({ useAsteriskForItalics: false });
	transformer.setEditor(mockEditor as unknown as Editor);
	return mockEditor;
}

describe("simple transformations & restoration of selection", () => {
	test('bold: single line transformation', () => {
		const mockEditor = setupTest(`hello world\nthis is a test\nmultiline`);
		mockEditor.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 5 }); // "hello"
		transformer.transformText('bold');

		const expectedText = `**hello** world\nthis is a test\nmultiline`;
		const expectedSelection = { anchor: { line: 0, ch: 2 }, head: { line: 0, ch: 7 } };

		assert.strictEqual(mockEditor.getEditorContent(), expectedText);
		assert.deepStrictEqual(mockEditor.listSelections(), [expectedSelection])
	});

	test('bold: multi line transformation', () => {
		const mockEditor = setupTest(`hello world\nthis is a test\nmultiline`);
		mockEditor.setSelection({ line: 0, ch: 1 }, { line: 1, ch: 4 }); // "ello world" & "this"
		transformer.transformText('bold');

		const expectedText = `**hello world**\n**this** is a test\nmultiline`;
		const expectedSelection = { anchor: { line: 0, ch: 3 }, head: { line: 1, ch: 6 } };

		assert.strictEqual(mockEditor.getEditorContent(), expectedText);
		assert.deepStrictEqual(mockEditor.listSelections(), [expectedSelection])
	});
})

describe('bare cursor operations', () => {
	it('should handle cursor between style markers', () => {
		const editor = setupTest("with v1 **** monker");
		editor.setSelection({ line: 0, ch: 10 }, { line: 0, ch: 10 });
		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "with v1  monker");
		assert.deepStrictEqual(editor.listSelections()[0], { anchor: { line: 0, ch: 8 }, head: { line: 0, ch: 8 } });
	});

	it('should expand cursor inside word', () => {
		const editor = setupTest("word");
		editor.setSelection({ line: 0, ch: 2 }, { line: 0, ch: 2 });
		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "**word**");
		assert.deepStrictEqual(editor.listSelections()[0], { anchor: { line: 0, ch: 4 }, head: { line: 0, ch: 4 } });
	});

	it('should expand cursor at word boundary with space after', () => {
		const editor = setupTest("word another");
		editor.setSelection({ line: 0, ch: 4 }, { line: 0, ch: 4 });
		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "**word** another");
		assert.deepStrictEqual(editor.listSelections()[0], { anchor: { line: 0, ch: 6 }, head: { line: 0, ch: 6 } });
	});

	it('should expand cursor at word boundary with space before', () => {
		const editor = setupTest("word another");
		editor.setSelection({ line: 0, ch: 5 }, { line: 0, ch: 5 });
		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "word **another**");
		assert.deepStrictEqual(editor.listSelections()[0], { anchor: { line: 0, ch: 7 }, head: { line: 0, ch: 7 } });
	});

	it('should create empty style when cursor between spaces', () => {
		const editor = setupTest("word  ");
		editor.setSelection({ line: 0, ch: 5 }, { line: 0, ch: 5 });
		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "word **** ");
		assert.deepStrictEqual(editor.listSelections()[0], { anchor: { line: 0, ch: 7 }, head: { line: 0, ch: 7 } });
	});

	it('italics: should place cursor between underscores for empty style', () => {
		const editor = setupTest("word  ");
		editor.setSelection({ line: 0, ch: 5 }, { line: 0, ch: 5 });
		transformer.transformText('italics');
		assert.strictEqual(editor.getEditorContent(), "word __ ");
		assert.deepStrictEqual(editor.listSelections()[0], { anchor: { line: 0, ch: 6 }, head: { line: 0, ch: 6 } });
	});

	it('italics: should include parenthesized words but not lone parens', () => {
		const withWord = setupTest("(word)");
		withWord.setSelection({ line: 0, ch: 3 }, { line: 0, ch: 3 });
		transformer.transformText('italics');
		assert.strictEqual(withWord.getEditorContent(), "_(word)_");

		const loneParens = setupTest("()");
		loneParens.setSelection({ line: 0, ch: 1 }, { line: 0, ch: 1 });
		transformer.transformText('italics');
		assert.strictEqual(loneParens.getEditorContent(), "(__)");
	});

	it('italics: should use asterisks when setting is enabled', () => {
		const editor = setupTest("word  ");
		transformer.setSettings({ useAsteriskForItalics: true });
		editor.setSelection({ line: 0, ch: 5 }, { line: 0, ch: 5 });
		transformer.transformText('italics');
		assert.strictEqual(editor.getEditorContent(), "word ** ");
		assert.deepStrictEqual(editor.listSelections()[0], { anchor: { line: 0, ch: 6 }, head: { line: 0, ch: 6 } });
	});
});

describe('selection operations', () => {
	it('should handle a selection inside a pure non-whitespace chunk', () => {
		const editor = setupTest("hellothere");
		editor.setSelection({ line: 0, ch: 2 }, { line: 0, ch: 7 });
		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "**hellothere**");
		assert.deepStrictEqual(editor.listSelections()[0], { anchor: { line: 0, ch: 4 }, head: { line: 0, ch: 9 } })
	});

	it('should properly highlight perfect selection (boundary-to-boundary)', () => {
		const editor = setupTest("monker");
		editor.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 6 });
		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "**monker**");
		assert.deepStrictEqual(editor.listSelections()[0], { anchor: { line: 0, ch: 2 }, head: { line: 0, ch: 8 } })
	});

	it('should trim whitespace from selection ends & properly set cursor', () => {
		const editor = setupTest("   hello there  ");
		editor.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 16 });
		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "   **hello there**  ");
		assert.deepStrictEqual(editor.listSelections()[0], { anchor: { line: 0, ch: 5 }, head: { line: 0, ch: 16 } })
	});

	it('italics: un-italic should remove stars and underscores', () => {
		const stars = setupTest("*hello*");
		stars.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 7 });
		transformer.transformText('italics');
		assert.strictEqual(stars.getEditorContent(), "hello");

		const underscores = setupTest("_hello_");
		underscores.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 7 });
		transformer.transformText('italics');
		assert.strictEqual(underscores.getEditorContent(), "hello");

		const mixed = setupTest("_*hello*_");
		mixed.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 9 });
		transformer.transformText('italics');
		assert.strictEqual(mixed.getEditorContent(), "hello");
	});

	it('italics: should apply and remove with asterisks when enabled', () => {
		const editor = setupTest("word");
		transformer.setSettings({ useAsteriskForItalics: true });
		editor.setSelection({ line: 0, ch: 2 }, { line: 0, ch: 2 });

		transformer.transformText('italics');
		assert.strictEqual(editor.getEditorContent(), "*word*");

		transformer.transformText('italics');
		assert.strictEqual(editor.getEditorContent(), "word");
	});

	// it('should keep pure whitespace selection unchanged', () => {
	// 	const editor = setupTest("word    word");
	// 	editor.setSelection({ line: 0, ch: 5 }, { line: 0, ch: 7 });
	// 	transformer.transformText('bold');
	// 	assert.strictEqual(editor.getEditorContent(), "word    word");
	// 	assert.deepStrictEqual(editor.listSelections()[0], { anchor: { line: 0, ch: 5 }, head: { line: 0, ch: 7 } })
	// });
});

describe('style roundtrip regression', () => {
	it('should roundtrip every style on bare cursor', () => {
		const cases: Array<{
			op: 'bold' | 'highlight' | 'italics' | 'inlineCode' | 'comment' | 'strikethrough' | 'underscore';
			expectedApplied: string;
		}> = [
			{ op: 'bold', expectedApplied: '**word**' },
			{ op: 'highlight', expectedApplied: '==word==' },
			{ op: 'italics', expectedApplied: '_word_' },
			{ op: 'inlineCode', expectedApplied: '`word`' },
			{ op: 'comment', expectedApplied: '%%word%%' },
			{ op: 'strikethrough', expectedApplied: '~~word~~' },
			{ op: 'underscore', expectedApplied: '<u>word</u>' },
		];

		for (const tc of cases) {
			const editor = setupTest("word");
			editor.setSelection({ line: 0, ch: 2 }, { line: 0, ch: 2 });

			transformer.transformText(tc.op);
			assert.strictEqual(editor.getEditorContent(), tc.expectedApplied);

			transformer.transformText(tc.op);
			assert.strictEqual(editor.getEditorContent(), "word");
		}
	});

	it('should roundtrip every style on explicit selection', () => {
		const cases: Array<{
			op: 'bold' | 'highlight' | 'italics' | 'inlineCode' | 'comment' | 'strikethrough' | 'underscore';
			expectedApplied: string;
		}> = [
			{ op: 'bold', expectedApplied: '**word**' },
			{ op: 'highlight', expectedApplied: '==word==' },
			{ op: 'italics', expectedApplied: '_word_' },
			{ op: 'inlineCode', expectedApplied: '`word`' },
			{ op: 'comment', expectedApplied: '%%word%%' },
			{ op: 'strikethrough', expectedApplied: '~~word~~' },
			{ op: 'underscore', expectedApplied: '<u>word</u>' },
		];

		for (const tc of cases) {
			const editor = setupTest("word");
			editor.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 4 });

			transformer.transformText(tc.op);
			assert.strictEqual(editor.getEditorContent(), tc.expectedApplied);

			transformer.transformText(tc.op);
			assert.strictEqual(editor.getEditorContent(), "word");
		}
	});

	it('italics in asterisk mode: should still stack and unstack with bold', () => {
		const editor = setupTest("word");
		transformer.setSettings({ useAsteriskForItalics: true });
		editor.setSelection({ line: 0, ch: 2 }, { line: 0, ch: 2 });

		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "**word**");

		transformer.transformText('italics');
		assert.strictEqual(editor.getEditorContent(), "***word***");

		transformer.transformText('italics');
		assert.strictEqual(editor.getEditorContent(), "**word**");
	});
});

describe('stackable formatting', () => {
	it('should stack italics on top of bold and unstack in toggle order', () => {
		const editor = setupTest("word");
		editor.setSelection({ line: 0, ch: 2 }, { line: 0, ch: 2 });

		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "**word**");

		transformer.transformText('italics');
		assert.strictEqual(editor.getEditorContent(), "_**word**_");

		transformer.transformText('italics');
		assert.strictEqual(editor.getEditorContent(), "**word**");

		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "word");
	});

	it('should stack all configured compatible pairs and unstack back to the first style', () => {
		const cases: Array<{
			first: 'bold' | 'italics';
			second: 'strikethrough' | 'highlight';
			stacked: string;
			firstOnly: string;
		}> = [
			{ first: 'bold', second: 'strikethrough', stacked: '~~**word**~~', firstOnly: '**word**' },
			{ first: 'italics', second: 'strikethrough', stacked: '~~_word_~~', firstOnly: '_word_' },
			{ first: 'bold', second: 'highlight', stacked: '==**word**==', firstOnly: '**word**' },
			{ first: 'italics', second: 'highlight', stacked: '==_word_==', firstOnly: '_word_' },
		];

		for (const tc of cases) {
			const editor = setupTest("word");
			editor.setSelection({ line: 0, ch: 2 }, { line: 0, ch: 2 });

			transformer.transformText(tc.first);
			assert.strictEqual(editor.getEditorContent(), tc.firstOnly);

			transformer.transformText(tc.second);
			assert.strictEqual(editor.getEditorContent(), tc.stacked);

			transformer.transformText(tc.second);
			assert.strictEqual(editor.getEditorContent(), tc.firstOnly);
		}
	});

	it('should remove inner bold from stacked italics+bold with bare cursor and keep cursor logical', () => {
		const editor = setupTest("_**word**_");
		editor.setSelection({ line: 0, ch: 5 }, { line: 0, ch: 5 });

		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "_word_");
		assert.deepStrictEqual(editor.listSelections()[0], { anchor: { line: 0, ch: 3 }, head: { line: 0, ch: 3 } });
	});

	it('should remove inner bold from stacked italics+bold selection and keep selection on content', () => {
		const editor = setupTest("_**word**_");
		editor.setSelection({ line: 0, ch: 3 }, { line: 0, ch: 7 });

		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "_word_");
		assert.deepStrictEqual(editor.listSelections()[0], { anchor: { line: 0, ch: 1 }, head: { line: 0, ch: 5 } });
	});

	it('should remove inner style from multiline stacked lines', () => {
		const editor = setupTest("==**first**==\n==**second**==");
		editor.setSelection({ line: 0, ch: 0 }, { line: 1, ch: 14 });

		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "==first==\n==second==");
	});
});

describe('non-stackable formatting', () => {
	it('should consume first toggle by removing existing non-stackable style', () => {
		const editor = setupTest("word");
		editor.setSelection({ line: 0, ch: 2 }, { line: 0, ch: 2 });

		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "**word**");

		transformer.transformText('comment');
		assert.strictEqual(editor.getEditorContent(), "word");

		transformer.transformText('comment');
		assert.strictEqual(editor.getEditorContent(), "%%word%%");
	});
});

describe('table-like cursor behavior', () => {
	it('bold cycle in table-like row should preserve cursor and content', () => {
		const editor = setupTest("| Low shelf   | 105 |");
		editor.setSelection({ line: 0, ch: 4 }, { line: 0, ch: 4 });

		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "| **Low** shelf   | 105 |");

		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "| Low shelf   | 105 |");
		assert.deepStrictEqual(editor.listSelections()[0], { anchor: { line: 0, ch: 4 }, head: { line: 0, ch: 4 } });
	});

	it('bold apply should recover cursor when first restore is externally overridden', async () => {
		const editor = setupTest("| Low shelf   | 105 |");
		editor.setSelection({ line: 0, ch: 4 }, { line: 0, ch: 4 });

		const originalSetCursor = editor.setCursor.bind(editor);
		let firstRestoreCall = true;
		(editor as unknown as { setCursor: typeof editor.setCursor }).setCursor = ((pos: EditorPosition | number, ch?: number) => {
			if (firstRestoreCall) {
				firstRestoreCall = false;
				originalSetCursor({ line: 0, ch: 1 });
				return;
			}
			originalSetCursor(pos, ch);
		}) as typeof editor.setCursor;

		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "| **Low** shelf   | 105 |");
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.deepStrictEqual(editor.listSelections()[0], { anchor: { line: 0, ch: 6 }, head: { line: 0, ch: 6 } });
	});
});

describe('checkbox switching', () => {
	it('should detect checkbox on cursor line and replace its type', () => {
		const editor = setupTest("- [ ] task");
		editor.setSelection({ line: 0, ch: 4 }, { line: 0, ch: 4 });

		const checkbox = transformer.getCheckboxAtCursor();
		assert.ok(checkbox);
		assert.strictEqual(checkbox.checkboxChar, " ");
		assert.deepStrictEqual(checkbox.from, { line: 0, ch: 3 });
		assert.deepStrictEqual(checkbox.to, { line: 0, ch: 4 });

		const changed = transformer.changeCheckboxAtCursor("?");
		assert.strictEqual(changed, true);
		assert.strictEqual(editor.getEditorContent(), "- [?] task");
	});

	it('should support nested indentation and checked checkbox changes', () => {
		const editor = setupTest("  - [x] done");
		editor.setSelection({ line: 0, ch: 6 }, { line: 0, ch: 6 });

		const changed = transformer.changeCheckboxAtCursor("b");
		assert.strictEqual(changed, true);
		assert.strictEqual(editor.getEditorContent(), "  - [b] done");
	});

	it('should return false when cursor line is not a checkbox task', () => {
		const editor = setupTest("| table | row |");
		editor.setSelection({ line: 0, ch: 2 }, { line: 0, ch: 2 });

		assert.strictEqual(transformer.getCheckboxAtCursor(), null);
		assert.strictEqual(transformer.changeCheckboxAtCursor("x"), false);
		assert.strictEqual(editor.getEditorContent(), "| table | row |");
	});

	it('should change checkbox type across multiple cursor selections', () => {
		const editor = setupTest("- [ ] first\nnot a task\n- [x] third");
		editor.selections = [
			{ anchor: { line: 0, ch: 4 }, head: { line: 0, ch: 4 } },
			{ anchor: { line: 1, ch: 2 }, head: { line: 1, ch: 2 } },
			{ anchor: { line: 2, ch: 4 }, head: { line: 2, ch: 4 } },
		];

		const changedCount = transformer.changeCheckboxAtSelections("?");
		assert.strictEqual(changedCount, 2);
		assert.strictEqual(editor.getEditorContent(), "- [?] first\nnot a task\n- [?] third");
	});

	it('should promote regular bullets when enabled', () => {
		const editor = setupTest("- first");
		editor.setSelection({ line: 0, ch: 2 }, { line: 0, ch: 2 });

		const changed = transformer.changeCheckboxAtCursor("?", true);
		assert.strictEqual(changed, true);
		assert.strictEqual(editor.getEditorContent(), "- [?] first");
	});

	it('should promote regular bullets that start with a markdown link', () => {
		const editor = setupTest("\t- [GitHub - standardnotes/component-relay](https://github.com/standardnotes/component-relay)");
		editor.setSelection({ line: 0, ch: 3 }, { line: 0, ch: 3 });

		const changed = transformer.changeCheckboxAtCursor("?", true);
		assert.strictEqual(changed, true);
		assert.strictEqual(
			editor.getEditorContent(),
			"\t- [?] [GitHub - standardnotes/component-relay](https://github.com/standardnotes/component-relay)",
		);
	});

	it('should preserve behavior for regular bullets when promotion is disabled', () => {
		const editor = setupTest("- first");
		editor.setSelection({ line: 0, ch: 2 }, { line: 0, ch: 2 });

		const changed = transformer.changeCheckboxAtCursor("?", false);
		assert.strictEqual(changed, false);
		assert.strictEqual(editor.getEditorContent(), "- first");
	});

	it('should promote regular bullets in multi-cursor selection mode when enabled', () => {
		const editor = setupTest("- one\n- [x] two\nthree");
		editor.selections = [
			{ anchor: { line: 0, ch: 2 }, head: { line: 0, ch: 2 } },
			{ anchor: { line: 1, ch: 4 }, head: { line: 1, ch: 4 } },
			{ anchor: { line: 2, ch: 1 }, head: { line: 2, ch: 1 } },
		];

		const changedCount = transformer.changeCheckboxAtSelections("?", true);
		assert.strictEqual(changedCount, 2);
		assert.strictEqual(editor.getEditorContent(), "- [?] one\n- [?] two\nthree");
	});
});

describe('Multi-line Operations', () => {
	it('should correctly toggle bold/italics interleaving on bullet lists', () => {
		const editor = setupTest("- first line\n- second line\n  - third line");
		editor.setSelection({ line: 0, ch: 0 }, { line: 2, ch: 14 });

		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "- **first line**\n- **second line**\n  - **third line**");

		transformer.transformText('italics');
		assert.strictEqual(editor.getEditorContent(), "- _**first line**_\n- _**second line**_\n  - _**third line**_");

		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "- _first line_\n- _second line_\n  - _third line_");

		transformer.transformText('italics');
		assert.strictEqual(editor.getEditorContent(), "- first line\n- second line\n  - third line");

		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "- **first line**\n- **second line**\n  - **third line**");

		transformer.transformText('italics');
		assert.strictEqual(editor.getEditorContent(), "- _**first line**_\n- _**second line**_\n  - _**third line**_");
	});

	it('highlight: should un-highlight headings when selection starts/ends on blank lines', () => {
		const editor = setupTest("before\n\n# ==Heading A==\n## ==Heading B==\n\nafter");
		editor.setSelection({ line: 1, ch: 0 }, { line: 4, ch: 0 });
		transformer.transformText('highlight');
		assert.strictEqual(editor.getEditorContent(), "before\n\n# Heading A\n## Heading B\n\nafter");
	});

	it('remove formatting: should remove supported markers by line and word', () => {
		const editor = setupTest("# ==Heading==\nSome _it_ and **bold** and <u>u</u>");
		editor.setSelection({ line: 0, ch: 0 }, { line: 1, ch: 35 });
		transformer.transformText('removeFormatting');
		assert.strictEqual(editor.getEditorContent(), "# Heading\nSome it and bold and u");
	});

	it('remove formatting: should work from bare cursor on formatted word', () => {
		const editor = setupTest("foo **bar** baz");
		editor.setSelection({ line: 0, ch: 7 }, { line: 0, ch: 7 });
		transformer.transformText('removeFormatting');
		assert.strictEqual(editor.getEditorContent(), "foo bar baz");
	});
});

describe('edge-case text manipulation operations', () => {
	it('italics: should wrap parenthesized word but keep trailing punctuation outside', () => {
		const editor = setupTest("(word), next");
		editor.setSelection({ line: 0, ch: 3 }, { line: 0, ch: 3 });

		transformer.transformText('italics');
		assert.strictEqual(editor.getEditorContent(), "_(word)_, next");
	});

	it('bold: should style link label without breaking link destination', () => {
		const editor = setupTest("[label](https://example.com)");
		editor.setSelection({ line: 0, ch: 3 }, { line: 0, ch: 3 });

		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "[**label**](https://example.com)");
	});

	it('remove formatting: should preserve blank lines and indentation', () => {
		const editor = setupTest("- **one**\n\n  - _two_  ");
		editor.setSelection({ line: 0, ch: 0 }, { line: 2, ch: 11 });

		transformer.transformText('removeFormatting');
		assert.strictEqual(editor.getEditorContent(), "- one\n\n  - two  ");
	});

	it('remove formatting: should clear supported markers in callouts but keep callout syntax', () => {
		const editor = setupTest("> [!note] ==Title== and **strong**");
		editor.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 32 });

		transformer.transformText('removeFormatting');
		assert.strictEqual(editor.getEditorContent(), "> [!note] Title and strong");
	});

	it('bold: should work when user selection is backwards', () => {
		const editor = setupTest("reverse");
		editor.setSelection({ line: 0, ch: 7 }, { line: 0, ch: 0 });

		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "**reverse**");
	});

	it('non-stackable toggle: should remove outer style first for explicit selection', () => {
		const editor = setupTest("%%word%%");
		editor.setSelection({ line: 0, ch: 2 }, { line: 0, ch: 6 });

		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "word");

		transformer.transformText('bold');
		assert.strictEqual(editor.getEditorContent(), "**word**");
	});
});
