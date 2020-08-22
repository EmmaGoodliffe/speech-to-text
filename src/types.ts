import { google } from "@google-cloud/speech/build/protos/protos";
import { LanguageCode } from "./generated/LanguageCode";

// Types
/**
 * Listener for the progress value
 * @remarks
 * <h2>Parameters</h2>
 * <code>progress</code> - Progress percentage
 * @public
 */
export type ProgressListener = (progress: number) => void | Promise<void>;

/**
 *  Listener for the distribute value
 * @public
 */
export type DistributeListener = () => void | Promise<void>;

/**
 * Listener for any property
 * @public
 */
export type Listener = ProgressListener | DistributeListener;

/**
 * Audio encoding
 * @remarks
 * See https://cloud.google.com/speech-to-text/docs/encoding
 *
 * If you don't know the encoding of your WAV file, find out how to check it <a href="https://github.com/EmmaGoodliffe/transcribe-stt/blob/master/README.md#encoding">here</a>
 * @public
 */
export type AudioEncoding = keyof typeof google.cloud.speech.v1.RecognitionConfig.AudioEncoding;

export { LanguageCode };

// Interfaces
/**
 *  Options for an STT stream
 * @public
 */
export interface STTStreamOptions {
  /** Audio encoding. See {@link AudioEncoding} */
  encoding: AudioEncoding;
  /**
   * Audio sample rate in Hertz
   * @remarks
   * If you don't know the encoding of your WAV file, find out how to check it <a href="https://github.com/EmmaGoodliffe/transcribe-stt/blob/master/README.md#sample-rate">here</a>
   */
  sampleRateHertz: number;
  /** BCP-47 language code. See {@link LanguageCode}. Default `"en-US"` */
  languageCode?: LanguageCode;
}
