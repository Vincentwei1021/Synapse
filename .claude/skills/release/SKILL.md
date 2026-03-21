---
name: release
description: Release a new version of Synapse — bump version, update CHANGELOG, commit, tag, and create GitHub release.
license: AGPL-3.0
metadata:
  author: synapse
  version: "0.1.0"
  category: development
---

# Synapse Release Process

Step-by-step guide to cut a new release of Synapse.

## Prerequisites

- All changes for the release are merged into `main`
- `gh` CLI is authenticated (`gh auth status`)
- Working tree is clean (`git status`)

## Steps

### 1. Identify the diff since last release

```bash
# Find the previous release tag
git tag -l 'v*' --sort=-version:refname | head -5

# List commits since previous tag
git log --oneline v<PREV>..HEAD

# Review each commit for CHANGELOG-worthy changes
git show --stat <commit-hash>
```

### 2. Update CHANGELOG.md

Add a new section at the top of `CHANGELOG.md`, below the `# Changelog` header and above the previous release section. Use this structure:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- **Feature name**: Description of what was added.

### Changed
- **Area**: Description of what changed.

### Fixed
- **Bug name**: Description of what was fixed.

### Plugin
- Plugin version changes if applicable.

---
```

**Rules:**
- Only include commits **after** the previous release tag
- Group by Added / Changed / Fixed / Deprecated / Removed / Plugin
- Omit empty groups
- Each entry should start with a **bold label** followed by a concise description
- Separate from the previous release section with `---`

### 3. Bump version in package.json

```bash
# Edit package.json "version" field
# e.g., "0.1.0" → "0.1.1"
```

Follow [semver](https://semver.org/):
- **patch** (0.1.0 → 0.1.1): bug fixes, minor additions
- **minor** (0.1.0 → 0.2.0): new features, non-breaking changes
- **major** (0.1.0 → 1.0.0): breaking changes

### 4. Commit

```bash
git add CHANGELOG.md package.json
git commit -m "chore: bump version to vX.Y.Z and update CHANGELOG"
git push
```

### 5. Create GitHub release with tag

```bash
gh release create vX.Y.Z \
  --target main \
  --title "vX.Y.Z" \
  --notes "$(cat <<'EOF'
<paste only the new version's CHANGELOG section here, without the ## header>
EOF
)"
```

**Important:** The `--notes` should contain **only** the new version's content, not the entire CHANGELOG file.

### 6. Verify

```bash
# Confirm tag exists
git tag -l 'vX.Y.Z'

# Confirm release is visible
gh release view vX.Y.Z
```

## Checklist

- [ ] `git log v<PREV>..HEAD` reviewed — no commits missed
- [ ] CHANGELOG.md updated with correct date and content
- [ ] package.json version bumped
- [ ] Committed and pushed to main
- [ ] `gh release create` with tag on main
- [ ] Release notes contain only the new version's section
- [ ] `gh release view` confirms everything looks correct
