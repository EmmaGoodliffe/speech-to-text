import { SpeechClient } from "@google-cloud/speech";
import { appendFile, createReadStream, writeFileSync } from "fs";
import ora from "ora";
import { getWavHeaders, recExp, useSpinner } from "./helpers";
import { STTStreamOptions, WavHeaders } from "./types";

// Define constants
const SPINNER_START_TEXT = "STT stream running...";
const SUCCESS_TEXT = "STT stream done";
const FAIL_TEXT = "STT stream failed";
const FAQ_URL = "https://cloud.google.com/speech-to-text/docs/error-messages";

// Classes
/**
 * An STT stream (for audio files shorter than 305 seconds)
 * @example
 * This example writes the transcript of a short LINEAR16 16000Hz WAV file to a text file.
 * You can customise the functionality of the stream with the {@link STTStreamOptions}.
 *
 * If you don't know the encoding or sample rate of your WAV file, try using {@link STTStream.testHeaders}
 * ```ts
 * import { STTStream } form "transcribe-stt";
 *
 * const audioFilename = "./<input audio file>.wav";
 * const textFilename = "./<output text file>.txt";
 * const options = {
 *  sampleRateHertz: 16000
 * };
 *
 * // Initialise stream
 * const stream = new STTStream(audioFilename, textFilename, options);
 *
 * // Start stream and write output to text file
 * stream.start();
 * ```
 * @public
 */
class STTStream {
  audioFilename: string;
  textFilename: string;
  append: STTStreamOptions["append"];
  encoding: STTStreamOptions["encoding"];
  sampleRateHertz: STTStreamOptions["sampleRateHertz"];
  languageCode: STTStreamOptions["languageCode"];
  /**
   * @param audioFilename - Path to audio file
   * @param textFilename - Path to text file
   * @param options - Options
   */
  constructor(
    audioFilename: string,
    textFilename: string,
    options: STTStreamOptions
  ) {
    this.audioFilename = audioFilename;
    this.textFilename = textFilename;
    this.append = options.append || false;
    this.encoding = options.encoding || "LINEAR16";
    this.sampleRateHertz = options.sampleRateHertz;
    this.languageCode = options.languageCode || "en-US";
  }
  /**
   * Test if headers of WAV file are correct
   * @example
   * This example checks if the headers you passed to {@link STTStream} are correct and logs them.
   * This can be helpful when you don't know what headers of your WAV file are.
   *
   * See {@link STTStream} to instantiate the stream
   *
   * ```ts
   * // ...
   *
   * // Test headers
   * const [goodEncoding, goodSampleRate, headers] = await stream.testHeaders();
   *
   * // Log results
   * console.log("File has correct encoding?", goodEncoding);
   * console.log("File has correct sample rate?", goodSampleRate);
   *
   * // Log headers
   * console.log("File has encoding:", headers.encoding);
   * console.log("File has sample rate:", headers.sampleRateHertz);
   * ```
   * @remarks
   * This method does not test encodings perfectly as many encodings go by multiples aliases.
   * For example, "LINEAR16" is often listed in headers as "Microsoft PCM 16 bit".
   *
   * Because of this, {@link STTStream.testHeaders} does not have to pass for {@link STTStream.start} to pass.
   *
   * If you find an alias of an encoding that causes {@link STTStream.testHeaders} to throw a false error, please leave an issue about it in the GitHub repo
   * @returns If encoding was correct, if sample rate was correct, and the headers of the WAV file
   */
  async testHeaders(): Promise<[boolean, boolean, WavHeaders]> {
    const headers = await getWavHeaders(this.audioFilename);
    const encodingPassed = this.encoding === headers.encoding;
    const sampleRatePassed = this.sampleRateHertz === headers.sampleRateHertz;
    return [encodingPassed, sampleRatePassed, headers];
  }
  /**
   * Start STT stream
   * @example
   * See {@link STTStream} for an example
   * @param useConsole - Whether to show a loading spinner and deliver warnings in the console during STT stream. Default `true`
   * @returns Lines of the transcript
   */
  async start(useConsole = true): Promise<string[]> {
    const [goodEncoding, goodSampleRate, headers] = await this.testHeaders();
    const warningPrefix =
      "Warning: Your audio encoding and sample rate might not be correct";

    if (!goodEncoding) {
      const reason = recExp("encoding", this.encoding, headers.encoding);
      useConsole && console.warn(`${warningPrefix}. ${reason}`);
    }

    if (!goodSampleRate) {
      const reason = recExp(
        "sample rate (Hertz)",
        this.sampleRateHertz,
        headers.sampleRateHertz
      );
      useConsole && console.warn(`${warningPrefix}. ${reason}`);
    }

    // Initialise results
    let results: string[] = [];
    // If user wants to show spinner
    if (useConsole) {
      // Run function with spinner wrapper
      results = await useSpinner(
        this.inner(),
        ora(SPINNER_START_TEXT),
        SUCCESS_TEXT,
        FAIL_TEXT
      );
    } else {
      // Run function normally
      results = await this.inner();
    }
    // Return results
    return results;
  }
  /**
   * Main inner method (automatically called by {@link STTStream.start})
   * @internal
   */
  private inner(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      // Initialise results
      const results: string[] = [];

      // If not appending
      if (!this.append) {
        // Empty file
        this.emptyTextFile();
      }

      // Initialise client
      const client = new SpeechClient();

      // Define request
      const request = {
        config: {
          encoding: this.encoding,
          sampleRateHertz: this.sampleRateHertz,
          languageCode: this.languageCode,
        },
      };

      // Create read stream for audio file
      const audioReadStream = createReadStream(this.audioFilename);

      // Define a read/write stream to handle audio file
      const recogniseStream = client
        .streamingRecognize(request)
        .on("error", err => {
          // Handle errors
          const reason = [
            `An error occurred running the STT stream. ${err}`,
            `See ${FAQ_URL} for help on common error messages`,
          ].join("\n");
          reject(reason);
        })
        .on("data", data => {
          // Get result
          const result = data.results[0].alternatives[0].transcript as string;
          // Save result
          results.push(result);
          // Append result to text file
          appendFile(this.textFilename, `${result}\n`, err => {
            // Handle errors
            if (!err) return;
            const reason = `An error occurred writing to the text file. ${err}`;
            reject(reason);
          });
        })
        .on("end", () => resolve(results));

      // Pipe audio file through read/write stream
      audioReadStream.pipe(recogniseStream);
    });
  }
  /** Empty text file */
  emptyTextFile(): void {
    writeFileSync(this.textFilename, "");
  }
}

export default STTStream;
