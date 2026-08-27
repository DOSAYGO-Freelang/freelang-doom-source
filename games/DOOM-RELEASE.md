# Freelang Doom Engine

This archive contains the native Freelang Doom application. It does not
contain, download, search for, or redistribute a WAD.

Run:

```text
macOS/Linux:  ./doom-play /path/to/DOOM.WAD E1M1
Windows:      doom-play.exe C:\path\to\DOOM.WAD E1M1
```

The map argument is optional. Useful options include:

```text
--resolution=960x600
--no-music
--input-log=/path/to/doom-input.log
```

The caller must supply a compatible Doom-format IWAD or PWAD. See the project
release notes and `games/README.md` in the source repository for controls,
capability boundaries, and current compatibility details.

The macOS archives include the native speaker sidecar. The current Windows and
Linux archives have no admitted native speaker implementation and therefore
continue silently; gameplay and visual effects remain available.
