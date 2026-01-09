# Contributing to Mate

## Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0): Breaking changes to the bot's behavior or API
- **MINOR** (0.2.0): New features (new commands, integrations, tools)
- **PATCH** (0.1.1): Bug fixes and minor improvements

### Version Bump Workflow

1. Update `CHANGELOG.md` with changes under `[Unreleased]`
2. Run the appropriate version command:
   ```bash
   npm run version:patch   # Bug fixes
   npm run version:minor   # New features
   npm run version:major   # Breaking changes
   ```
3. Push the tag: `git push origin --tags`

### Changelog Guidelines

- Group changes by type: Added, Changed, Deprecated, Removed, Fixed, Security
- Write clear, user-facing descriptions
- Reference issue/PR numbers when applicable

## Development

```bash
# Install dependencies
npm install

# Run in dev mode
npm run dev

# Run tests
npm test

# Type check
npm run typecheck

# Build
npm run build
```

## Deployment

```bash
# Deploy to Pi
npm run deploy

# Restart on Pi
npm run deploy:restart

# View logs
npm run deploy:logs
```
