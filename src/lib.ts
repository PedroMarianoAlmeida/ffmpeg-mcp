import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { spawn } from "child_process";
import { lstat, realpath } from "fs/promises";
import path from "path";

const ffmpegPath = ffmpegStatic as unknown as string;
const workspaceRoot = await realpath(
  process.env.FFMPEG_MCP_WORKSPACE ?? process.cwd()
);
const allowedProtocols = ["-protocol_whitelist", "file,pipe"];

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

function isWithinWorkspace(candidate: string): boolean {
  return candidate === workspaceRoot || candidate.startsWith(`${workspaceRoot}${path.sep}`);
}

function rejectScheme(value: string): void {
  // A URL scheme makes FFmpeg treat the value as a protocol rather than a path.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    throw new Error("Only local workspace paths are allowed; URL schemes are not supported");
  }
}

async function localInputPath(value: string): Promise<string> {
  rejectScheme(value);
  const resolved = path.resolve(workspaceRoot, value);
  if (!isWithinWorkspace(resolved)) {
    throw new Error("Input path must be inside FFMPEG_MCP_WORKSPACE");
  }

  let canonical: string;
  try {
    canonical = await realpath(resolved);
  } catch {
    throw new Error("Input path does not exist or cannot be resolved");
  }
  if (!isWithinWorkspace(canonical)) {
    throw new Error("Input path resolves outside FFMPEG_MCP_WORKSPACE");
  }
  return canonical;
}

async function localOutputPath(value: string): Promise<string> {
  rejectScheme(value);
  const resolved = path.resolve(workspaceRoot, value);
  if (!isWithinWorkspace(resolved)) {
    throw new Error("Output path must be inside FFMPEG_MCP_WORKSPACE");
  }

  const parent = await realpath(path.dirname(resolved));
  if (!isWithinWorkspace(parent)) {
    throw new Error("Output directory resolves outside FFMPEG_MCP_WORKSPACE");
  }
  try {
    if ((await lstat(resolved)).isSymbolicLink()) {
      throw new Error("Output path must not be a symbolic link");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return resolved;
}

async function localPaths(inputPath: string, outputPath: string) {
  return {
    input: await localInputPath(inputPath),
    output: await localOutputPath(outputPath),
  };
}

function localFfmpeg(inputPath: string): ffmpeg.FfmpegCommand {
  return ffmpeg(inputPath).inputOptions(allowedProtocols);
}

// Helper to promisify ffmpeg commands
function runFfmpeg(command: ffmpeg.FfmpegCommand): Promise<string> {
  return new Promise((resolve, reject) => {
    command
      .on("end", () => resolve("Success"))
      .on("error", (err) => reject(err))
      .run();
  });
}

export async function cutVideo(
  inputPath: string,
  outputPath: string,
  startTime: string,
  duration: string
): Promise<string> {
  const paths = await localPaths(inputPath, outputPath);
  const command = localFfmpeg(paths.input)
    .setStartTime(startTime)
    .setDuration(duration)
    .output(paths.output);

  await runFfmpeg(command);
  return paths.output;
}

export async function imageToVideo(
  imagePath: string,
  outputPath: string,
  duration: number,
  fps: number
): Promise<string> {
  const paths = await localPaths(imagePath, outputPath);
  const command = localFfmpeg(paths.input)
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
    .output(paths.output);

  await runFfmpeg(command);
  return paths.output;
}

export async function concatVideos(
  inputPaths: string[],
  outputPath: string
): Promise<string> {
  const inputs = await Promise.all(inputPaths.map(localInputPath));
  const output = await localOutputPath(outputPath);
  const command = ffmpeg();

  // Add all inputs
  inputs.forEach((inputPath) => {
    command.input(inputPath).inputOptions(allowedProtocols);
  });

  // Use concat filter
  const filterInputs = inputPaths.map((_, i) => `[${i}:v][${i}:a]`).join("");
  command
    .complexFilter([
      `${filterInputs}concat=n=${inputPaths.length}:v=1:a=1[outv][outa]`,
    ])
    .outputOptions(["-map", "[outv]", "-map", "[outa]"])
    .output(output);

  await runFfmpeg(command);
  return output;
}

export async function ffmpegRaw(args: string[]): Promise<string> {
  const safeArgs = await validateRawArgs(args);
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, safeArgs);
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout || stderr || "Command completed successfully");
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", reject);
  });
}

export async function convert(
  inputPath: string,
  outputPath: string,
  audioBitrate?: string,
  videoBitrate?: string
): Promise<string> {
  const paths = await localPaths(inputPath, outputPath);
  const command = localFfmpeg(paths.input);

  const outputOptions: string[] = [];

  if (audioBitrate) {
    outputOptions.push("-b:a", audioBitrate);
  }

  if (videoBitrate) {
    outputOptions.push("-b:v", videoBitrate);
  }

  if (outputOptions.length > 0) {
    command.outputOptions(outputOptions);
  }

  command.output(paths.output);

  await runFfmpeg(command);
  return paths.output;
}

interface SilenceInterval {
  start: number;
  end: number;
}

