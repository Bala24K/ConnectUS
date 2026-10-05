import { GoogleGenerativeAI } from '@google/generative-ai';
import { IModerationProvider, ModerationResult } from './provider.interface';
import { logger } from '../observability/logger';

export class GeminiModerationProvider implements IModerationProvider {
  name = 'GeminiModerator';
  private genAI: GoogleGenerativeAI;
  private modelName: string;

  constructor(apiKey: string, modelName = 'gemini-1.5-flash') {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
  }

  async generateSoothingReply(message: string): Promise<ModerationResult> {
    const start = Date.now();
    try {
      const model = this.genAI.getGenerativeModel({ model: this.modelName });
      const prompt = `You are a professional AI moderator for an online collaboration chat platform.
A user sent an offensive or toxic message:
"""
${message.replace(/"/g, "'")}
"""

Write a calm, empathetic, but firm de-escalation response.
Explain why harmful language disrupts productive collaboration.
Encourage respectful discussion. Provide a minimum of 4-5 sentences.
Do not repeat slurs or offensive words.`;

      const result = await Promise.race([
        model.generateContent(prompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini API timeout after 8000ms')), 8000)
        ),
      ]);

      const response = await result.response;
      const text = response.text() || 'Please keep the discussion respectful and constructive.';

      return {
        isHarmful: true,
        soothingReply: text.trim(),
        provider: 'gemini',
        durationMs: Date.now() - start,
      };
    } catch (error) {
      logger.warn({ error, duration: Date.now() - start }, 'Gemini moderation failed; using fallback soothing response');
      return {
        isHarmful: true,
        soothingReply:
          'Please keep the discussion constructive and respectful. Respectful dialogue fosters better collaboration for all participants. Let us take a moment to reflect before continuing.',
        provider: 'gemini-fallback',
        durationMs: Date.now() - start,
      };
    }
  }
}
