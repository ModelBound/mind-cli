# @modelbound/mind-cli

Command-line tools for the [`.mind/` specification](https://github.com/ModelBound/mind-spec).

```bash
npx @modelbound/mind-cli init          # scaffold a new .mind/ folder
npx @modelbound/mind-cli validate      # check the folder against the spec
npx @modelbound/mind-cli gc            # remove stale diffs, merge duplicates
npx @modelbound/mind-cli trust <path>  # freeze a memory as human-reviewed
npx @modelbound/mind-cli diff <target> # scaffold a proposed-write file
```

## Install

```bash
npm i -g @modelbound/mind-cli
```

## Usage

### `mind init`

Creates a `.mind/` folder in the current directory with `INDEX.md`, `self.md`, and the standard subdirectories.

```bash
mind init --agent coding-assistant
```

### `mind validate`

Parses every file in `.mind/`, checks frontmatter, and reports missing or malformed entries. Exits non-zero on error.

### `mind gc`

Removes `.mind/diff/*.md` files that reference targets no longer present in the tree, and older than 30 days. Prints what it would do with `--dry-run`.

### `mind trust <path>`

Sets `trust: human-reviewed` and `confidence: 1.0` on the target file.

### `mind diff <target>`

Scaffolds a new proposed-write file under `.mind/diff/` with today's date and an auto-incremented sequence number.

## License

Apache 2.0.
