import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "./index.js";

const toolNames = [
  "cut_video",
  "image_to_video",
  "concat_videos",
  "convert",
  "remove_silence",
  "ffmpeg_raw",
];

type RegisteredTool = {
  annotations?: Record<string, boolean>;
  handler: (arguments_: Record<string, unknown>) => Promise<{ isError?: boolean }>;
};

function registeredTools(): Record<string, RegisteredTool> {
  return (createServer() as unknown as { _registeredTools: Record<string, RegisteredTool> })
    ._registeredTools;
}

test("registers every FFmpeg tool with complete safety annotations", () => {
  const tools = registeredTools();

  assert.deepEqual(Object.keys(tools), toolNames);

  for (const name of toolNames) {
    assert.deepEqual(tools[name]?.annotations, {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    });
  }
});

test("every tool rejects an invalid workspace input without invoking FFmpeg", async () => {
  const tools = registeredTools();
  const invalidCalls: Record<string, Record<string, unknown>> = {
    cut_video: { inputPath: "../input.mp4", outputPath: "output.mp4", startTime: "0", duration: "1" },
    image_to_video: { imagePath: "../input.png", outputPath: "output.mp4", duration: 1, fps: 30 },
    concat_videos: { inputPaths: ["../one.mp4", "../two.mp4"], outputPath: "output.mp4" },
    convert: { inputPath: "../input.mp4", outputPath: "output.mp3" },
    remove_silence: { inputPath: "../input.mp4", outputPath: "output.mp4", noiseThreshold: "-30dB", minSilenceDuration: 2 },
    ffmpeg_raw: { args: [] },
  };

  for (const name of toolNames) {
    const result = await tools[name].handler(invalidCalls[name]);
    assert.equal(result.isError, true, `${name} should reject an invalid call`);
  }
});
