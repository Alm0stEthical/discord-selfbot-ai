# Coh

Production-ready Bun + TypeScript Discord bot foundation with:

- `discord.js` v13 message commands
- OpenRouter chat completions
- OpenRouter voice-note transcription via audio-capable models
- Bun SQLite whitelist storage
- reply-aware conversational context
- display-name-aware social context

## Architecture

```text
src/
  bootstrap/      startup wiring
  config/         validated runtime config
  db/             sqlite client, schema, repositories
  commands/       prefix command contracts and modules
  discord/        client creation and event wiring
  context/        short-term channel and reply-chain memory
  ai/             OpenRouter client and request builder
  filters/        trigger rules, whitelist gate, cooldowns
  handlers/       high-level message orchestration
  attachments/    voice-note transcription helpers
  utils/          logger and shared helpers
```

## Setup

1. Install dependencies: `bun install`
2. Copy `.env.example` to `.env`
3. Enable the `MESSAGE CONTENT INTENT` for the bot in the Discord developer portal
4. Start the bot: `bun run dev`

If `OPENROUTER_TRANSCRIPTION_MODEL` is omitted, Coh reuses `OPENROUTER_MODEL` for voice-note transcription.

The built-in Coh prompt lives in `src/prompts/cohSystemPrompt.ts`.

## Prefix Commands

- `coh help`
- `coh ping`
- `coh whitelist add <userId>`
- `coh whitelist remove <userId>`
- `coh whitelist list`
- `coh whitelist check <userId>`

## Notes

- Coh only replies when the user is whitelisted, or the message explicitly starts with `coh`, or the message is a reply to a Coh message.
- Coh prefers Discord display names in-context so replies feel more native in busy servers.
- On startup, Coh validates the configured OpenRouter transcription model and refuses to boot unless that model supports audio input.
