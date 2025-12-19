import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { cutVideo, imageToVideo, concatVideos, removeSilence } from "./lib.js";

const server = new McpServer({
  name: "ffmpeg",
  version: "1.0.0",
});

// Tool: Cut video segment
server.registerTool(
  "cut_video",
  {
    description: "Extract a segment from a video file",
    inputSchema: {
      inputPath: z.string().describe("Path to input video file"),
      outputPath: z.string().describe("Path for output video file"),
      startTime: z.string().describe("Start time (e.g., '00:01:30' or '90')"),
      duration: z.string().describe("Duration (e.g., '00:00:30' or '30')"),
    },
  },
  async ({ inputPath, outputPath, startTime, duration }) => {
    try {
      await cutVideo(inputPath, outputPath, startTime, duration);
      return {
        content: [
          {
            type: "text",
            text: `Video cut successfully: ${outputPath}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to cut video: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }
);

// Tool: Convert image to video with fixed duration
server.registerTool(
  "image_to_video",
  {
    description: "Convert a static image to a video with fixed duration",
    inputSchema: {
      imagePath: z.string().describe("Path to input image file"),
      outputPath: z.string().describe("Path for output video file"),
      duration: z.number().positive().describe("Duration in seconds"),
      fps: z.number().positive().default(30).describe("Frames per second"),
    },
  },
  async ({ imagePath, outputPath, duration, fps }) => {
    try {
      await imageToVideo(imagePath, outputPath, duration, fps);
      return {
        content: [
          {
            type: "text",
            text: `Image converted to video: ${outputPath} (${duration}s at ${fps}fps)`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to convert image: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }
);

// Tool: Concatenate videos
server.registerTool(
  "concat_videos",
  {
    description: "Concatenate multiple videos into one",
    inputSchema: {
      inputPaths: z
        .array(z.string())
        .min(2)
        .describe("Array of video file paths to concatenate"),
      outputPath: z.string().describe("Path for output video file"),
    },
  },
  async ({ inputPaths, outputPath }) => {
    try {
      await concatVideos(inputPaths, outputPath);
      return {
        content: [
          {
            type: "text",
            text: `Videos concatenated successfully: ${outputPath}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to concatenate videos: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }
);

// Tool: Remove silence from video
server.registerTool(
  "remove_silence",
  {
    description:
      "Detect and remove silent segments from a video, keeping only non-silent parts",
    inputSchema: {
      inputPath: z.string().describe("Path to input video file"),
      outputPath: z.string().describe("Path for output video file"),
      noiseThreshold: z
        .string()
        .default("-30dB")
        .describe("Audio level threshold for silence detection (e.g., '-30dB')"),
      minSilenceDuration: z
        .number()
        .positive()
        .default(2)
        .describe("Minimum duration in seconds to consider as silence"),
    },
  },
  async ({ inputPath, outputPath, noiseThreshold, minSilenceDuration }) => {
    try {
      const result = await removeSilence(
        inputPath,
        outputPath,
        noiseThreshold,
        minSilenceDuration
      );

      const silenceCount = result.silenceIntervals.length;
      const silenceDetails =
        silenceCount > 0
          ? result.silenceIntervals
              .map(
                (s) =>
                  `${s.start.toFixed(2)}s - ${s.end.toFixed(2)}s`
              )
              .join(", ")
          : "none";

      return {
        content: [
          {
            type: "text",
            text: `Silence removed successfully: ${outputPath}\nSilent segments found (${silenceCount}): ${silenceDetails}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to remove silence: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("FFmpeg MCP Server v1.0.0 running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
