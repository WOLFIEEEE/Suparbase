<!--
Thanks for contributing! Please walk this short checklist before requesting
review. Anything you skip should be called out so the reviewer can decide.
-->

## What this changes

<!-- One paragraph. Lead with the user-visible effect, not the code. -->

## Why

<!--
Link an issue / discussion, OR cite the constitution principle / spec
artifact that motivated this. Bug fixes can be terse.
-->

## How it was tested

<!--
Tick what you ran. If you skipped one, say why.
-->

- [ ] `pnpm typecheck` — clean
- [ ] `pnpm build` — passes; bundle deltas noted below if changed
- [ ] Manual smoke walk of the affected route(s)
- [ ] If a spec-kit feature: walked the `quickstart.md` checklist
- [ ] `rg "console\.(log|warn|error)" src/` returns nothing
- [ ] No new dependencies (or: justified in the body)

## Bundle / performance impact

<!--
If you touched components shared by authenticated routes, paste the
relevant rows of `pnpm build`'s "Route (app)" table — before vs after.
The Constitution caps first-paint JS at 520 KB gz per authed route.
Otherwise: "no UI changes".
-->

## Screenshots / GIFs

<!-- For UI work. Light and dark mode if applicable. -->

## Constitution principles touched

<!--
Reference any of the nine principles in
`.specify/memory/constitution.md` that this PR interacts with — perf,
accessibility, vault, server/client boundary, etc. If you're not sure,
list a guess and the reviewer will confirm.
-->
