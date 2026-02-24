# TypeScript strict mode migration

The main `tsconfig.json` currently has `"strict": false`. Enabling strict mode improves type safety and maintainability.

## Plan

1. **Enable strict incrementally**  
   Create or use a config that extends the base and sets `"strict": true` (and optionally `"noImplicitAny": true`, etc.) so you can run type-checking with strict rules without breaking the main build.

2. **Fix errors in small steps**  
   Run `npx tsc --noEmit -p tsconfig.strict.json` (or similar) and fix reported errors file-by-file or directory-by-directory. Prefer fixing new or touched code first.

3. **Switch the main build**  
   Once the codebase passes under the strict config, set `"strict": true` in `tsconfig.json` and remove the separate strict config if desired.

## Quick check

To see how many strict errors exist without changing the main build:

- Add a `tsconfig.strict.json` that extends `tsconfig.json` and overrides `compilerOptions.strict: true`.
- Run: `npx tsc --noEmit -p tsconfig.strict.json`

Common fixes: add explicit types for function parameters and return values, use optional chaining and nullish checks, and type `error` in catch blocks as `unknown` then narrow.
