import type { Editor, EditorPosition } from "obsidian";
import type { StyleOperations, ValidOperations } from "./main";

export interface TextTransformerSettings {
	useAsteriskForItalics: boolean;
	promoteRegularBulletPoints: boolean;
}

interface StyleConfig {
	start: string;
	end: string;
}

interface Range {
	from: EditorPosition;
	to: EditorPosition;
}

interface BareToggleContext {
	op: StyleOperations;
	line: number;
	originalCursorCh: number;
	styledLine: string;
}

interface CheckboxAtCursor {
	line: number;
	checkboxChar: string;
	from: EditorPosition;
	to: EditorPosition;
}

const trimBefore = [
	"###### ",
	"##### ",
	"#### ",
	"### ",
	"## ",
	"# ",
	"- [ ] ",
	"- [x] ",
	"- ",
	'"',
	// "(",
	"[",
	">",
];

// ]( to not break markdown links
// :: preseve dataview inline fields
const trimAfter = [
	'"', 
	// ")", 
	"](", 
	"::", 
	"]"
];

const baseStyleConfig: Omit<Record<StyleOperations, StyleConfig>, "italics"> = {
	bold: { start: '**', end: '**' },
	highlight: { start: '==', end: '==' },
	inlineCode: { start: '`', end: '`' },
	comment: { start: '%%', end: '%%' },
	strikethrough: { start: '~~', end: '~~' },
	underscore: { start: '<u>', end: '</u>' },
	// inlineMath: { start: '$', end: '$' },
};

const stackableWith: Partial<Record<StyleOperations, readonly StyleOperations[]>> = {
	bold: ["italics", "strikethrough", "highlight"],
	italics: ["bold", "strikethrough", "highlight"],
	strikethrough: ["bold", "italics"],
	highlight: ["bold", "italics"],
};

const styleOperations = [...Object.keys(baseStyleConfig), "italics"] as StyleOperations[];


// for now, you have to manually update these
const reg_marker_bare = "\\*|_|(?:==)|`|(?:%%)|(?:~~)|<u>|<\\/u>"; // markers
const reg_word = "\\w+";
const reg_open_paren = "\\((?=\\w)";
const reg_close_paren = "(?<=\\w)\\)";
const reg_char = `(${reg_word}|${reg_open_paren}|${reg_close_paren}|${reg_marker_bare})`; // characters considered word

const reg_before = new RegExp(`${reg_char}*$`);
const reg_after = new RegExp(`^${reg_char}*`);
const reg_marker_before = new RegExp(`(${reg_marker_bare})+$`);
const reg_marker_after = new RegExp(`^(${reg_marker_bare})+`);
const checkboxRegex = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([^\]])(\])/;
const regularBulletRegex = /^(\s*(?:[-*+]|\d+[.)])\s+)/;

function escapeRegExp(str: string) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

export class TextTransformer {
	/** dynamically created array of regexes to trim from the start of our selection */
	trimBeforeRegexes: RegExp[] = [];
	/** dynamically created array of regexes to trim from the end of our selection */
	trimAfterRegexes: RegExp[] = [];
	
	// state:
	editor: Editor;
	// if we trim in trimSmartSelection, we need to account for that
	// when restoring the selection position
	trimmedBeforeLength: number = 0;
	trimmedAfterLength: number = 0;

	inProgress: boolean = false;
	lastBareToggleContext: BareToggleContext | null = null;
	pendingDeferredRestores = new Set<ReturnType<typeof setTimeout>>();
	settings: TextTransformerSettings = {
		useAsteriskForItalics: false,
		promoteRegularBulletPoints: true,
	};
	
	constructor(settings?: Partial<TextTransformerSettings>) {
		this.setSettings(settings);

		// the order of the regexes matters, since longer ones should be checked first (- [ ] before -)
		this.trimBeforeRegexes = trimBefore.map(x => new RegExp("^" + escapeRegExp(x)));
		this.trimBeforeRegexes.splice(8, 0, /- \[\S\] /); // checked & custom checked checkboxes
		this.trimBeforeRegexes.splice(6, 0, /> \[!\w+\] /); // callouts 
		// console.log(this.trimBeforeRegexes);
		// console.log(reg_before, reg_after)

		this.trimAfterRegexes = trimAfter.map(x => new RegExp(escapeRegExp(x) + "$"));
	}

