import { type Asset, newId, sec } from "@motion/core";
import {
  ALL_FORMATS,
  AudioBufferSink,
  BlobSource,
  Input,
  type InputAudioTrack,
  type InputVideoTrack,
} from "mediabunny";

/** Live handles for an imported file. Kept outside the project model. */
export interface MediaHandle {
  assetId: string;
  file: File;
  input: Input | null;
  videoTrack: InputVideoTrack | null;
  audioTrack: InputAudioTrack | null;
  /** Shared audio decoder access for this file. */
  audioSink: AudioBufferSink | null;
  image: ImageBitmap | null;
}

export class UnsupportedMediaError extends Error {}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

/** Read a file's metadata and open it for decoding. */
export async function probeFile(
  file: File,
): Promise<{ asset: Asset; handle: MediaHandle }> {
  const id = newId();

  if (file.type.startsWith("image/") || IMAGE_EXT.test(file.name)) {
    let image: ImageBitmap;
    try {
      image = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      throw new UnsupportedMediaError(
        `${file.name} isn't an image we can read.`,
      );
    }
    return {
      asset: {
        id,
        kind: "image",
        name: baseName(file.name),
        duration: 0,
        width: image.width,
        height: image.height,
        hasVideo: true,
        hasAudio: false,
      },
      handle: {
        assetId: id,
        file,
        input: null,
        videoTrack: null,
        audioTrack: null,
        audioSink: null,
        image,
      },
    };
  }

  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });
  try {
    const [video, audio] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack(),
    ]);
    const videoTrack = video && (await video.canDecode()) ? video : null;
    const audioTrack = audio && (await audio.canDecode()) ? audio : null;
    if (video && !videoTrack) {
      throw new UnsupportedMediaError(
        `This browser can't decode the video in ${file.name} (${video.codec ?? "unknown codec"}). Try Chrome or Edge, or convert it to H.264.`,
      );
    }
    if (!videoTrack && !audioTrack) {
      throw new UnsupportedMediaError(
        `${file.name} has no video or audio we can play.`,
      );
    }
    const duration = sec(await input.computeDuration());
    if (duration <= 0) {
      throw new UnsupportedMediaError(`${file.name} looks empty.`);
    }
    return {
      asset: {
        id,
        kind: videoTrack ? "video" : "audio",
        name: baseName(file.name),
        duration,
        width: videoTrack?.displayWidth ?? 0,
        height: videoTrack?.displayHeight ?? 0,
        hasVideo: !!videoTrack,
        hasAudio: !!audioTrack,
      },
      handle: {
        assetId: id,
        file,
        input,
        videoTrack,
        audioTrack,
        audioSink: audioTrack ? new AudioBufferSink(audioTrack) : null,
        image: null,
      },
    };
  } catch (err) {
    input.dispose();
    if (err instanceof UnsupportedMediaError) throw err;
    throw new UnsupportedMediaError(
      `${file.name} isn't a format we can open yet.`,
    );
  }
}

export function disposeHandle(h: MediaHandle): void {
  h.input?.dispose();
  h.image?.close();
}
