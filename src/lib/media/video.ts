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

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
};

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

function findStream(probe: { streams?: ProbeStream[] }, codecType: string) {
  return probe.streams?.find((s) => s.codec_type === codecType);
}

// Already web-ready (H.264, 8-bit, ≤1080p): remux instead of re-encoding,
// which turns a multi-minute transcode into a near-instant stream copy.
function canCopyVideo(video: ProbeStream | undefined) {
  return (
    video?.codec_name === "h264" &&
    video.pix_fmt === "yuv420p" &&
    (video.width ?? 0) > 0 &&
    (video.width ?? 0) <= 1920 &&
    (video.height ?? 0) > 0 &&
    (video.height ?? 0) <= 1080
  );
}

function audioArgsFor(audio: ProbeStream | undefined) {
  if (!audio) return ["-an"];
  if (audio.codec_name === "aac") return ["-c:a", "copy"];
  return ["-c:a", "aac", "-b:a", "128k"];
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
    const videoStream = findStream(inputProbe, "video");
    const audioArgs = audioArgsFor(findStream(inputProbe, "audio"));
    const inputDuration = Number.parseFloat(inputProbe.format?.duration ?? "0");

    const encodeArgs = canCopyVideo(videoStream)
      ? ["-c:v", "copy"]
      : [
          "-vf", "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p",
          "-c:v", "libx264",
          "-crf", "23",
          "-preset", "veryfast",
        ];

    await execFileAsync("ffmpeg", [
      "-y",
      "-i", inputPath,
      ...encodeArgs,
      ...audioArgs,
      "-movflags", "+faststart",
      diskPath,
    ]);

    const framePath = path.join(tmpDir, "cover.png");
    const coverOffset = inputDuration > 0 ? Math.min(1, inputDuration / 2) : 0;
    await execFileAsync("ffmpeg", [
      "-y",
      "-ss", String(coverOffset),
      "-i", diskPath,
      "-frames:v", "1",
      framePath,
    ]);

    await sharp(framePath)
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(coverDiskPath);

    const outputProbe = await probeJson(diskPath);
    const outputVideo = findStream(outputProbe, "video");

    return {
      relativePath,
      coverRelativePath,
      width: outputVideo?.width ?? 0,
      height: outputVideo?.height ?? 0,
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
