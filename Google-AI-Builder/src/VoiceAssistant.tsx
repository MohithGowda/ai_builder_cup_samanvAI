import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, BrainCircuit, Check, ChevronDown, Footprints, Languages, LoaderCircle, Mic, MicOff, RefreshCw, Send, Settings2, ShieldCheck, Square, ThumbsDown, ThumbsUp, Trash2, Volume2, VolumeX, X } from 'lucide-react'
import { api, speechAudio, type SpeechCapabilities, type AssistantAction, type AssistantMemoryState, type AssistantPreferences, type AssistantReply, type AssistantSessionContext, type GuideTravelMode } from './api'
import { assistantLanguages, recognitionConstructor, savedAssistantLanguage, type AssistantLanguage, type VoiceRecognition } from './voice'
import './voice-assistant.css'
import SamanvayCharacter, { type GuideExpression } from './SamanvayCharacter'
import './assistant-memory.css'
import './speech-settings.css'

interface Turn { role: 'user' | 'assistant'; text: string; language: AssistantLanguage; result?: AssistantReply }
interface Journey { motion: GuideTravelMode; phase: 'moving' | 'arrived'; label: string; x: number; y: number; direction: 'left' | 'right' }

export default function VoiceAssistant({ hidden, districts, onPrepareAction, onAction }: { hidden: boolean; districts: string[]; onPrepareAction: (action: AssistantAction, service?: string, district?: string, signal?: AbortSignal) => Promise<HTMLElement | null>; onAction: (action: AssistantAction) => void }) {
  const [open, setOpen] = useState(false)
  const [language, setLanguage] = useState<AssistantLanguage>(savedAssistantLanguage)
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [speakReplies, setSpeakReplies] = useState(true)
  const [notice, setNotice] = useState('')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [movement, setMovement] = useState<GuideTravelMode>('walk')
  const [journey, setJourney] = useState<Journey | null>(null)
  const [memory, setMemory] = useState<AssistantMemoryState | null>(null)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [memoryBusy, setMemoryBusy] = useState(false)
  const [feedback, setFeedback] = useState<Record<string, boolean>>({})
  const [speech, setSpeech] = useState<SpeechCapabilities | null>(null)
  const [audioSettings, setAudioSettings] = useState(false)
  const [audioProvider, setAudioProvider] = useState<'auto' | 'device' | 'cloud'>('auto')
  const [voiceName, setVoiceName] = useState('')
  const launcher = useRef<HTMLButtonElement>(null)
  const traveller = useRef<HTMLDivElement>(null)
  const activeAnimation = useRef<Animation | null>(null)
  const journeyVersion = useRef(0)
  const journeyBusy = useRef(false)
  const journeyAbort = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const conversation = useRef<HTMLDivElement>(null)
  const recognition = useRef<VoiceRecognition | null>(null)
  const request = useRef<AbortController | null>(null)
  const busyRef = useRef(false)
  const sessionContext = useRef<AssistantSessionContext>({})
  const audioElement = useRef<HTMLAudioElement | null>(null)
  const audioRequest = useRef<AbortController | null>(null)
  const audioUrl = useRef<string | null>(null)
  const speechVersion = useRef(0)
  const copy = assistantLanguages.find(item => item.code === language)!
  const voiceInput = Boolean(recognitionConstructor()) && window.isSecureContext
  const voiceOutput = 'speechSynthesis' in window
  const audioAvailable = voiceOutput || Boolean(speech?.configured)
  const languageVoices = voices.filter(voice => voice.lang.toLowerCase().startsWith(language.split('-')[0]))

  useEffect(() => {
    const controller = new AbortController()
    void api<SpeechCapabilities>('/speech/capabilities', undefined, controller.signal).then(setSpeech).catch(() => {})
    return () => controller.abort()
  }, [])

  function restorePreferences(state: AssistantMemoryState) {
    setMemory(state)
    if (state.enabled) {
      const selected = assistantLanguages.find(item => item.code === state.preferences.language)
      if (selected) setLanguage(selected.code)
      if (state.preferences.movement) setMovement(state.preferences.movement)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void api<AssistantMemoryState>('/assistant/memory', undefined, controller.signal)
      .then(restorePreferences)
      .catch(error => { if (error.name !== 'AbortError') setNotice('Assistant memory is unavailable. This conversation can still continue without saving preferences.') })
    return () => controller.abort()
  }, [])

  async function saveMemory(enabled?: boolean, preferences: AssistantPreferences = {}) {
    if (memoryBusy) return
    setMemoryBusy(true)
    stopRecognition()
    stopSpeech()
    try {
      const result = await api<AssistantMemoryState>('/assistant/memory', { enabled, preferences })
      restorePreferences(result)
      setNotice('')
    } catch (error) { setNotice((error as Error).message) }
    finally { setMemoryBusy(false) }
  }

  async function forgetMemory() {
    if (memoryBusy) return
    setMemoryBusy(true)
    stopRecognition()
    stopSpeech()
    request.current?.abort()
    try {
      restorePreferences(await api<AssistantMemoryState>('/assistant/memory/forget', {}))
      setTurns([])
      sessionContext.current = {}
      setFeedback({})
      setInput('')
      setNotice('Saved preferences, service context and personal feedback were deleted. Memory is off.')
    } catch (error) { setNotice((error as Error).message) }
    finally { setMemoryBusy(false) }
  }

  async function rateReply(result: AssistantReply, helpful: boolean) {
    if (!result.request_id || !result.citations?.length) return
    try {
      const state = await api<AssistantMemoryState>('/assistant/feedback', { request_id: result.request_id, source_ids: result.citations.map(citation => citation.id), helpful })
      setMemory(state)
      setFeedback(previous => ({ ...previous, [result.request_id!]: helpful }))
    } catch (error) { setNotice((error as Error).message) }
  }

  function stopRecognition() {
    const current = recognition.current
    recognition.current = null
    if (current) {
      current.onresult = null
      current.onerror = null
      current.onend = null
      current.abort()
    }
    setListening(false)
  }

  function stopSpeech() {
    speechVersion.current += 1
    audioRequest.current?.abort()
    audioElement.current?.pause()
    audioElement.current = null
    if (audioUrl.current) { URL.revokeObjectURL(audioUrl.current); audioUrl.current = null }
    if (voiceOutput) window.speechSynthesis.cancel()
    setSpeaking(false)
  }

  async function speak(text: string, selectedLanguage = language) {
    stopSpeech()
    const version = speechVersion.current
    const availableVoices = (voiceOutput ? window.speechSynthesis.getVoices() : []).filter(voice => voice.lang.toLowerCase().startsWith(selectedLanguage.split('-')[0]))
    const matchingVoice = availableVoices.find(voice => voice.voiceURI === voiceName)
      || availableVoices.find(voice => /\b(male|david|mark|guy|ravi|prabhat|madhur|gagan)\b/i.test(voice.name))
      || availableVoices.find(voice => voice.lang.toLowerCase() === selectedLanguage.toLowerCase())
      || availableVoices[0]
    const useCloud = audioProvider === 'cloud' || (audioProvider === 'auto' && !matchingVoice && (selectedLanguage !== 'en-IN' || !voiceOutput) && speech?.configured)
    if (useCloud) {
      if (!speech?.configured) { setNotice('Google Cloud speech is not configured. Select an available device voice or use text.'); return }
      const controller = new AbortController()
      audioRequest.current = controller
      const words = text.replace(/[•*#]/g, '').split(/\s+/)
      const chunks: string[] = []
      let chunk = ''
      for (const word of words) {
        if (chunk.length + word.length > 900 && chunk) { chunks.push(chunk); chunk = '' }
        chunk += `${chunk ? ' ' : ''}${word}`
      }
      if (chunk) chunks.push(chunk)
      setNotice('Preparing Google audio...')
      try {
        for (const part of chunks) {
          const blob = await speechAudio(part, selectedLanguage, controller.signal)
          if (version !== speechVersion.current) return
          const url = URL.createObjectURL(blob)
          audioUrl.current = url
          const audio = new Audio(url)
          audioElement.current = audio
          const finished = new Promise<void>((resolve, reject) => {
            const cleanup = () => controller.signal.removeEventListener('abort', cancelled)
            const cancelled = () => { audio.pause(); cleanup(); resolve() }
            controller.signal.addEventListener('abort', cancelled, { once: true })
            audio.onended = () => { cleanup(); resolve() }
            audio.onerror = () => { cleanup(); reject(new Error('This browser could not play the Google audio. Typed replies are still available.')) }
          })
          audio.onplaying = () => { if (version === speechVersion.current) { setSpeaking(true); setNotice('') } }
          await Promise.all([audio.play(), finished])
          URL.revokeObjectURL(url)
          if (audioUrl.current === url) audioUrl.current = null
          if (version !== speechVersion.current) return
        }
      } catch (error) {
        if (version === speechVersion.current && (error as Error).name !== 'AbortError') setNotice((error as Error).message)
      } finally {
        if (version === speechVersion.current) {
          controller.abort()
          audioElement.current = null
          if (audioUrl.current) { URL.revokeObjectURL(audioUrl.current); audioUrl.current = null }
          setSpeaking(false)
        }
      }
      return
    }
    if (!voiceOutput || (!matchingVoice && selectedLanguage !== 'en-IN')) {
      setNotice(`No ${selectedLanguage === 'kn-IN' ? 'Kannada' : selectedLanguage === 'hi-IN' ? 'Hindi' : 'matching'} device voice is installed. Google Cloud speech ${speech?.configured ? 'can be selected in Audio settings' : 'is not configured'}. Text replies still work.`)
      return
    }
    const parts = text.replace(/[•*#]/g, '').match(/[^.!?।\n]+[.!?।]?/g) || [text]
    const playPart = (index: number) => {
      if (version !== speechVersion.current || index >= parts.length) { if (version === speechVersion.current) setSpeaking(false); return }
      const utterance = new SpeechSynthesisUtterance(parts[index])
      utterance.lang = selectedLanguage
      if (matchingVoice) utterance.voice = matchingVoice
      utterance.rate = selectedLanguage === 'en-IN' ? 0.95 : 0.9
      utterance.onstart = () => { if (version === speechVersion.current) setSpeaking(true) }
      utterance.onend = () => playPart(index + 1)
      utterance.onerror = event => {
        if (version !== speechVersion.current) return
        setSpeaking(false)
        if (!['canceled', 'interrupted'].includes(event.error)) setNotice('The device voice could not play. Try Google Cloud in Audio settings when configured, or use text.')
      }
      window.speechSynthesis.speak(utterance)
    }
    setNotice('')
    playPart(0)
  }

  useEffect(() => {
    if (!voiceOutput) return
    const update = () => setVoices(window.speechSynthesis.getVoices())
    update()
    window.speechSynthesis.addEventListener('voiceschanged', update)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update)
  }, [voiceOutput])

  useEffect(() => {
    if (open && !hidden) inputRef.current?.focus()
    else {
      stopRecognition()
      if (!journeyBusy.current || hidden) stopSpeech()
      request.current?.abort()
      busyRef.current = false
      setBusy(false)
    }
    if (hidden) { setOpen(false); cancelJourney() }
  }, [open, hidden])

  useEffect(() => {
    conversation.current?.scrollTo({ top: conversation.current.scrollHeight, behavior: 'smooth' })
  }, [turns, busy])

  useEffect(() => {
    const stopOnHide = () => {
      if (document.hidden) { stopRecognition(); stopSpeech(); cancelJourney() }
    }
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && journeyBusy.current) { event.preventDefault(); cancelJourney() }
    }
    document.addEventListener('visibilitychange', stopOnHide)
    document.addEventListener('keydown', cancelOnEscape)
    return () => {
      document.removeEventListener('visibilitychange', stopOnHide)
      document.removeEventListener('keydown', cancelOnEscape)
      journeyVersion.current += 1
      journeyAbort.current?.abort()
      audioRequest.current?.abort()
      audioElement.current?.pause()
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current)
      activeAnimation.current?.cancel()
      request.current?.abort()
      const current = recognition.current
      if (current) { current.onresult = null; current.onerror = null; current.onend = null; current.abort() }
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [])

  async function sendMessage(question: string) {
    const message = question.trim()
    if (!message || busyRef.current) return
    stopRecognition()
    stopSpeech()
    busyRef.current = true
    setBusy(true)
    setNotice('')
    setInput('')
    const controller = new AbortController()
    request.current = controller
    const selectedLanguage = language
    const history = turns.slice(-6).map(turn => ({ role: turn.role, content: turn.text.slice(0, 1600) }))
    setTurns(previous => [...previous, { role: 'user', text: message, language: selectedLanguage }])
    try {
      const result = await api<AssistantReply>('/assistant', { message, language: selectedLanguage, history, movement, context: sessionContext.current }, controller.signal)
      if (controller.signal.aborted) return
      if (result.context) {
        const sameService = result.context.service === sessionContext.current.service
        sessionContext.current = result.context.clarification ? {} : {
          service: result.context.service || undefined,
          case_id: result.context.case_id || undefined,
          action: result.context.action || (sameService ? sessionContext.current.action : undefined),
        }
      }
      setTurns(previous => [...previous, { role: 'assistant', text: result.answer, language: selectedLanguage, result }])
      if (memory?.enabled) {
        void api<AssistantMemoryState>('/assistant/memory', undefined, controller.signal).then(setMemory).catch(() => {})
      }
      if (result.navigation && ['services', 'apply', 'eligibility', 'track', 'grievance'].includes(result.navigation.action) && ['walk', 'run', 'jump'].includes(result.navigation.motion)) {
        void guide(result.navigation.action, result.navigation.motion, result.navigation.service, result.navigation.district)
      } else if (speakReplies && !document.hidden) speak(result.answer, selectedLanguage)
    } catch (error) {
      if ((error as Error).name !== 'AbortError') { setNotice((error as Error).message); setInput(message) }
    } finally {
      if (request.current === controller) {
        busyRef.current = false
        setBusy(false)
      }
    }
  }

  function listen() {
    if (listening) { stopRecognition(); return }
    const Constructor = recognitionConstructor()
    if (!Constructor || !window.isSecureContext) { setNotice('Voice input is unavailable here. Type your question below.'); return }
    stopSpeech()
    setNotice('')
    const current = new Constructor()
    current.lang = language
    current.continuous = false
    current.interimResults = true
    current.maxAlternatives = 1
    current.onresult = event => {
      const results = Array.from(event.results)
      const transcript = results.map(result => result[0].transcript).join(' ').trim()
      setInput(transcript)
      if (results.some(result => result.isFinal) && transcript) void sendMessage(transcript)
    }
    current.onerror = event => {
      setListening(false)
      const errors: Record<string, string> = {
        'not-allowed': 'Microphone permission was denied. Enable it in your browser or type your question.',
        'service-not-allowed': 'Your browser has disabled voice recognition. You can still type your question.',
        'audio-capture': 'No microphone was found. You can still type your question.',
        'no-speech': 'No speech was detected. Try again or type your question.',
        'network': 'The browser speech service could not connect. You can still type your question.',
        'language-not-supported': 'Voice recognition is unavailable for this language on your device. Use typed input.',
      }
      if (event.error !== 'aborted') setNotice(errors[event.error] || 'Voice recognition stopped. Try again or type your question.')
    }
    current.onend = () => { if (recognition.current === current) { recognition.current = null; setListening(false) } }
    recognition.current = current
    try { current.start(); setListening(true) }
    catch { recognition.current = null; setListening(false); setNotice('The microphone could not start. You can still type your question.') }
  }

  function close() {
    setOpen(false)
    launcher.current?.focus()
  }

  function chooseLanguage(value: AssistantLanguage) {
    stopRecognition()
    stopSpeech()
    setLanguage(value)
    setVoiceName('')
    setInput('')
    setNotice('')
    try { localStorage.setItem('samanvai-assistant-language', value) } catch {}
    if (memory?.enabled) void saveMemory(undefined, { language: value })
  }

  function cancelJourney() {
    journeyVersion.current += 1
    journeyAbort.current?.abort()
    activeAnimation.current?.cancel()
    journeyBusy.current = false
    setJourney(null)
    document.querySelectorAll('[data-guide-active]').forEach(target => target.removeAttribute('data-guide-active'))
    stopSpeech()
    requestAnimationFrame(() => launcher.current?.focus())
  }

  async function guide(action: AssistantAction, mode = movement, service?: string, districtPreference = memory?.preferences.district || undefined) {
    if (journeyBusy.current) return
    const origin = launcher.current?.getBoundingClientRect()
    const version = ++journeyVersion.current
    const controller = new AbortController()
    journeyAbort.current = controller
    journeyBusy.current = true
    stopRecognition()
    stopSpeech()
    request.current?.abort()
    busyRef.current = false
    setBusy(false)
    setOpen(false)
    const size = window.innerWidth < 570 ? { width: 82, height: 153 } : { width: 100, height: 184 }
    const startX = Math.max(8, origin?.left ?? window.innerWidth - size.width - 20)
    const startY = Math.max(12, Math.min(window.innerHeight - size.height - 12, origin?.top ?? window.innerHeight - size.height - 20))
    setJourney({ motion: mode, phase: 'moving', label: copy[action], x: startX, y: startY, direction: 'left' })
    let target: HTMLElement | null = null
    let flight: Animation | null = null
    let completed = false
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const finishForReducedMotion = () => { if (reduced.matches) activeAnimation.current?.finish() }
    reduced.addEventListener('change', finishForReducedMotion)
    try {
      target = await onPrepareAction(action, service, districtPreference, controller.signal)
      if (version !== journeyVersion.current) return
      if (!target) throw new Error('That service destination is not available right now.')
      target.setAttribute('data-guide-active', String(version))
      const bounds = target.getBoundingClientRect()
      const destinationX = Math.max(8, Math.min(window.innerWidth - size.width - 8, bounds.left + bounds.width * 0.65 - size.width / 2))
      const destinationY = Math.max(18, Math.min(window.innerHeight - size.height - 16, bounds.bottom - size.height + 12))
      const direction = destinationX < startX ? 'left' : 'right'
      setJourney(previous => previous && { ...previous, direction })
      if (speakReplies && !reduced.matches) speak(`${copy.leading} ${copy[action]}.`)
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      if (version !== journeyVersion.current) return
      const element = traveller.current
      if (!reduced.matches && element?.animate) {
        const distance = Math.hypot(destinationX - startX, destinationY - startY)
        const duration = mode === 'walk' ? Math.min(2600, Math.max(1000, distance * 2.6)) : mode === 'run' ? Math.min(1600, Math.max(700, distance * 1.4)) : Math.min(1700, Math.max(1000, distance * 1.6))
        const points = [0, 0.25, 0.5, 0.75, 1].map(progress => {
          const x = startX + (destinationX - startX) * progress
          const arc = mode === 'jump' ? Math.sin(progress * Math.PI) * 110 : 0
          const y = Math.max(12, startY + (destinationY - startY) * progress - arc)
          return { offset: progress, transform: `translate(${x}px, ${y}px)` }
        })
        flight = element.animate(points, { duration, easing: mode === 'jump' ? 'ease-in-out' : 'linear', fill: 'forwards' })
        activeAnimation.current = flight
        await flight.finished
        if (version !== journeyVersion.current) return
        setJourney(previous => previous && { ...previous, phase: 'arrived' })
        activeAnimation.current = element.animate([{ opacity: 1 }, { opacity: 1 }], { duration: reduced.matches ? 1 : 500 })
        await activeAnimation.current.finished
      }
      if (version !== journeyVersion.current) return
      target.focus({ preventScroll: true })
      completed = true
      journeyBusy.current = false
      setJourney(null)
      onAction(action)
    } catch (error) {
      if (version === journeyVersion.current && (error as Error).name !== 'AbortError') {
        setNotice((error as Error).message)
        setOpen(true)
      }
    } finally {
      flight?.cancel()
      reduced.removeEventListener('change', finishForReducedMotion)
      if (target?.getAttribute('data-guide-active') === String(version)) {
        const destination = target
        if (completed) window.setTimeout(() => { if (destination.getAttribute('data-guide-active') === String(version)) destination.removeAttribute('data-guide-active') }, 1800)
        else target.removeAttribute('data-guide-active')
      }
      if (version === journeyVersion.current) {
        activeAnimation.current = null
        journeyAbort.current = null
        journeyBusy.current = false
        setJourney(null)
        stopSpeech()
      }
    }
  }

  const latestReply = [...turns].reverse().find(turn => turn.role === 'assistant')
  const expression: GuideExpression = speaking ? 'speaking' : listening ? 'listening' : busy ? 'thinking' : notice ? 'concerned' : 'smiling'
  if (hidden) return null
  return <div className={`voice-assistant ${open ? 'is-open' : ''}`}>
    {open && <section className="voice-panel" role="dialog" aria-label="Samanvay voice assistant" aria-labelledby="samanvay-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
      <header className="voice-header"><SamanvayCharacter expression={expression} portrait /><div><h2 id="samanvay-title">Samanvay <span>by SamanvAI</span></h2><p>Citizen services companion</p></div><button type="button" className="voice-icon" title="Close assistant" aria-label="Close assistant" onClick={close}><X size={18} /></button></header>
      <div className="voice-toolbar"><label><Languages size={15} /><span className="sr-only">Assistant language</span><select aria-label="Assistant language" value={language} onChange={event => chooseLanguage(event.target.value as AssistantLanguage)} disabled={busy || memoryBusy}>{assistantLanguages.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select><ChevronDown size={12} /></label><label className="guide-movement"><Footprints size={14} /><span className="sr-only">Guide movement</span><select aria-label="Guide movement" value={movement} disabled={memoryBusy} onChange={event => { const value = event.target.value as GuideTravelMode; setMovement(value); if (memory?.enabled) void saveMemory(undefined, { movement: value }) }}><option value="walk">Walk</option><option value="run">Run</option><option value="jump">Jump</option></select><ChevronDown size={12} /></label><div className="voice-output-controls"><button type="button" className="voice-icon" aria-label="Assistant audio settings" title="Audio & voices" aria-expanded={audioSettings} onClick={() => { stopSpeech(); setAudioSettings(value => !value) }}><Settings2 size={16} /></button><button type="button" className="voice-icon" aria-label="Assistant memory settings" title="Memory & personalization" aria-expanded={memoryOpen} onClick={() => { stopRecognition(); stopSpeech(); setMemoryOpen(value => !value) }}><BrainCircuit size={16} /></button><button type="button" className="voice-icon" role="switch" aria-label="Speak assistant replies" aria-checked={speakReplies} title={speakReplies ? 'Mute spoken replies' : 'Speak replies'} onClick={() => { setSpeakReplies(value => !value); stopSpeech() }} disabled={!audioAvailable}>{speakReplies ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>{speaking && <button type="button" className="voice-icon" aria-label="Stop speaking" title="Stop speaking" onClick={stopSpeech}><Square size={14} /></button>}</div></div>
      {audioSettings && <div className="voice-audio-settings"><label>Audio source<select aria-label="Assistant audio source" value={audioProvider} onChange={event => { stopSpeech(); setAudioProvider(event.target.value as 'auto' | 'device' | 'cloud') }}><option value="auto">Automatic fallback</option><option value="device">Device voice</option><option value="cloud" disabled={!speech?.configured}>Google Cloud {speech?.configured ? '' : '(not configured)'}</option></select></label><label>Device voice<select aria-label="Assistant device voice" value={voiceName} onChange={event => { stopSpeech(); setVoiceName(event.target.value) }} disabled={!languageVoices.length}><option value="">Best available match</option>{languageVoices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name}</option>)}</select></label><div><span>{languageVoices.length} matching {language === 'kn-IN' ? 'Kannada' : language === 'hi-IN' ? 'Hindi' : 'English'} device voices · Google fallback {speech?.configured ? 'configured' : 'off'}</span><button type="button" className="voice-icon" title="Refresh available voices" aria-label="Refresh available voices" onClick={() => { if (voiceOutput) setVoices(window.speechSynthesis.getVoices()) }}><RefreshCw size={13} /></button></div></div>}
      {memoryOpen ? <section className="assistant-memory" aria-label="Assistant memory settings"><div className="assistant-memory-heading"><BrainCircuit size={20} /><h3>Memory &amp; preferences</h3></div><p>Keep approved preferences and your current service context for your next visit. No raw conversation or audio is saved.</p>{memory?.shared_demo && <p className="assistant-memory-warning">Shared demo account: saved memory is shared with other demo visitors. Use synthetic preferences only.</p>}<label className="assistant-memory-consent"><span>Remember my preferences</span><input type="checkbox" role="switch" aria-label="Remember assistant preferences" checked={memory?.enabled || false} disabled={!memory || memoryBusy} onChange={event => void saveMemory(event.target.checked, event.target.checked ? { language, movement } : {})} /></label><label>Preferred district<select aria-label="Preferred assistant district" disabled={!memory?.enabled || memoryBusy} value={memory?.preferences.district || ''} onChange={event => void saveMemory(undefined, { district: event.target.value || null })}><option value="">No preference</option>{districts.map(district => <option key={district}>{district}</option>)}</select></label><label>Answer detail<select aria-label="Assistant answer detail" disabled={!memory?.enabled || memoryBusy} value={memory?.preferences.detail || 'brief'} onChange={event => void saveMemory(undefined, { detail: event.target.value as 'brief' | 'detailed' })}><option value="brief">Brief</option><option value="detailed">Detailed</option></select></label><dl><dt>Service context</dt><dd>{memory?.context.last_service || 'Nothing saved'}</dd><dt>Application context</dt><dd>{memory?.context.last_case_id || 'Nothing saved'}</dd><dt>Personal retrieval feedback</dt><dd>{memory?.feedback_sources || 0} sources</dd></dl><p>Expires after 30 days of inactivity when next accessed. Feedback tunes retrieval for this account only; it does not retrain Gemini or change policies.</p><button type="button" className="assistant-forget" disabled={!memory || memoryBusy} onClick={() => void forgetMemory()}><Trash2 size={15} />Forget saved memory</button><button type="button" className="assistant-memory-back" onClick={() => setMemoryOpen(false)}>Back to conversation</button>{notice && <p className="voice-notice" role="status">{notice}</p>}</section> : <div className="voice-conversation" ref={conversation} role="log" aria-label="Assistant conversation" aria-live="polite">
        <div className="voice-reply" lang={language}><span className="voice-speaker">Samanvay</span><p>{copy.greeting}</p></div>
        {turns.length === 0 && <div className="voice-starters"><button type="button" onClick={() => void sendMessage(copy.prompt)} disabled={busy}>{copy.services}<ArrowUpRight size={14} /></button><button type="button" onClick={() => void guide('track')}>{copy.track}<ArrowUpRight size={14} /></button><button type="button" onClick={() => void guide('grievance')}>{copy.grievance}<ArrowUpRight size={14} /></button></div>}
        {turns.map((turn, index) => <div key={index} className={turn.role === 'user' ? 'voice-question' : 'voice-reply'} lang={turn.language}>{turn.role === 'assistant' && <span className="voice-speaker">Samanvay <small>{turn.result?.engine}</small></span>}<p>{turn.text}</p>{turn.result && <>{turn.result.context?.service && <div className="assistant-context"><BrainCircuit size={11} />{turn.result.context.service}{turn.result.context.used.length > 0 && <span> · context retained</span>}</div>}<div className="voice-actions">{turn.result.actions.map(action => <button key={action} type="button" onClick={() => void guide(action, movement, turn.result?.context?.service || undefined)}>{assistantLanguages.find(item => item.code === turn.language)![action]}<ArrowUpRight size={12} /></button>)}</div><details className="voice-sources"><summary><Check size={11} /> Sources &amp; limitations</summary><p>{turn.result.notice}</p>{turn.result.retrieval && <span>{turn.result.retrieval.method}</span>}{turn.result.citations?.map(citation => <article className="assistant-citation" key={citation.id}><strong>{citation.id} · {citation.title}</strong><small>{citation.version} · {citation.kind}</small><p>{citation.excerpt}</p></article>)}{!turn.result.citations?.length && turn.result.sources.map(source => <span key={source}>{source}</span>)}</details>{Boolean(turn.result.request_id && turn.result.citations?.length) && <div className="assistant-feedback"><span>Helpful?</span>{[true, false].map(helpful => <button type="button" key={String(helpful)} className="voice-icon" aria-label={helpful ? 'Helpful assistant answer' : 'Unhelpful assistant answer'} aria-pressed={feedback[turn.result!.request_id!] === helpful} disabled={!memory?.enabled} title={memory?.enabled ? helpful ? 'Helpful' : 'Not helpful' : 'Enable memory to save personal feedback'} onClick={() => void rateReply(turn.result!, helpful)}>{helpful ? <ThumbsUp size={13} /> : <ThumbsDown size={13} />}</button>)}</div>}</>}</div>)}
        {busy && <div className="voice-thinking"><LoaderCircle size={15} className="spin" /> Checking service guidance...</div>}
      </div>}
      {!memoryOpen && <div className="voice-compose">{notice && <p className="voice-notice" role="status">{notice}</p>}<div className="voice-status"><span className={listening ? 'voice-listening' : speaking ? 'voice-speaking' : ''}>{listening ? 'Listening...' : speaking ? 'Speaking...' : busy ? 'Thinking...' : voiceInput ? 'Ready to listen' : 'Text mode · voice input unavailable'}</span>{latestReply && !speaking && <button type="button" className="voice-icon" aria-label="Read latest reply" title="Read latest reply" onClick={() => speak(latestReply.text, latestReply.language)} disabled={!audioAvailable || busy || listening}><Volume2 size={14} /></button>}</div><form onSubmit={event => { event.preventDefault(); void sendMessage(input) }}><button type="button" className={`voice-mic ${listening ? 'listening' : ''}`} aria-label={listening ? 'Stop listening' : 'Start listening'} title={voiceInput ? listening ? 'Stop listening' : 'Start listening' : 'Voice input is unavailable in this browser'} onClick={listen} disabled={busy || !voiceInput}>{listening ? <MicOff size={19} /> : <Mic size={19} />}</button><input ref={inputRef} aria-label="Message Samanvay" value={input} onChange={event => setInput(event.target.value)} maxLength={2000} placeholder={copy.placeholder} disabled={busy} /><button type="submit" className="voice-send" aria-label="Send assistant message" title="Send message" disabled={busy || !input.trim()}><Send size={17} /></button></form><p className="voice-privacy"><ShieldCheck size={11} /> Demo guidance, not official advice. Speech may use your device/browser or Google Cloud when configured. No audio is stored by this app.</p></div>}
    </section>}
    {!journey && <button ref={launcher} type="button" className="voice-launcher" aria-label={open ? 'Close Samanvay voice assistant' : 'Open Samanvay voice assistant'} aria-expanded={open} aria-haspopup="dialog" title={open ? 'Close assistant' : 'Ask Samanvay'} onClick={() => { if (open) close(); else setOpen(true) }}><SamanvayCharacter expression={expression} /><span>{open ? <X size={14} /> : <Mic size={13} />}Samanvay</span></button>}
    {journey && <><div ref={traveller} className="guide-traveller" data-motion={journey.phase === 'arrived' ? 'point' : journey.motion} data-direction={journey.direction} style={{ transform: `translate(${journey.x}px, ${journey.y}px)` }} aria-hidden="true"><SamanvayCharacter motion={journey.phase === 'arrived' ? 'point' : journey.motion} expression={speaking ? 'speaking' : 'smiling'} /></div><div className="guide-travel-status" role="status"><Footprints size={17} /><span><strong>Samanvay</strong>{journey.phase === 'arrived' ? copy.arrived : copy.leading} · {journey.label}</span><button type="button" className="voice-icon" title="Cancel guide movement" aria-label="Cancel guide movement" onClick={cancelJourney}><X size={16} /></button></div></>}
  </div>
}