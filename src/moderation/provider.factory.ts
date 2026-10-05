import { config } from '../config';
import { IModerationProvider } from './provider.interface';
import { GeminiModerationProvider } from './gemini.provider';
import { MockModerationProvider } from './mock.provider';
import { logger } from '../observability/logger';

let provider: IModerationProvider | null = null;

export function getModerationProvider(): IModerationProvider {
  if (provider) return provider;

  if (config.geminiApiKey && config.geminiApiKey !== 'your_gemini_api_key_here') {
    logger.info('Using Google Gemini AI Moderation Provider.');
    provider = new GeminiModerationProvider(config.geminiApiKey, config.geminiModel);
  } else {
    logger.info('No valid GEMINI_API_KEY detected; using MockModerationProvider.');
    provider = new MockModerationProvider();
  }

  return provider;
}
