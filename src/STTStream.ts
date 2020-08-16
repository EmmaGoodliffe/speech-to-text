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
 * An STT stream
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
    audioFilename: STTStream["audioFilename"],
    textFilename: STTStream["textFilename"],
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
   * Main inner method called during `STTStream.start()`
   * @internal
   */
  private inner(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      // Initialise results
      const results: string[] = [];

      // If not appending
      if (!this.append) {
        // Empty file
        writeFileSync(this.textFilename, "");
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
}

export default STTStream;