	setSettings(settings?: Partial<TextTransformerSettings>) {
		this.settings = {
			useAsteriskForItalics: false,
			promoteRegularBulletPoints: true,
			...settings,
		};
	}

	getStyleConfig(op: StyleOperations) {
		if (op === "italics") {
			const marker = this.settings.useAsteriskForItalics ? "*" : "_";
			return { start: marker, end: marker };
		}
		return baseStyleConfig[op];
	}

	setEditor(editor: Editor) {
		this.editor = editor;
	}

	swapCursorsIfNeeded(from: EditorPosition, to: EditorPosition): Range {
		// selection was started from the back - reverse it
		if (from.line > to.line || from.line === to.line && from.ch > to.ch) {
			const tmp = from;
			from = to;
			to = tmp;
		}
		return { from, to } satisfies Range;
	}

	/** main function to transform text */
	transformText(op: ValidOperations, toggle = true) {
		if (this.inProgress) return; // large operations (1/2+ of a note) can be slow, rather noop.
		this.inProgress = true;
		this.clearDeferredRestores();
		// get & copy all selections for multi-cursor/multi-selection operations
		const selections: Range[] = this.editor.listSelections().map(_sel => {
			const { from, to } = this.swapCursorsIfNeeded(
				{ line: _sel.anchor.line, ch: _sel.anchor.ch }, 
				{ line: _sel.head.line, ch: _sel.head.ch }
			);
			return { from: {...from}, to: {...to} } satisfies Range;
		});

		try {
			for (let i = 0; i < selections.length; i++) {
				const sel = selections[i];
				this.trimmedBeforeLength = 0;
				this.trimmedAfterLength = 0;

				// remember original line lengths, so we can adjust the following selections
				const originalFromLineLength = this.editor.getLine(sel.from.line).length;
				const originalToLineLength = this.editor.getLine(sel.to.line).length;

				if (op === "removeFormatting") {
					const smartSel = this.getSmartSelection(sel);
					const selection = this.editor.getRange(sel.from, sel.to);
					const isSelection = !!selection && selection.length > 0;
					this.removeFormatting(smartSel, isSelection);

					for (let j = i + 1; j < selections.length; j++) {
						const sel2 = selections[j];
						this.updateSelectionOffsets(sel, sel2, originalFromLineLength, originalToLineLength);
					}
					continue;
				}

				const checkSel = this.getSmartSelection(sel, false);
				const smartSel = this.getSmartSelection(sel);
				const selection = this.editor.getRange(sel.from, sel.to);
				const isSelection = !!selection && selection.length > 0;
	
				// try removing styles first
				let stylesRemoved = false;
				const removeTarget = this.getStyleRemovalTarget(checkSel, smartSel, op);
				if (removeTarget) {
					this.removeStyle(sel, removeTarget, op, isSelection);
					stylesRemoved = true;
				} else {
					const incompatibleStyle = this.findIncompatibleStyle(checkSel, smartSel, op);
					if (incompatibleStyle) {
						const incompatibleTarget = this.getStyleRemovalTarget(checkSel, smartSel, incompatibleStyle);
						if (incompatibleTarget) {
							this.removeStyle(sel, incompatibleTarget, incompatibleStyle, isSelection);
							stylesRemoved = true;
						}
					}
				}
	
				// don't apply the style if we're only toggling and we just removed the style
				if (!toggle || !stylesRemoved) {
					const smartSel = this.getSmartSelection(sel, true);
					this.applyStyle(sel, smartSel, op, isSelection)
				}

				// adjust cursor positions if they're on the same line
				for (let j = i + 1; j < selections.length; j++) {
					const sel2 = selections[j];
					this.updateSelectionOffsets(sel, sel2, originalFromLineLength, originalToLineLength);
				}
			}
		} finally {
			this.inProgress = false;
		}
	}

