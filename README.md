# Translator

Simple WhatsApp bot (Baileys) with translator and utilities.

Quick start

- Node.js 18+ installed
- Install deps: `npm install`
- Auth options:
  - With SESSION_ID: set env var `SESSION_ID=<pastebin_id_or_full>` then `npm start`
  - Or scan QR: leave `SESSION_ID` empty; start and scan the terminal QR

Notes

- Prefix is `.` (e.g. `.menu`, `.tr hello es`)
- If an external API is down, related commands may fail temporarily.
