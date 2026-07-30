import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { ensureDataDirectories } from "@/lib/env";
import { newUploadPath, uploadDiskPath } from "./paths";

const execFileAsync = promisify(execFile);

const allowed = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

const allowedAudio = ["-c:a", "libopus", "-b:a", "96k"] as const;

async function probeJson(target: string) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    target,
  ]);
  return JSON.parse(stdout);
}

function hasAudioStream(probe: { streams?: { codec_type?: string }[] }) {
  return probe.streams?.some((s) => s.codec_type === "audio") ?? false;
}

function ffmpegFailure(err: unknown): Error {
  const stderr = (err as { stderr?: string })?.stderr ?? String(err);
  const tail = stderr.slice(-500);
  return new Error(`Video processing failed: ${tail}`);
}

export async function processVideoUpload(buffer: Buffer, originalName: string, mimeType: string) {
  if (!allowed.has(mimeType)) throw new Error("Only MP4, MOV, and WebM videos are allowed.");
  if (buffer.length > MAX_VIDEO_BYTES) throw new Error("Video must be 200 MB or smaller.");

  ensureDataDirectories();
  const relativePath = newUploadPath("mp4");
  const coverRelativePath = newUploadPath("webp");
  const diskPath = uploadDiskPath(relativePath);
  const coverDiskPath = uploadDiskPath(coverRelativePath);
  fs.mkdirSync(path.dirname(diskPath), { recursive: true });
  fs.mkdirSync(path.dirname(coverDiskPath), { recursive: true });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arthurs-video-"));
  const inputPath = path.join(tmpDir, "input");

  try {
    fs.writeFileSync(inputPath, buffer);

    const inputProbe = await probeJson(inputPath);
    const audioArgs = hasAudioStream(inputProbe) ? [...allowedAudio] : ["-an"];

    await execFileAsync("ffmpeg", [
      "-y",
      "-i", inputPath,
      "-vf", "scale='min(1920,iw)':-2",
      "-c:v", "libsvtav1",
      "-crf", "30",
      "-preset", "6",
      "-pix_fmt", "yuv420p",
      ...audioArgs,
      "-movflags", "+faststart",
      diskPath,
    ]);

    const framePath = path.join(tmpDir, "cover.png");
    await execFileAsync("ffmpeg", [
      "-y",
      "-ss", "1",
      "-i", diskPath,
      "-frames:v", "1",
      framePath,
    ]);

    await sharp(framePath)
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(coverDiskPath);

    const outputProbe = await probeJson(diskPath);
    const videoStream = outputProbe.streams?.find((s: { codec_type?: string }) => s.codec_type === "video");

    return {
      relativePath,
      coverRelativePath,
      width: videoStream?.width ?? 0,
      height: videoStream?.height ?? 0,
      durationSeconds: Number.parseFloat(outputProbe.format?.duration ?? "0"),
      originalName,
    };
  } catch (err) {
    fs.rmSync(diskPath, { force: true });
    fs.rmSync(coverDiskPath, { force: true });
    throw ffmpegFailure(err);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
