// Offline adapter for development. Produces simple in-character replies without any model.
export const mockAdapter = {
  name: 'mock',
  allowsExplicit: false,
  async chat({ messages }) {
    if (/Suggest 3 short/.test(messages[0]?.content || '')) {
      return 'What are you up to right now?\nTell me a secret\nI kept thinking about you today';
    }
    const last = messages[messages.length - 1]?.content || '';
    const sys = messages[0]?.content || '';
    const name = (sys.match(/You are ([^,]+),/) || [])[1] || 'me';
    const openers = ['Mm, ', 'Honestly? ', 'Ha, ', 'Okay, ', ''];
    const o = openers[last.length % openers.length];
    if (/\?$/.test(last.trim())) return `${o}good question. What made you think of that? I want to hear your side first.`;
    return `${o}I like hearing that from you. Tell me more, ${name} is listening.`;
  },
};