	getStyleRemovalTarget(checkSel: Range, smartSel: Range, op: StyleOperations) {
		if (this.insideStyle(checkSel, op)) return checkSel;
		if (this.insideStyle(smartSel, op) || this.multilineInsideStyle(smartSel, op)) return smartSel;
		if (this.canRemoveStyleFromValue(this.editor.getRange(checkSel.from, checkSel.to), op)) return checkSel;
		if (this.canRemoveStyleFromSelection(smartSel, op)) return smartSel;
		return false;
	}

	isStackable(source: StyleOperations, target: StyleOperations) {
		if (source === target) return true;
		return stackableWith[source]?.includes(target) ?? false;
	}

	findIncompatibleStyle(checkSel: Range, smartSel: Range, op: StyleOperations) {
		for (const style of styleOperations) {
			if (style === op || this.isStackable(op, style)) continue;
			if (this.getStyleRemovalTarget(checkSel, smartSel, style)) return style;
		}
		return false;
	}

	/** Update remaining selections after a style has been applied or removed, accounting for length changes */
	updateSelectionOffsets(currentSel: Range, adjustSel: Range, originalFromLineLength: number, originalToLineLength: number): Range {
		// if either the starting line or the ending line was modified, adjust the selection

		if (adjustSel.from.line === currentSel.from.line) { // the 'from' line was modified, adjust it
			const newLineLength = this.editor.getLine(adjustSel.from.line).length;
			const diff = newLineLength - originalFromLineLength;
			adjustSel.from.ch += diff;
		}
		 if (adjustSel.to.line === currentSel.to.line) { // the 'to' line was modified, adjust it
			const newLineLength = this.editor.getLine(adjustSel.to.line).length;
			const diff = newLineLength - originalToLineLength;
			adjustSel.to.ch += diff;
		}
		return adjustSel;
	}

	insideStyle(sel: Range, op: StyleOperations) {
		const value = this.editor.getRange(sel.from, sel.to);
		return this.isStyleWrapped(value, op);
	}

	multilineInsideStyle(sel: Range, op: StyleOperations) {
		const value = this.editor.getRange(sel.from, sel.to);
		const lines = value.split("\n");
		const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
		if (nonEmptyLines.length === 0) return false;

		return nonEmptyLines.every((line) => {
			const trimmed = this.trimString(line).trim();
			if (trimmed.length === 0) return true;
			return this.isStyleWrapped(trimmed, op);
		});
	}

	isStyleWrapped(value: string, op: StyleOperations) {
		return !!this.getStyleWrapperLengths(value, op);
	}

	removeItalicsMarkers(value: string) {
		let next = value;
		if (/^_+/.test(next) && /_+$/.test(next)) {
			next = next.replace(/^_+/, "").replace(/_+$/, "");
		}

		const startMarkers = next.match(/^\*+/)?.[0] ?? "";
		const endMarkers = next.match(/\*+$/)?.[0] ?? "";
		if (startMarkers.length % 2 === 1 && endMarkers.length % 2 === 1) {
			next = next.replace(/^\*/, "").replace(/\*$/, "");
		}
		return next;
	}

	getStyleWrapperLengths(value: string, op: StyleOperations) {
		if (op === "italics") {
			const underscoreStart = value.match(/^_+/)?.[0] ?? "";
			const underscoreEnd = value.match(/_+$/)?.[0] ?? "";
			if (underscoreStart && underscoreEnd) {
				return { start: underscoreStart.length, end: underscoreEnd.length };
			}

			const starStart = value.match(/^\*+/)?.[0] ?? "";
			const starEnd = value.match(/\*+$/)?.[0] ?? "";
			if (starStart.length % 2 === 1 && starEnd.length % 2 === 1) {
				return { start: 1, end: 1 };
			}
			return false;
		}

		const style = this.getStyleConfig(op);
		if (!value.startsWith(style.start) || !value.endsWith(style.end)) return false;
		return { start: style.start.length, end: style.end.length };
	}

