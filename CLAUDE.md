# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
npm install            # Install dependencies
npm run build          # Build TypeScript to build/
```

## Architecture

FFmpeg MCP Server - provides video manipulation tools via Model Context Protocol.

- `src/index.ts` - Server entry point, MCP setup, tool registrations
- `src/lib.ts` - FFmpeg operations (cutVideo, imageToVideo, concatVideos)

## Adding New Tools

1. Add the operation function to `lib.ts`
2. Register the tool in `index.ts` with Zod schema

## Key Dependencies

- `fluent-ffmpeg` - Node.js FFmpeg wrapper
- `ffmpeg-static` - Bundled FFmpeg binary (no system install needed)
- `@modelcontextprotocol/sdk` - MCP server SDK

## Available Tools

- `cut_video` - Extract segment from video (startTime + duration)
- `image_to_video` - Convert static image to video with fixed duration
- `concat_videos` - Join multiple videos into one
- `convert` - Convert between formats (audio/video), auto-detects from file extension
- `remove_silence` - Detect and remove silent segments from video (uses silencedetect + trim/concat)
- `ffmpeg_raw` - Execute raw FFmpeg commands for advanced operations not covered by other tools
