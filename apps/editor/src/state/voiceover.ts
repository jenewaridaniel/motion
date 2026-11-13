/**
 * Voiceover: record the microphone while the video plays, and put the
 * recording on an audio track where recording started.
 *
 * Samples are captured raw (AudioWorklet) and saved as a WAV file, which
 * every browser can read back with an exact length (MediaRecorder's WebM
 * files often have no length in them).
 */
import { encodeWav, type Micros, projectDuration } from "@motion/core";
import { create } from "zustand";
import { engine } from "../lib/engine.ts";
import { importFiles } from "./media.ts";
import { useEditor } from "./store.ts";

interface VoiceoverState {
  recording: boolean;
  /** performance.now() when recording started, for the timer. */
  since: number;
}

export const useVoiceover = create<VoiceoverState>(() => ({
  recording: false,
  since: 0,
}));

// Copies each block of microphone samples to the main thread.
const WORKLET = `
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("motion-capture", Capture);
`;

let session: {
  ctx: AudioContext;
  stream: MediaStream;
  node: AudioWorkletNode;
  chunks: Float32Array[];
  at: Micros;
} | null = null;

/** Start recording at the playhead. Call from a click. */
export async function startVoiceover(): Promise<void> {
  if (session || useVoiceover.getState().recording) return;
  const { toast } = useEditor.getState();
  if (!navigator.mediaDevices?.getUserMedia) {
    toast("This browser can't record from a microphone.", "error");
    return;
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (err) {
    const denied =
      err instanceof DOMException && err.name === "NotAllowedError";
    toast(
      denied
        ? "Motion needs permission to use your microphone. Allow it in the browser's address bar and try again."
        : "No microphone was found.",
      "error",
    );
    return;
  }
  const ctx = new AudioContext();
  const url = URL.createObjectURL(
    new Blob([WORKLET], { type: "text/javascript" }),
  );
  try {
    await ctx.audioWorklet.addModule(url);
  } catch (err) {
    // Don't leave the microphone on if recording can't start.
    console.error("[motion] voiceover", err);
    for (const t of stream.getTracks()) t.stop();
    void ctx.close();
    toast("Recording couldn't start in this browser.", "error");
    return;
  } finally {
    URL.revokeObjectURL(url);
  }
  const node = new AudioWorkletNode(ctx, "motion-capture");
  const chunks: Float32Array[] = [];
  node.port.onmessage = (e: MessageEvent<Float32Array>) => chunks.push(e.data);
  ctx.createMediaStreamSource(stream).connect(node);
  // Nothing reaches the speakers; the node just needs to be pulled.
  const sink = ctx.createGain();
  sink.gain.value = 0;
  node.connect(sink).connect(ctx.destination);

  session = { ctx, stream, node, chunks, at: useEditor.getState().playhead };
  useVoiceover.setState({ recording: true, since: performance.now() });
  // Play the video so you can talk over it, without its sound (no echo).
  // At (or past) the end there's nothing to play; just record.
  const { project, playhead } = useEditor.getState();
  engine.setMuted(true);
  if (playhead < projectDuration(project) - 1000) engine.play();
}

/** Stop recording and add the voiceover to the timeline. */
export async function stopVoiceover(): Promise<void> {
  const s = session;
  if (!s) return;
  session = null;
  useVoiceover.setState({ recording: false });
  engine.pause();
  engine.setMuted(false);
  for (const t of s.stream.getTracks()) t.stop();
  s.node.port.onmessage = null;
  s.node.disconnect();
  const rate = s.ctx.sampleRate;
  await s.ctx.close();

  const length = s.chunks.reduce((n, c) => n + c.length, 0);
  const { toast, project } = useEditor.getState();
  if (length < rate * 0.2) {
    toast("The recording was too short, so it wasn't added.");
    return;
  }
  const samples = new Float32Array(length);
  let at = 0;
  for (const c of s.chunks) {
    samples.set(c, at);
    at += c.length;
  }
  const n =
    Object.values(project.assets).filter((a) => a.name.startsWith("Voiceover"))
      .length + 1;
  const file = new File([encodeWav([samples], rate)], `Voiceover ${n}.wav`, {
    type: "audio/wav",
  });
  await importFiles([file], { at: s.at });
}

export function toggleVoiceover(): void {
  if (useVoiceover.getState().recording) void stopVoiceover();
  else void startVoiceover();
}
