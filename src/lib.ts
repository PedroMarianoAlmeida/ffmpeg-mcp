import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { spawn } from "child_process";

const ffmpegPath = ffmpegStatic as unknown as string;

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

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
  const command = ffmpeg(inputPath)
    .setStartTime(startTime)
    .setDuration(duration)
    .output(outputPath);

  await runFfmpeg(command);
  return outputPath;
}

export async function imageToVideo(
  imagePath: string,
  outputPath: string,
  duration: number,
  fps: number
): Promise<string> {
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
  return outputPath;
}

export async function concatVideos(
  inputPaths: string[],
  outputPath: string
): Promise<string> {
  const command = ffmpeg();

  // Add all inputs
  inputPaths.forEach((path) => {
    command.input(path);
  });

  // Use concat filter
  const filterInputs = inputPaths.map((_, i) => `[${i}:v][${i}:a]`).join("");
  command
    .complexFilter([
      `${filterInputs}concat=n=${inputPaths.length}:v=1:a=1[outv][outa]`,
    ])
    .outputOptions(["-map", "[outv]", "-map", "[outa]"])
    .output(outputPath);

  await runFfmpeg(command);
  return outputPath;
}

export async function ffmpegRaw(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
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
  const command = ffmpeg(inputPath);

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

  command.output(outputPath);

  await runFfmpeg(command);
  return outputPath;
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
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
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
  // Step 1: Detect silence
  const silenceIntervals = await detectSilence(
    inputPath,
    noiseThreshold,
    minSilenceDuration
  );

  if (silenceIntervals.length === 0) {
    // No silence detected, just copy the file
    const command = ffmpeg(inputPath)
      .outputOptions(["-c", "copy"])
      .output(outputPath);
    await runFfmpeg(command);
    return { outputPath, silenceIntervals: [] };
  }

  // Step 2: Get video duration
  const videoDuration = await getVideoDuration(inputPath);

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

  const command = ffmpeg(inputPath)
    .complexFilter(filterParts)
    .outputOptions(["-map", "[outv]", "-map", "[outa]"])
    .output(outputPath);

  await runFfmpeg(command);
  return { outputPath, silenceIntervals };
}
