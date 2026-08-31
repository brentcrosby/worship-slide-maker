# Lyric Slide Maker

Lyric Slide Maker is a browser-based tool that turns plain-text or ChordPro song lyrics into editable presentation slides and PowerPoint files.

## Features

- Import `.txt` and ChordPro files (`.cho`, `.crd`, `.chordpro`, `.pro`).
- Clean ChordPro chords and directives into plain lyrics on import.
- Automatically detect verse, chorus, pre-chorus, bridge, tag, ending, refrain, intro, interlude, and vamp section labels.
- Break slides by a fixed number of lyric lines or by a maximum number of rendered display lines.
- Edit slide text, change section tags, add blank slides, duplicate slides, delete slides, and drag slides to reorder them.
- Configure font, font size, bold text, line spacing, text color, background color, horizontal alignment, vertical alignment, and aspect ratio.
- Generate an optional title slide from the first lyric line.
- Present slides in fullscreen with click, button, and keyboard navigation.
- Persist lyrics, slides, selected styles, and controls in local browser storage.
- Export the slide deck as a `.pptx` file using PptxGenJS.

## Getting Started

No build step is required. Open `index.html` directly in a browser.

The app is self-contained in this repository:

- `index.html` defines the interface and loads the app assets.
- `styles.css` contains the application styling.
- `app.js` handles lyric parsing, slide generation, editing, persistence, presentation mode, and export.
- `vendor/pptxgen.bundle.min.js` provides the bundled PptxGenJS dependency used for PowerPoint export.

## Usage

1. Paste lyrics into the lyrics field or import a `.txt` or ChordPro file.
2. Put the song title on the first line and optional section labels such as `Verse 1`, `Chorus`, `Bridge`, `Tag`, or `Ending` on their own lines.
3. Choose whether slides break by lyric lines or rendered display lines.
4. Adjust typography, colors, alignment, and aspect ratio.
5. Generate slides, then edit, duplicate, delete, or drag them into the desired order.
6. Use presentation mode for fullscreen playback or export the deck as a `.pptx` file.

## Technology

Lyric Slide Maker uses vanilla HTML, CSS, and JavaScript with a bundled PptxGenJS dependency. It stores work locally with `localStorage` and does not require a package manager, build tool, or server.
