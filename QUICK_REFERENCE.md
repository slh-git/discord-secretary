# Quick Reference - Multi-Account Google Calendar

## Daily Commands

### View calendar for an account
```bash
node test-calendar.js <accountId>
```

### List all accounts
```bash
node manage-accounts.js list
```

### Check account status
```bash
node manage-accounts.js info <accountId>
```

## Setup Commands

### Add new account
```bash
node manage-accounts.js add <accountId>
# Then authorize it:
node test-calendar.js <accountId>
```

### Remove account
```bash
node manage-accounts.js remove <accountId>
```

## Examples

### Managing multiple Google accounts
```bash
# Work account
node manage-accounts.js add work
node test-calendar.js work

# Personal account
node manage-accounts.js add personal
node test-calendar.js personal

# Client account
node manage-accounts.js add client-acme
node test-calendar.js client-acme
```

## File Structure
```
google-accounts/
├── accounts.json                 # Account registry
├── tokens-personal.json         # Personal account tokens
├── tokens-work.json            # Work account tokens
└── tokens-client-acme.json     # Client account tokens
```

## Tips

- Account IDs should be short and memorable (e.g., "work", "personal")
- Tokens auto-refresh when expired
- All token files are gitignored for security
- Use `info` command to check authorization status
