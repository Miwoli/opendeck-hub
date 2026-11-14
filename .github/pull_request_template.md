## What and why

<!-- Closes #<issue> -->

## Checklist

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build` (and `npm run smoke` / `npm run check-manifests` if a plugin or manifest changed)
- [ ] PR title is a Conventional Commit (`type(scope): summary`): PRs are squash-merged and release-please builds the changelog from it, so no manual `CHANGELOG.md` edit
- [ ] Docs updated (plugin README, `docs/`) where behavior changed
- [ ] No secrets, tokens, personal data or home paths in code, screenshots or logs
