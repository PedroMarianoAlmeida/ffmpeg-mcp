import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);
// Helper to promisify ffmpeg commands
function runFfmpeg(command) {
    return new Promise((resolve, reject) => {
        command
            .on("end", () => resolve("Success"))
            .on("error", (err) => reject(err))
            .run();
    });
}
export async function cutVideo(inputPath, outputPath, startTime, duration) {
    const command = ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .output(outputPath);
    await runFfmpeg(command);
    return outputPath;
}
export async function imageToVideo(imagePath, outputPath, duration, fps) {
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
export async function concatVideos(inputPaths, outputPath) {
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
