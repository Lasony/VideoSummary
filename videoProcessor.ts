import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export interface VideoMetadata {
  title: string;
  duration: number;
  thumbnail: string;
  audioPath: string;
}

export async function downloadYouTubeVideo(url: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const outputDir = path.join(process.cwd(), "temp");
    const videoId = randomUUID();
    const outputTemplate = path.join(outputDir, `${videoId}.%(ext)s`);

    // Ensure temp directory exists
    fs.mkdir(outputDir, { recursive: true });

    const ytDlp = spawn("yt-dlp", [
      "--extract-flat", "false",
      "--write-info-json",
      "--write-thumbnail",
      "--extract-audio",
      "--audio-format", "mp3",
      "--audio-quality", "0",
      "--output", outputTemplate,
      url
    ]);

    let output = "";
    let error = "";

    ytDlp.stdout.on("data", (data) => {
      output += data.toString();
    });

    ytDlp.stderr.on("data", (data) => {
      error += data.toString();
    });

    ytDlp.on("close", async (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp failed: ${error}`));
        return;
      }

      try {
        // Read info.json for metadata
        const infoPath = path.join(outputDir, `${videoId}.info.json`);
        const infoContent = await fs.readFile(infoPath, "utf-8");
        const info = JSON.parse(infoContent);

        resolve({
          title: info.title,
          duration: info.duration,
          thumbnail: path.join(outputDir, `${videoId}.webp`),
          audioPath: path.join(outputDir, `${videoId}.mp3`)
        });
      } catch (err) {
        reject(new Error(`Failed to parse video metadata: ${err}`));
      }
    });
  });
}

export async function extractAudioFromFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputDir = path.join(process.cwd(), "temp");
    const audioId = randomUUID();
    const outputPath = path.join(outputDir, `${audioId}.mp3`);

    const ffmpeg = spawn("ffmpeg", [
      "-i", filePath,
      "-vn", // No video
      "-acodec", "mp3",
      "-ab", "192k",
      "-ar", "44100",
      "-y", // Overwrite output
      outputPath
    ]);

    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("Failed to extract audio from video file"));
        return;
      }
      resolve(outputPath);
    });

    ffmpeg.stderr.on("data", (data) => {
      // Log ffmpeg progress if needed
      console.log(`FFmpeg: ${data}`);
    });
  });
}

export async function getVideoMetadata(filePath: string): Promise<{ duration: number; title: string }> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filePath
    ]);

    let output = "";

    ffprobe.stdout.on("data", (data) => {
      output += data.toString();
    });

    ffprobe.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("Failed to get video metadata"));
        return;
      }

      try {
        const metadata = JSON.parse(output);
        const duration = parseFloat(metadata.format.duration) || 0;
        const title = metadata.format.tags?.title || path.basename(filePath);

        resolve({ duration, title });
      } catch (err) {
        reject(new Error(`Failed to parse metadata: ${err}`));
      }
    });
  });
}

export async function createVideoWithAudio(
  originalVideoPath: string,
  audioPath: string,
  targetDuration: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputDir = path.join(process.cwd(), "temp");
    const outputId = randomUUID();
    const outputPath = path.join(outputDir, `${outputId}_final.mp4`);

    const ffmpeg = spawn("ffmpeg", [
      "-i", originalVideoPath,
      "-i", audioPath,
      "-t", targetDuration.toString(),
      "-c:v", "libx264",
      "-c:a", "aac",
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-shortest",
      "-y",
      outputPath
    ]);

    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("Failed to create final video"));
        return;
      }
      resolve(outputPath);
    });

    ffmpeg.stderr.on("data", (data) => {
      console.log(`FFmpeg: ${data}`);
    });
  });
}

export async function cleanupTempFiles(filePaths: string[]): Promise<void> {
  try {
    await Promise.all(
      filePaths.map(filePath => 
        fs.unlink(filePath).catch(err => 
          console.warn(`Failed to cleanup ${filePath}:`, err)
        )
      )
    );
  } catch (error) {
    console.warn("Error during cleanup:", error);
  }
}
