import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);

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
