import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type { Readable } from "stream";

/**
 * Premium neural voices for Shizuka.
 *
 * English: en-US-JennyNeural — Microsoft's highest-quality conversational
 * female voice, natural prosody, excellent for companion/assistant persona.
 *
 * Hindi: hi-IN-SwaraNeural — top-tier Indian Hindi female neural voice.
 *
 * Hinglish (mixed): en-IN-NeerjaNeural — Indian-English voice that blends
 * comfortably with Romanized Hindi words, used when the text is
 * predominantly Latin-script Hinglish.
 */
const VOICE_HINDI   = "hi-IN-SwaraNeural";
const VOICE_ENGLISH = "en-US-JennyNeural";
const VOICE_HINGLISH = "en-IN-NeerjaNeural";

/** Matches Devanagari Unicode block — pure Hindi text. */
const DEVANAGARI_RE = /[\u0900-\u097F]/;

/** Matches common Hinglish marker words (Roman-script Hindi). */
const HINGLISH_MARKERS_RE =
  /\b(arre|yaar|bhai|boss|haan|nahi|kya|hai|toh|aur|bas|accha|thoda|bahut|bilkul|suno|dekho|kal|aaj|raat|subah|phir|bolo|chal|kar|karo|mera|tera|meri|teri|hum|tum)\b/i;

/**
 * Detects which voice best matches the given text:
 * - Devanagari characters → Hindi voice
 * - Predominantly Latin text with Hinglish markers → Hinglish (Indian-EN) voice
 * - Everything else → premium English (Jenny) voice
 */
export function resolveVoiceForText(text: string): string {
  if (DEVANAGARI_RE.test(text)) return VOICE_HINDI;
  if (HINGLISH_MARKERS_RE.test(text)) return VOICE_HINGLISH;
  return VOICE_ENGLISH;
}

/**
 * Emotion-aware prosody.
 * The reply text is scanned for emotional signal words and the TTS rate /
 * pitch is adjusted accordingly so Shizuka sounds genuinely expressive
 * rather than uniformly neutral.
 */
interface Prosody {
  pitch: string;
  rate: string;
  volume: string;
}

function detectEmotionProsody(text: string): Prosody {
  const lower = text.toLowerCase();

  // Excited / happy
  if (/(!{2,}|wow|yay|amazing|fantastic|great news|so happy|bahut acha|wah|arre wah|seriously\?)/i.test(lower)) {
    return { pitch: "+20Hz", rate: "+15%", volume: "+5%" };
  }

  // Empathetic / sad / soft
  if (/\b(sorry|i hear you|that's tough|it's okay|don't worry|take a breath|ho jayega|sab theek|rone mat|samjha)\b/i.test(lower)) {
    return { pitch: "-5Hz", rate: "-12%", volume: "-5%" };
  }

  // Firm / assertive / protective
  if (/\b(no no|stop|listen carefully|i won't allow|nahi karenge|bilkul nahi|ek second|ruk)\b/i.test(lower)) {
    return { pitch: "-8Hz", rate: "+5%", volume: "+8%" };
  }

  // Playful / teasing
  if (/\b(haha|lol|seriously|really\?|omg|oh wow|kitna cute|pagal|naughty)\b/i.test(lower)) {
    return { pitch: "+10Hz", rate: "+8%", volume: "default" };
  }

  // Default — warm, slightly bright companion voice
  return { pitch: "+12Hz", rate: "default", volume: "default" };
}

export interface SynthesizeResult {
  audioStream: Readable;
  voice: string;
  contentType: string;
}

/**
 * Synthesizes speech with premium neural voice selection + emotion-aware
 * prosody. Returns a raw readable MP3 stream for zero-latency piping to
 * the HTTP response.
 */
export async function synthesizeSpeech(text: string): Promise<SynthesizeResult> {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    throw new Error("Cannot synthesize speech for empty text");
  }

  const voice = resolveVoiceForText(trimmed);
  const prosody = detectEmotionProsody(trimmed);

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const { audioStream } = tts.toStream(trimmed, {
    pitch: prosody.pitch,
    rate: prosody.rate,
    volume: prosody.volume,
  });

  return {
    audioStream,
    voice,
    contentType: "audio/mpeg",
  };
}
