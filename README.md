# FFmpeg MCP Server

A Model Context Protocol (MCP) server that provides video and audio manipulation tools powered by FFmpeg. This server enables AI assistants to perform media operations like cutting videos, converting formats, removing silence, and more.

## Features

- **Self-contained** - Includes bundled FFmpeg binary via `ffmpeg-static`, no system installation required
- **Format conversion** - Convert between audio/video formats (mp4, mp3, wav, mov, etc.)
- **Video editing** - Cut segments, concatenate multiple videos, convert images to video
- **Audio processing** - Detect and remove silent segments automatically
- **Flexible** - Raw FFmpeg command support for advanced operations

## Available Tools

| Tool | Description |
|------|-------------|
| `cut_video` | Extract a segment from a video using start time and duration |
| `image_to_video` | Convert a static image to a video with fixed duration |
| `concat_videos` | Join multiple videos into one |
| `convert` | Convert between media formats (auto-detects from file extension) |
| `remove_silence` | Detect and remove silent segments from video |
| `ffmpeg_raw` | Execute raw FFmpeg commands for advanced operations |

## Installation

```bash
npm install
npm run build
```

## Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ffmpeg": {
      "command": "node",
      "args": ["/absolute/path/to/ffmpeg-mcp/build/index.js"]
    }
  }
}
```

### Claude Code

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "ffmpeg": {
      "command": "node",
      "args": ["/absolute/path/to/ffmpeg-mcp/build/index.js"]
    }
  }
}
```

## Usage Examples

### Cut a video segment
```
"Cut the first 30 seconds from video.mp4"
→ Uses cut_video tool
```

### Convert formats
```
"Convert video.mov to mp4"
"Extract audio from video.mp4 as mp3"
→ Uses convert tool
```

### Remove silence
```
"Remove silent parts from my podcast recording"
→ Uses remove_silence tool (detects silence > 2s at -30dB by default)
```

### Advanced operations
```
"Add a watermark to my video"
"Speed up the video 2x"
"Rotate video 90 degrees"
→ Uses ffmpeg_raw tool with AI-constructed FFmpeg commands
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Project structure
src/
  index.ts    # MCP server setup and tool registrations
  lib.ts      # FFmpeg operations
```

## License

MIT