	canRemoveStyleFromValue(value: string, op: StyleOperations) {
		const { start: prefix, end: suffix } = this.getStyleConfig(op);
		return this.modifyStyleValue(value, op, 'remove', prefix, suffix) !== value;
	}

	canRemoveStyleFromSelection(sel: Range, op: StyleOperations) {
		const value = this.editor.getRange(sel.from, sel.to);
		const lines = value.split("\n");
		const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
		if (!nonEmptyLines.length) return false;

		return nonEmptyLines.some((line) => {
			const trimmedLine = this.trimString(line).trim();
			return trimmedLine.length > 0 && this.canRemoveStyleFromValue(trimmedLine, op);
		});
	}

	/** get the Range of the smart selection created by expanding the current one / from cursor*/
	getSmartSelection(sel: Range, trim = true) {
		const selection = this.editor.getRange(sel.from, sel.to);
		if (selection && selection.length > 0) {
			return this.getSmartSelectionRange(sel,trim);
		} else {
			return this.getSmartSelectionBare(sel, trim);
		}
	}

	/** trim the selection (Range) to not include stuff we don't want */
	trimSmartSelection(sel: Range): Range {
		let from = sel.from;
		let to = sel.to;

		const startLine = this.editor.getLine(sel.from.line);
		const endLine = this.editor.getLine(sel.to.line);
		// console.log("before trimming:", `'${this.editor.getRange(from, to)}'`);

		for (const regex of this.trimBeforeRegexes) {
			const match = startLine.slice(
				from.ch, 
				from.line === to.line ? to.ch : startLine.length
			).match(regex);
			
			if (match) {
				from.ch = from.ch + match[0].length;
				this.trimmedBeforeLength += match[0].length; // keep count of how many chars we trimmed
			}
		}
		for (const regex of this.trimAfterRegexes) {
			const match = endLine.slice(
				from.line === to.line ? from.ch : 0,
				to.ch, 
			).match(regex);

			if (match) {
				to.ch = to.ch - match[0].length;
				this.trimmedAfterLength += match[0].length; // keep count of how many chars we trimmed
			}
		}
		// console.log("after trimming", `'${this.editor.getRange(from, to)}'`);
		return { from, to } satisfies Range;
	}

	/** 
	 * get 3 parts of a string: 
	 * - stuff that would be trimmed before
	 * - the actual selection
	 * - stuff that would be trimmed after
	 * 
	 * used when applying/removing a style on multiple lines
	 */
	#trimStringWithParts(sel: string, trimWhitespace = true) {
		let sel2 = sel;
		let trimmedBefore = "";
		let trimmedAfter = "";

		// if we are trimming whitespace, we need to add whitespace trimming regexes
		const preTrimRegexes = [...this.trimBeforeRegexes]
		const postTrimRegexes = [...this.trimAfterRegexes]
		if (trimWhitespace) {
			preTrimRegexes.splice(0, 0, new RegExp("^\\s+"));
			postTrimRegexes.splice(0, 0, new RegExp("\\s+$"));
		}

		for (const regex of preTrimRegexes) { // trim before & remember
			const match = sel2.match(regex);
			if (match) trimmedBefore += match[0];
			sel2 = sel2.replace(regex, "");
		}

		for (const regex of postTrimRegexes) { // trim after & remember
			const match = sel2.match(regex);
			if (match) trimmedAfter += match[0];
			sel2 = sel2.replace(regex, "");
		}

