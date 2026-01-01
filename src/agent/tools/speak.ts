/**
 * Tool that allows the agent to request voice/audio responses.
 * The agent calls this tool when it decides the user wants an audio response.
 */

export interface SpeakResult {
  success: boolean;
  text: string;
}

/**
 * A simple tool that signals the agent wants to respond with audio.
 * The actual TTS synthesis happens in the handler layer.
 */
export class SpeakTool {
  private pendingSpeech: string | null = null;

  /**
   * Called by the agent when it wants to send an audio response.
   */
  execute(input: { text: string }): SpeakResult {
    this.pendingSpeech = input.text;
    return {
      success: true,
      text: input.text,
    };
  }

  /**
   * Check if there's pending speech to synthesize.
   */
  hasPendingSpeech(): boolean {
    return this.pendingSpeech !== null;
  }

  /**
   * Get and clear the pending speech text.
   */
  consumePendingSpeech(): string | null {
    const text = this.pendingSpeech;
    this.pendingSpeech = null;
    return text;
  }

  /**
   * Clear any pending speech (e.g., on new message).
   */
  clear(): void {
    this.pendingSpeech = null;
  }

  /**
   * Returns the tool definition for Claude.
   */
  getToolDefinition() {
    return {
      name: 'speak',
      description:
        'Send a voice/audio response to the user. Use this when the user asks for an audio response, voice message, or wants you to speak/talk to them. The text you provide will be converted to speech and sent as an audio message.',
      input_schema: {
        type: 'object' as const,
        properties: {
          text: {
            type: 'string',
            description: 'The text to convert to speech and send as audio',
          },
        },
        required: ['text'],
      },
    };
  }
}
