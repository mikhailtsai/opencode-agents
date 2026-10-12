# Vendor patches

Third-party skills are installed as git clones under `~/.config/opencode/vendor/` (see the main README).
Some carry local OpenCode adaptations; apply the patch after cloning, or keep it as the record of the
local changes.

- `ref2game-opencode.patch` — adaptations to `studioigor/ref2game` (claude edition):
  - `claude/SKILL.md`: an `## OpenCode runtime` section and a fixed (never-ask) `codex` image generator.
  - `claude/scripts/gen.py`: the `codex` provider recovers the real image from
    `$CODEX_HOME/generated_images/<session>/` (the built-in `image_gen` returns inline base64 with no
    path), rejects decoy/empty targets, and cleans up an unusable target on failure.

  Re-apply with: `git -C ~/.config/opencode/vendor/ref2game apply <repo>/patches/ref2game-opencode.patch`
