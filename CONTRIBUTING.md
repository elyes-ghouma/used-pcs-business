# Contributing

Thanks for taking a look. This is a small project; issues and pull requests are welcome.

## Before you open a pull request

```bash
npm install
npm run check          # typecheck + lint + unit/SQL tests + production build
npm run security:scan  # secrets in source, git history and the browser bundle (run after a build)
```

- **Security-relevant changes** (database functions, RLS, grants, rate limits, uploads, auth) need a test in `tests/db` or `tests/unit` that fails without the change. Read [`SECURITY.md`](SECURITY.md) first: the database, not the website, is the security perimeter.
- **New visible text** goes in both `src/i18n/messages/en.ts` and `fr.ts` (a unit test fails if a key is missing in either).
- **Database changes** are new files in `supabase/migrations`, never edits to old ones. The SQL test suite applies every migration to an in-process Postgres, so no Supabase project is needed for `npm test`.
- Browser tests (`npm run test:e2e`) need a throwaway Supabase project, see the README. CI does not run them.
- Never commit `.env*` files, keys or real customer data.

## Reporting a vulnerability

Use GitHub's private reporting (the repository's **Security** tab), not a public issue. See [`SECURITY.md`](SECURITY.md).
