import { IModerationProvider, ModerationResult } from './provider.interface';

export class MockModerationProvider implements IModerationProvider {
  name = 'MockModerator';

  async generateSoothingReply(message: string): Promise<ModerationResult> {
    const start = Date.now();
    return {
      isHarmful: true,
      soothingReply:
        'Please maintain a respectful and welcoming environment for everyone in this conversation. ' +
        'Aggressive or offensive language discourages open collaboration and dialogue. ' +
        'Let us focus on constructive ideas and mutual understanding. ' +
        'Taking a short pause before replying can help keep discussions productive. ' +
        'Thank you for contributing positively to the community.',
      provider: 'mock',
      durationMs: Date.now() - start,
    };
  }
}
