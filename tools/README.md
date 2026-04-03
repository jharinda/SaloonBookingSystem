# SnapSalon Development Tools

## scripts/
One-off data migration and debug scripts. Run with: `node tools/scripts/<name>.js` or
`npm run mongo:migrate-cleanup` (normalizes stray collections and duplicate DB names).
These connect directly to MongoDB — use `MONGODB_URI` if not using `localhost:27017`.

## http/
HTTP request files for manual API testing with VS Code REST Client or IntelliJ.

## chat-testing/
PowerShell scripts for testing the chat service WebSocket and webhook flows.
