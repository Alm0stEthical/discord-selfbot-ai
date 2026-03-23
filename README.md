# Coh

Production-ready Bun + TypeScript Discord bot foundation with:

- `discord.js` v13 message commands
- OpenRouter chat completions
- OpenRouter voice-note transcription via the configured chat model
- Bun SQLite blacklist storage
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
  filters/        trigger rules, ignore list, cooldowns
  handlers/       high-level message orchestration
  attachments/    voice-note transcription helpers
  utils/          logger and shared helpers
```

## Setup

1. Install dependencies: `bun install`
2. Copy `.env.example` to `.env`
3. Enable the `MESSAGE CONTENT INTENT` for the bot in the Discord developer portal
4. Start the bot: `bun run dev`

The built-in Coh prompt lives in `src/prompts/cohSystemPrompt.ts`.

## Prefix Commands

- `bot help`
- `bot ping`
- `bot blacklist add <userId>`
- `bot blacklist remove <userId>`
- `bot blacklist list`
- `bot blacklist check <userId>`

## Notes

- The bot ignores users on the blacklist and otherwise replies when the message starts with the configured prefix or replies to the bot.
- The bot prefers Discord display names in-context so replies feel more native in busy servers.
- On startup, the bot validates that the configured OpenRouter model supports both text and audio input.
