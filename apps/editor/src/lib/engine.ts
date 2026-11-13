import {
  collectAudioSegments,
  evaluateFrame,
  type Micros,
  projectDuration,
  rootComposition,
  US,
} from "@motion/core";
import { AudioPreview, FrameProvider } from "@motion/media";
import { Compositor } from "@motion/renderer";
import { getHandle } from "../state/media.ts";
import { useEditor } from "../state/store.ts";

/** How far ahead to start decoding upcoming clips, so cuts don't stall. */
const LOOKAHEAD: Micros = 0.4 * US;

/**
 * Drives the preview: draws the frame at the playhead, and plays in sync
 * with the audio clock. Draws with the same compositor code as export.
 */
class Engine {
  private compositor: Compositor | null = null;
  private frames = new FrameProvider(getHandle);
  private audio = new AudioPreview();
  private drawing = false;
  private pending: Micros | null = null;
  private raf = 0;

  constructor() {
    // Redraw when the project or playhead changes while paused.
    useEditor.subscribe((s, prev) => {
      if (s.project !== prev.project) {
        if (s.playing) this.restartAudio(this.audio.time);
        this.request(s.playhead);
      } else if (!s.playing && s.playhead !== prev.playhead) {
        this.request(s.playhead);
      }
    });
  }

  attach(canvas: HTMLCanvasElement): string | null {
    try {
      this.compositor = new Compositor(canvas);
    } catch (err) {
      return err instanceof Error ? err.message : "Couldn't start the preview.";
    }
    this.request(useEditor.getState().playhead);
    return null;
  }

  detach(): void {
    this.pause();
    this.compositor?.dispose();
    this.compositor = null;
  }

  /** Ask for a redraw. Requests made while drawing collapse into one. */
  request(t: Micros = useEditor.getState().playhead): void {
    if (this.drawing) {
      this.pending = t;
      return;
    }
    void this.draw(t);
  }

  private async draw(t: Micros): Promise<void> {
    const compositor = this.compositor;
    if (!compositor) return;
    this.drawing = true;
    try {
      const { project } = useEditor.getState();
      const draws = evaluateFrame(project, t);
      const upcoming = evaluateFrame(project, t + LOOKAHEAD);
      this.frames.warm(upcoming);
      const images = await this.frames.images(
        draws,
        upcoming.map((d) => d.key),
      );
      // The project may have changed while decoding; re-evaluate cheaply.
      const latest = useEditor.getState().project;
      const finalDraws = latest === project ? draws : evaluateFrame(latest, t);
      const comp = rootComposition(latest);
      compositor.render({
        draws: finalDraws,
        images,
        compWidth: comp.width,
        compHeight: comp.height,
        background: comp.background,
      });
    } catch (err) {
      console.error("[motion] preview", err);
    } finally {
      this.drawing = false;
    }
    if (this.pending !== null) {
      const next = this.pending;
      this.pending = null;
      void this.draw(next);
    }
  }

  // ------------------------------------------------------------ playback

  /** Call from a click or key handler, so the browser allows audio. */
  play(): void {
    const s = useEditor.getState();
    const duration = projectDuration(s.project);
    if (duration <= 0) return;
    let from = s.playhead;
    if (from >= duration - 1000) from = 0;
    s.setPlayhead(from);
    this.restartAudio(from);
    s.setPlaying(true);
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  pause(): void {
    cancelAnimationFrame(this.raf);
    this.audio.stop();
    const s = useEditor.getState();
    if (s.playing) s.setPlaying(false);
  }

  toggle(): void {
    if (useEditor.getState().playing) this.pause();
    else this.play();
  }

  /** Jump the playhead, keeping playback going if it was. */
  seek(t: Micros): void {
    const s = useEditor.getState();
    s.setPlayhead(t);
    if (s.playing) this.restartAudio(useEditor.getState().playhead);
  }

  private restartAudio(from: Micros) {
    const { project } = useEditor.getState();
    this.audio.play(collectAudioSegments(project), getHandle, from);
  }

  private tick = () => {
    const s = useEditor.getState();
    if (!s.playing) return;
    const duration = projectDuration(s.project);
    const t = this.audio.time;
    if (t >= duration) {
      this.pause();
      s.setPlayhead(duration);
      this.request(duration);
      return;
    }
    s.setPlayhead(t);
    this.request(t);
    this.raf = requestAnimationFrame(this.tick);
  };
}

export const engine = new Engine();
