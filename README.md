# FFmpeg MCP Server

A Model Context Protocol (MCP) server that provides video and audio manipulation tools powered by FFmpeg. This server enables AI assistants to perform media operations like cutting videos, converting formats, removing silence, and more.

## Features

- **Self-contained** - Includes bundled FFmpeg binary via `ffmpeg-static`, no system installation required
- **Format conversion** - Convert between audio/video formats (mp4, mp3, wav, mov, etc.)
- **Video editing** - Cut segments, concatenate multiple videos, convert images to video
- **Audio processing** - Detect and remove silent segments automatically
- **Local by default** - Inputs and outputs stay inside a configured workspace

## Available Tools

| Tool | Description |
|------|-------------|
| `cut_video` | Extract a segment from a video using start time and duration |
| `image_to_video` | Convert a static image to a video with fixed duration |
| `concat_videos` | Join multiple videos into one |
| `convert` | Convert between media formats (auto-detects from file extension) |
| `remove_silence` | Detect and remove silent segments from video |
| `ffmpeg_raw` | Run a restricted local FFmpeg command |

## Installation

### From npm (recommended)

```bash
npm install -g ffmpeg-mcp-server
```

### From source

```bash
git clone https://github.com/PedroMarianoAlmeida/ffmpeg-mcp
cd ffmpeg-mcp
npm install
npm run build
```

## Configuration

### Workspace and safety

Every input and output must be inside `FFMPEG_MCP_WORKSPACE`. If it is unset, the server's current working directory is used. The server resolves symlinks before reading and rejects URL schemes, traversal outside the workspace, and symlink outputs. Create output directories before running a tool.

`ffmpeg_raw` is deliberately restricted. It accepts local `-i` inputs, one final local output path, and a small set of codec and timing options. It does not accept filters, forced formats, or arbitrary FFmpeg flags because those options can load extra files or use network protocols.

For example, set a dedicated media directory in your MCP configuration:

```json
{
  "mcpServers": {
    "ffmpeg": {
      "command": "npx",
      "args": ["ffmpeg-mcp-server"],
      "env": {
        "FFMPEG_MCP_WORKSPACE": "/absolute/path/to/media-workspace"
      }
    }
  }
}
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ffmpeg": {
      "command": "npx",
      "args": ["ffmpeg-mcp-server"]
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
      "command": "npx",
      "args": ["ffmpeg-mcp-server"]
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

### Restricted raw operations
```
"Convert input.mp4 to output.mp4 using libx264"
→ Uses ffmpeg_raw with local paths and supported codec options
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
