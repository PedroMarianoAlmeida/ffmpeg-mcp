import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);
const server = new McpServer({
    name: "ffmpeg",
    version: "1.0.0",
});
// Helper to promisify ffmpeg commands
function runFfmpeg(command) {
    return new Promise((resolve, reject) => {
        command
            .on("end", () => resolve("Success"))
            .on("error", (err) => reject(err))
            .run();
    });
}
// Tool: Cut video segment
server.registerTool("cut_video", {
    description: "Extract a segment from a video file",
    inputSchema: {
        inputPath: z.string().describe("Path to input video file"),
        outputPath: z.string().describe("Path for output video file"),
        startTime: z.string().describe("Start time (e.g., '00:01:30' or '90')"),
        duration: z.string().describe("Duration (e.g., '00:00:30' or '30')"),
    },
}, async ({ inputPath, outputPath, startTime, duration }) => {
    try {
        const command = ffmpeg(inputPath)
            .setStartTime(startTime)
            .setDuration(duration)
            .output(outputPath);
        await runFfmpeg(command);
        return {
            content: [
                {
                    type: "text",
                    text: `Video cut successfully: ${outputPath}`,
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to cut video: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
        };
    }
});
// Tool: Convert image to video with fixed duration
server.registerTool("image_to_video", {
    description: "Convert a static image to a video with fixed duration",
    inputSchema: {
        imagePath: z.string().describe("Path to input image file"),
        outputPath: z.string().describe("Path for output video file"),
        duration: z.number().positive().describe("Duration in seconds"),
        fps: z.number().positive().default(30).describe("Frames per second"),
    },
}, async ({ imagePath, outputPath, duration, fps }) => {
    try {
        const command = ffmpeg(imagePath)
            .loop(duration)
            .inputOptions(["-framerate", String(fps)])
            .outputOptions([
            "-c:v libx264",
            "-t",
            String(duration),
            "-pix_fmt yuv420p",
            "-vf",
            `scale=trunc(iw/2)*2:trunc(ih/2)*2`, // Ensure even dimensions
        ])
            .output(outputPath);
        await runFfmpeg(command);
        return {
            content: [
                {
                    type: "text",
                    text: `Image converted to video: ${outputPath} (${duration}s at ${fps}fps)`,
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to convert image: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
        };
    }
});
// Tool: Concatenate videos
server.registerTool("concat_videos", {
    description: "Concatenate multiple videos into one",
    inputSchema: {
        inputPaths: z
            .array(z.string())
            .min(2)
            .describe("Array of video file paths to concatenate"),
        outputPath: z.string().describe("Path for output video file"),
    },
}, async ({ inputPaths, outputPath }) => {
    try {
        const command = ffmpeg();
        // Add all inputs
        inputPaths.forEach((path) => {
            command.input(path);
        });
        // Use concat filter
        const filterInputs = inputPaths
            .map((_, i) => `[${i}:v][${i}:a]`)
            .join("");
        command
            .complexFilter([
            `${filterInputs}concat=n=${inputPaths.length}:v=1:a=1[outv][outa]`,
        ])
            .outputOptions(["-map", "[outv]", "-map", "[outa]"])
            .output(outputPath);
        await runFfmpeg(command);
        return {
            content: [
                {
                    type: "text",
                    text: `Videos concatenated successfully: ${outputPath}`,
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to concatenate videos: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
        };
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("FFmpeg MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
