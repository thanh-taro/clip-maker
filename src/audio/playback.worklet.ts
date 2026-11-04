// MOD-Audio — the AudioWorkletProcessor (ADR-0003 §3, ADR-0008): plays the 48 kHz stereo blocks the
// audio worker sends over a transferred MessagePort and reports its position (the master clock).
// Phase 3.3 stub: registers the processor and outputs silence; built with F-002.
// The worklet global scope is not in the DOM library, so its two names are declared here.
declare const registerProcessor: (name: string, ctor: new () => unknown) => void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

/** The processor name MOD-Audio creates its `AudioWorkletNode` with. */
const PROCESSOR = 'clipmaker-playback';

class PlaybackProcessor extends AudioWorkletProcessor {
  process(_inputs: Float32Array[][], _outputs: Float32Array[][]): boolean {
    return true; // outputs stay zero-filled (silence) until F-002
  }
}

registerProcessor(PROCESSOR, PlaybackProcessor);
