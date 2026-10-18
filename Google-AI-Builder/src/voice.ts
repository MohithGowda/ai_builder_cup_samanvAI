export interface RecognitionResult {
  isFinal: boolean
  [index: number]: { transcript: string }
}

export interface VoiceRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}

export function recognitionConstructor(): (new () => VoiceRecognition) | undefined {
  const voiceWindow = window as Window & { SpeechRecognition?: new () => VoiceRecognition; webkitSpeechRecognition?: new () => VoiceRecognition }
  return voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition
}

export const assistantLanguages = [
  { code: 'en-IN', name: 'English', greeting: 'Hi, I’m Samanvay. I can explain services or take you to the right place. Try “run to birth certificate” or “jump to check eligibility”. You review and submit every form yourself.', placeholder: 'Ask for help or tell me where to go…', services: 'Explore services', apply: 'New application', eligibility: 'Check eligibility', track: 'Your applications', grievance: 'Raise a grievance', prompt: 'What services are available?', leading: 'Let’s go to', arrived: 'Here we are' },
  { code: 'hi-IN', name: 'हिन्दी', greeting: 'नमस्ते, मैं समन्वय हूँ। मैं सेवाएँ समझा सकता हूँ और सही पृष्ठ तक ले जा सकता हूँ। मुझसे किसी सेवा तक चलने या दौड़कर जाने को कहें। हर फॉर्म आप स्वयं जाँचकर जमा करेंगे।', placeholder: 'सहायता माँगें या गंतव्य बताएँ…', services: 'सेवाएँ देखें', apply: 'नया आवेदन', eligibility: 'पात्रता जाँचें', track: 'आपके आवेदन', grievance: 'शिकायत दर्ज करें', prompt: 'कौन सी सेवाएँ उपलब्ध हैं?', leading: 'आइए यहाँ चलते हैं', arrived: 'हम यहाँ पहुँच गए' },
  { code: 'kn-IN', name: 'ಕನ್ನಡ', greeting: 'ನಮಸ್ಕಾರ, ನಾನು ಸಮನ್ವಯ. ಸೇವೆಗಳನ್ನು ವಿವರಿಸಿ ಸರಿಯಾದ ಪುಟಕ್ಕೆ ಕರೆದೊಯ್ಯಬಲ್ಲೆ. ಬೇಕಾದ ಸೇವೆಗೆ ನಡೆಯಲು ಅಥವಾ ಓಡಲು ಹೇಳಿ. ಪ್ರತಿ ಫಾರ್ಮ್ ಅನ್ನು ನೀವೇ ಪರಿಶೀಲಿಸಿ ಸಲ್ಲಿಸಬೇಕು.', placeholder: 'ಸಹಾಯ ಕೇಳಿ ಅಥವಾ ಎಲ್ಲಿಗೆ ಹೋಗಬೇಕೆಂದು ಹೇಳಿ…', services: 'ಸೇವೆಗಳನ್ನು ನೋಡಿ', apply: 'ಹೊಸ ಅರ್ಜಿ', eligibility: 'ಅರ್ಹತೆ ಪರಿಶೀಲನೆ', track: 'ನಿಮ್ಮ ಅರ್ಜಿಗಳು', grievance: 'ದೂರು ದಾಖಲಿಸಿ', prompt: 'ಯಾವ ಸೇವೆಗಳು ಲಭ್ಯ?', leading: 'ಇಲ್ಲಿಗೆ ಹೋಗೋಣ', arrived: 'ನಾವು ತಲುಪಿದ್ದೇವೆ' },
] as const

export type AssistantLanguage = typeof assistantLanguages[number]['code']

export function savedAssistantLanguage(): AssistantLanguage {
  try {
    const saved = localStorage.getItem('samanvai-assistant-language')
    return assistantLanguages.find(language => language.code === saved)?.code || 'en-IN'
  } catch { return 'en-IN' }
}