# MEH: More Excellent Hotkeys
  
small obsidian plugin for quick markdown formatting toggles.  
  
- the main feature is that it selects up to the nearest word:  
  - selecting something like: `hello th[is is some sent]ence` and hitting `Toggle bold` (from this plugin) will result in `hello **this is some sentence**`
  - similarly, `hello **thi[s is some sen]tence**` -> `Toggle bold` -> ``hello this is some sentence`.
- cursor position is preserved where reasonable.

## commands added
this plugin adds editor commands you can bind to your own hotkeys (no default bindings).  
- Toggle bold
- Toggle highlight
- Toggle italics
- Toggle inline code
- Toggle comment
- Toggle strikethrough
- Toggle underscore
- Remove formatting

## other
- thanks to Berggeit for the name
- thanks to [obsidian-smarter-md-hotkeys](https://github.com/chrisgrieser/obsidian-smarter-md-hotkeys) for the idea and some code