		return { trimmedBefore, result: sel2, trimmedAfter };
	}
	
	/** trim a selection (string) to not include stuff we don't want */
	trimString(sel: string) {
		return this.#trimStringWithParts(sel, false).result;
	}

	// pre-trim whitespace to keep restored selections stable
	whitespacePretrim(sel: Range): Range {
		const selection = this.trimString(this.editor.getRange(sel.from, sel.to));
		const whitespaceBefore = (selection.match(/^\s+/) || [""])[0];
		const whitespaceAfter = (selection.match(/\s+$/) || [""])[0];

		return {
			from: { line: sel.from.line, ch: sel.from.ch + whitespaceBefore.length },
			to: { line: sel.to.line, ch: sel.to.ch - whitespaceAfter.length },
		} satisfies Range;
	}

	/** get the Range of the smart selection created by expanding from cursor*/
	getSmartSelectionBare(original: Range, trim: boolean): Range {
		const cursor = original.to;
		const lineText = this.editor.getLine(cursor.line);

		// chunks of selection before & after cursor, string value
		const before = (lineText.slice(0, cursor.ch).match(reg_before) || [""])[0];
		const after = (lineText.slice(cursor.ch).match(reg_after) || [""])[0];
		
		const start = cursor.ch - before.length;
		const end = cursor.ch + after.length;
		
		let sel = {
			from: { line: cursor.line, ch: start },
			to: { line: cursor.line, ch: end },
		} satisfies Range;

		if (trim) sel = this.trimSmartSelection(sel);
		return sel satisfies Range;
	}

	/** get the Range of the smart selection created by expanding the current one*/
	getSmartSelectionRange(original: Range, trim: boolean): Range {
		const { from, to } = this.swapCursorsIfNeeded({...original.from}, {...original.to});
		let startCursor = from;
		let endCursor = to;
		
		// chunks of selection before the start cursor & after the end cursor, string value
		const startLine = this.editor.getLine(startCursor.line);
		const endLine = this.editor.getLine(endCursor.line);

		// 1. grow selection by markers
		const before_markers = (startLine.slice(0, startCursor.ch).match(reg_marker_before) || [""])[0];
		const after_markers = (endLine.slice(endCursor.ch).match(reg_marker_after) || [""])[0];
		startCursor.ch -= before_markers.length;
		endCursor.ch += after_markers.length;
		
		// 2. trim whitespace ('fix up selection')
		const corrected = this.whitespacePretrim({ from: startCursor, to: endCursor });
		startCursor = corrected.from;
		endCursor = corrected.to;
		
		// 3. grow selection by words (including markers)
		const before = (startLine.slice(0, startCursor.ch).match(reg_before) || [""])[0];
		const after = (endLine.slice(endCursor.ch).match(reg_after) || [""])[0];

		// console.log(startLine.slice(0, startCursor.ch).match(reg_before), endLine.slice(endCursor.ch).match(reg_after))
		// if (debug) console.log(startCursor, endCursor, `b: '${before}'`, `a: '${after}'`);

		let sel = {
			from: { line: startCursor.line, ch: startCursor.ch - before.length},
			to: { line: endCursor.line, ch: endCursor.ch + after.length },
		}
		
		// trim selection of stuff we don't want, if trim is true
		if (trim) sel = this.trimSmartSelection(sel);
		return sel satisfies Range;
	}

	/** get an offset cursor */
	offsetCursor(cursor: EditorPosition, offset: number) {
		const offsetValue = cursor.ch + offset;
		if (offsetValue < 0) return { line: cursor.line, ch: 0 };
		if (offsetValue > this.editor.getLine(cursor.line).length) {
			return { line: cursor.line, ch: this.editor.getLine(cursor.line).length }
		};
		return { line: cursor.line, ch: offsetValue };
	}

	/** calculate the offset when restoring the cursor / selection */
	calculateOffsets(sel: Range, modification: 'apply' | 'remove', op: StyleOperations, prefix: string, suffix: string) {
		const selection = this.editor.getRange(sel.from, sel.to)

		const includesMarkersStart = this.hasStyleMarkerAtStart(selection, op, prefix);
		const includesMarkersEnd = this.hasStyleMarkerAtEnd(selection, op, suffix);
		const modifMultiplier = modification === 'remove' ? -1 : 1;
		const pm = prefix.length * modifMultiplier;
		const sm = suffix.length * modifMultiplier;
		
		// see rules for restoring cursor position in my obsidian note for this plugin
		// i cannot believe i manage to make it this simple
		let pre = includesMarkersStart ? 0 : pm;
		let post = pm + (includesMarkersEnd ? sm : 0)
		
		// console.table({
		// 	selection, pre,post,
		// 	includesMarkersStart, includesMarkersEnd,
		// 	multiline,
		// 	btriml: this.trimmedBeforeLength,
		// 	atriml: this.trimmedAfterLength,
		// });

		pre -= this.trimmedBeforeLength;
		post += this.trimmedAfterLength;
		return { pre, post };
	}

	hasStyleMarkerAtStart(value: string, op: StyleOperations, marker: string) {
		if (op === "italics") return /^[_*]+/.test(value);
		return value.startsWith(marker);
	}

	hasStyleMarkerAtEnd(value: string, op: StyleOperations, marker: string) {
		if (op === "italics") return /[_*]+$/.test(value);
		return value.endsWith(marker);
	}

	removeStyleMarkers(value: string, op: StyleOperations, prefix: string, suffix: string): string {
		if (op === "italics") {
			const direct = this.removeItalicsMarkers(value);
			if (direct !== value) return direct;
		} else {
			const direct = value
				.replace(new RegExp("^" + escapeRegExp(prefix)), "")
				.replace(new RegExp(escapeRegExp(suffix) + "$"), "");
			if (direct !== value) return direct;
		}

		for (const outer of styleOperations) {
			if (outer === op || !this.isStackable(op, outer)) continue;
			const wrapper = this.getStyleWrapperLengths(value, outer);
			if (!wrapper) continue;

			const outerPrefix = value.slice(0, wrapper.start);
			const outerSuffix = value.slice(value.length - wrapper.end);
			const inner = value.slice(wrapper.start, value.length - wrapper.end);
			const removedInner = this.removeStyleMarkers(inner, op, prefix, suffix);
			if (removedInner !== inner) return outerPrefix + removedInner + outerSuffix;
		}
		return value;
	}

	modifyStyleValue(value: string, op: StyleOperations, modification: 'apply' | 'remove', prefix: string, suffix: string) {
		if (modification === 'apply') return prefix + value + suffix;
		return this.removeStyleMarkers(value, op, prefix, suffix);
	}

	getCursorWithLineClamp(line: number, ch: number) {
		return { line, ch: Math.max(0, Math.min(ch, this.editor.getLine(line).length)) } satisfies EditorPosition;
	}

	clearDeferredRestores() {
		for (const timeoutId of this.pendingDeferredRestores) {
			clearTimeout(timeoutId);
		}
		this.pendingDeferredRestores.clear();
	}

	scheduleDeferredRestore(fn: () => void) {
		const timeoutId = setTimeout(() => {
			this.pendingDeferredRestores.delete(timeoutId);
			fn();
		}, 0);
		this.pendingDeferredRestores.add(timeoutId);
	}

	setCursorWithRetry(pos: EditorPosition) {
		this.editor.setCursor(pos);
		this.scheduleDeferredRestore(() => this.editor.setCursor(pos));
	}

	/** either add apply or remove a style for a given string */
	#modifyLine(selVal: string, prefix: string, suffix: string, modification: 'apply' | 'remove', op: StyleOperations, trim = false) {
		const { trimmedBefore, result, trimmedAfter } = this.#trimStringWithParts(selVal);
		if (trim) selVal = result;

		let newVal = this.modifyStyleValue(selVal, op, modification, prefix, suffix);
			
		// do not apply styles to empty lines
		if (modification === "apply" && selVal.trim().length === 0) newVal = selVal;

		if (trim) newVal = trimmedBefore + newVal + trimmedAfter;
		return newVal;
	}

	/** either apply or remove a style for a given Range */
	#modifySelection(
		original: Range,
		smartSel: Range, 
		op: StyleOperations, 
		modification: 'apply' | 'remove', 
		isSelection: boolean,
		debug_dryRun = false,
	) {
		// pre-trim whitespace from user's selection for cleaner restore behavior
		const sel2 = this.whitespacePretrim(original);

		const { start: prefix, end: suffix } = this.getStyleConfig(op);

		// used when restoring previous cursor / selection position
		// account for any whitespace we trimmed in cursor position
		const offsets = this.calculateOffsets(sel2, modification, op, prefix, suffix);

		if (debug_dryRun) {
			this.editor.setSelection(smartSel.from, smartSel.to);
			return;
		}

		if (isSelection) {
			this.lastBareToggleContext = null;
			this.editor.setSelection(smartSel.from, smartSel.to); // set to expanded selection
			const selVal = this.editor.getSelection(); // get new content
			const multiline = sel2.from.line !== sel2.to.line;

			// apply for each line separately if the selection is multiline
			const newVal = multiline
				? selVal.split("\n").map(line => this.#modifyLine(line, prefix, suffix, modification, op, true)).join("\n")
				: this.#modifyLine(selVal, prefix, suffix, modification, op);

			this.editor.replaceSelection(newVal); // replace the actual string in the editor

			const restoreSel = {
				from: this.offsetCursor(sel2.from, offsets.pre),
				to: this.offsetCursor(sel2.to, offsets.post),
			}

			this.editor.setSelection(restoreSel.from, restoreSel.to); // v fix live preview "adjusting" selection
			this.scheduleDeferredRestore(() => this.editor.setSelection(restoreSel.from, restoreSel.to));
		} else {
			const cursor = sel2.to; // save cursor
			const lineBefore = this.editor.getLine(cursor.line);
			const selVal = this.editor.getRange(smartSel.from, smartSel.to)

			const newVal = this.modifyStyleValue(selVal, op, modification, prefix, suffix);
			this.editor.replaceRange(newVal, smartSel.from, smartSel.to);

			let restoredCursor = this.offsetCursor(cursor, offsets.pre);
			if (
				modification === 'remove'
				&& this.lastBareToggleContext
				&& this.lastBareToggleContext.op === op
				&& this.lastBareToggleContext.line === cursor.line
				&& this.lastBareToggleContext.styledLine === lineBefore
				&& cursor.ch >= smartSel.from.ch
				&& cursor.ch <= smartSel.to.ch
			) {
				restoredCursor = this.getCursorWithLineClamp(cursor.line, this.lastBareToggleContext.originalCursorCh);
			}
			this.setCursorWithRetry(restoredCursor); // restore cursor (offset by prefix)

			if (modification === 'apply') {
				this.lastBareToggleContext = {
					op,
					line: restoredCursor.line,
					originalCursorCh: cursor.ch,
					styledLine: this.editor.getLine(restoredCursor.line),
				};
			} else {
				this.lastBareToggleContext = null;
			}
		}
	}

	#stripSupportedMarkers(value: string) {
		let next = value;
		let previous = "";
		while (next !== previous) {
			previous = next;
			next = next
				.replace(/^(?:\*\*|==|`|%%|~~|<u>|<\/u>|[_*])+/, "")
				.replace(/(?:\*\*|==|`|%%|~~|<u>|<\/u>|[_*])+$/, "");
		}
		return next;
	}

	#removeFormattingWord(word: string) {
		const before = (word.match(/^[^\w<*_`~%=]+/) || [""])[0];
		const after = (word.match(/[^\w>/*_`~%=]+$/) || [""])[0];
		const coreStart = before.length;
		const coreEnd = word.length - after.length;
		const core = coreEnd >= coreStart ? word.slice(coreStart, coreEnd) : "";
		return before + this.#stripSupportedMarkers(core) + after;
	}

	removeFormatting(sel: Range, isSelection: boolean) {
		this.editor.setSelection(sel.from, sel.to);
		const current = this.editor.getSelection();
		const lines = current.split("\n");
		const cleanedLines = lines.map((line) => line
			.split(/(\s+)/)
			.map((part) => /\s+/.test(part) ? part : this.#removeFormattingWord(part))
			.join(""));
		const cleaned = cleanedLines.join("\n");

		this.editor.replaceSelection(cleaned);

		const end = cleanedLines.length === 1
			? { line: sel.from.line, ch: sel.from.ch + cleanedLines[0].length }
			: { line: sel.from.line + cleanedLines.length - 1, ch: cleanedLines[cleanedLines.length - 1].length };
		if (isSelection) {
			this.editor.setSelection(sel.from, end);
		} else {
			this.editor.setCursor(end);
		}
	}

	applyStyle(sel: Range, smartSel: Range, op: StyleOperations, isSelection: boolean) {
		this.#modifySelection(sel, smartSel, op, 'apply', isSelection);
	}

	removeStyle(sel: Range, smartSel: Range, wrappedWith: StyleOperations, isSelection: boolean) {
		this.#modifySelection(sel, smartSel, wrappedWith, 'remove', isSelection);
	}

	getCheckboxAtLine(line: number): CheckboxAtCursor | null {
		const lineValue = this.editor.getLine(line);
		const match = lineValue.match(checkboxRegex);
		if (!match) return null;

		const prefixLength = match[1].length;
		const checkboxChar = match[2];
		const charFrom = prefixLength;
		return {
			line,
			checkboxChar,
			from: { line, ch: charFrom },
			to: { line, ch: charFrom + 1 },
		};
	}

	getCheckboxesAtSelections() {
		return this.getSelectionLines()
			.map((line) => this.getCheckboxAtLine(line))
			.filter((checkbox): checkbox is CheckboxAtCursor => !!checkbox);
	}

	getCheckboxAtCursor(): CheckboxAtCursor | null {
		return this.getCheckboxesAtSelections()[0] ?? null;
	}

	getRegularBulletInsertAtLine(line: number): EditorPosition | null {
		const lineValue = this.editor.getLine(line);
		const match = lineValue.match(regularBulletRegex);
		if (!match) return null;
		return { line, ch: match[1].length };
	}

	getSelectionLines() {
		return [...new Set(this.editor.listSelections().map((selection) => selection.head.line))]
			.sort((a, b) => a - b);
	}

	getCursorLine() {
		return this.editor.listSelections()[0]?.head.line ?? null;
	}

	canChangeCheckboxAtCursor(promoteRegularBullets = false) {
		if (this.getCheckboxAtCursor()) return true;
		if (!promoteRegularBullets) return false;
		const line = this.getCursorLine();
		if (line == null) return false;
		return !!this.getRegularBulletInsertAtLine(line);
	}

	changeCheckboxAtCursor(nextCheckboxChar: string, promoteRegularBullets = false) {
		if (nextCheckboxChar.length !== 1) return false;
		const line = this.getCursorLine();
		if (line == null) return false;
		const checkbox = this.getCheckboxAtLine(line);
		if (checkbox) {
			this.editor.replaceRange(nextCheckboxChar, checkbox.from, checkbox.to);
			return true;
		}
		if (!promoteRegularBullets) return false;
		const insertAt = this.getRegularBulletInsertAtLine(line);
		if (!insertAt) return false;
		this.editor.replaceRange(`[${nextCheckboxChar}] `, insertAt);
		return true;
	}

	changeCheckboxAtLine(line: number, nextCheckboxChar: string, promoteRegularBullets = false) {
		const checkbox = this.getCheckboxAtLine(line);
		if (checkbox) {
			this.editor.replaceRange(nextCheckboxChar, checkbox.from, checkbox.to);
			return true;
		}

		if (!promoteRegularBullets) return false;
		const insertAt = this.getRegularBulletInsertAtLine(line);
		if (!insertAt) return false;
		this.editor.replaceRange(`[${nextCheckboxChar}] `, insertAt);
		return true;
	}

	changeCheckboxAtSelections(nextCheckboxChar: string, promoteRegularBullets = false) {
		if (nextCheckboxChar.length !== 1) return 0;
		const lines = this.getSelectionLines();
		let changedCount = 0;
		for (const line of lines) {
			if (this.changeCheckboxAtLine(line, nextCheckboxChar, promoteRegularBullets)) {
				changedCount++;
			}
		}
		return changedCount;
	}
}