// Detect silence intervals in a video
async function detectSilence(
  inputPath: string,
  noiseThreshold: string,
  minDuration: number
): Promise<SilenceInterval[]> {
  return new Promise((resolve, reject) => {
    const args = [
      ...allowedProtocols,
      "-i",
      inputPath,
      "-af",
      `silencedetect=n=${noiseThreshold}:d=${minDuration}`,
      "-f",
      "null",
      "-",
    ];

    const proc = spawn(ffmpegPath, args);
    let stderr = "";

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0 && !stderr.includes("silence_end")) {
        reject(new Error(`FFmpeg exited with code ${code}`));
        return;
      }

      const silenceIntervals: SilenceInterval[] = [];
      const lines = stderr.split("\n");

      for (const line of lines) {
        // Parse silence_end lines which contain both end time and duration
        const endMatch = line.match(
          /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/
        );
        if (endMatch) {
          const end = parseFloat(endMatch[1]);
          const duration = parseFloat(endMatch[2]);
          const start = end - duration;
          silenceIntervals.push({ start, end });
        }
      }

      resolve(silenceIntervals);
    });

    proc.on("error", reject);
  });
}

// Get video duration
async function getVideoDuration(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, allowedProtocols, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(metadata.format.duration || 0);
    });
  });
}

// Remove silence from video
export async function removeSilence(
  inputPath: string,
  outputPath: string,
  noiseThreshold: string = "-30dB",
  minSilenceDuration: number = 2
): Promise<{ outputPath: string; silenceIntervals: SilenceInterval[] }> {
  const paths = await localPaths(inputPath, outputPath);
  // Step 1: Detect silence
  const silenceIntervals = await detectSilence(
    paths.input,
    noiseThreshold,
    minSilenceDuration
  );

  if (silenceIntervals.length === 0) {
    // No silence detected, just copy the file
    const command = localFfmpeg(paths.input)
      .outputOptions(["-c", "copy"])
      .output(paths.output);
    await runFfmpeg(command);
    return { outputPath: paths.output, silenceIntervals: [] };
  }

  // Step 2: Get video duration
  const videoDuration = await getVideoDuration(paths.input);

  // Step 3: Calculate non-silent segments
  const nonSilentSegments: { start: number; end: number }[] = [];
  let currentStart = 0;

  for (const silence of silenceIntervals) {
    if (silence.start > currentStart) {
      nonSilentSegments.push({ start: currentStart, end: silence.start });
    }
    currentStart = silence.end;
  }

  // Add final segment if there's content after the last silence
  if (currentStart < videoDuration) {
    nonSilentSegments.push({ start: currentStart, end: videoDuration });
  }

  if (nonSilentSegments.length === 0) {
    throw new Error("No non-silent segments found in video");
  }

  // Step 4: Build complex filter to trim and concatenate non-silent segments
  const filterParts: string[] = [];
  const concatInputs: string[] = [];

  nonSilentSegments.forEach((segment, i) => {
    filterParts.push(
      `[0:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[v${i}]`
    );
    filterParts.push(
      `[0:a]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS[a${i}]`
    );
    concatInputs.push(`[v${i}][a${i}]`);
  });

  const concatFilter = `${concatInputs.join("")}concat=n=${nonSilentSegments.length}:v=1:a=1[outv][outa]`;
  filterParts.push(concatFilter);

  const command = localFfmpeg(paths.input)
    .complexFilter(filterParts)
    .outputOptions(["-map", "[outv]", "-map", "[outa]"])
    .output(paths.output);

  await runFfmpeg(command);
  return { outputPath: paths.output, silenceIntervals };
}

const rawOptionsWithValue = new Set([
  "-ss", "-t", "-to", "-c", "-c:v", "-c:a", "-b:v", "-b:a", "-r",
  "-pix_fmt", "-map", "-movflags", "-preset", "-crf", "-profile:v",
  "-level:v", "-threads",
]);
const rawFlags = new Set(["-y", "-n", "-an", "-vn", "-sn", "-shortest"]);

// Raw mode intentionally supports a small, non-file-loading subset of FFmpeg.
// Filters, format forcing, and arbitrary options can open further files or protocols.
async function validateRawArgs(args: string[]): Promise<string[]> {
  if (args.length === 0 || args.length > 64) {
    throw new Error("ffmpeg_raw requires between 1 and 64 arguments");
  }

  const safeArgs = ["-protocol_whitelist", "file,pipe"];
  let outputCount = 0;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-i") {
      const value = args[++index];
      if (!value) throw new Error("-i requires an input path");
      safeArgs.push("-i", await localInputPath(value));
    } else if (rawOptionsWithValue.has(arg)) {
      const value = args[++index];
      if (!value || value.startsWith("-")) throw new Error(`${arg} requires a value`);
      safeArgs.push(arg, value);
    } else if (rawFlags.has(arg)) {
      safeArgs.push(arg);
    } else if (!arg.startsWith("-")) {
      if (index !== args.length - 1 || outputCount > 0) {
        throw new Error("ffmpeg_raw accepts exactly one final output path");
      }
      safeArgs.push(await localOutputPath(arg));
      outputCount += 1;
    } else {
      throw new Error(`Unsupported ffmpeg_raw option: ${arg}`);
    }
  }
  if (outputCount !== 1) throw new Error("ffmpeg_raw requires a final output path");
  return safeArgs;
}
