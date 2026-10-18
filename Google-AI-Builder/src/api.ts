import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, type Auth } from 'firebase/auth'

const environment = import.meta.env
const base = environment.VITE_API_BASE_URL || ''
export type DemoProfile = 'chief_secretary' | 'deputy_commissioner' | 'tahsildar' | 'department_officer' | 'citizen'
export function demoProfile(): DemoProfile {
  try { const value = localStorage.getItem('samanvai-demo-profile'); return ['chief_secretary', 'deputy_commissioner', 'tahsildar', 'department_officer', 'citizen'].includes(value || '') ? value as DemoProfile : 'chief_secretary' } catch { return 'chief_secretary' }
}
export function setDemoProfile(value: DemoProfile) { try { localStorage.setItem('samanvai-demo-profile', value) } catch {} }
let auth: Auth | undefined
if (environment.VITE_FIREBASE_API_KEY) {
  auth = getAuth(initializeApp({
    apiKey: environment.VITE_FIREBASE_API_KEY,
    authDomain: environment.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: environment.VITE_FIREBASE_PROJECT_ID,
  }))
}

export async function login() {
  if (auth) await signInWithPopup(auth, new GoogleAuthProvider())
}

export async function logout() {
  if (auth) await signOut(auth)
}

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  if (auth) await auth.authStateReady()
  const token = await auth?.currentUser?.getIdToken()
  const response = await fetch(`${base}/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-Demo-Profile': demoProfile(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    throw new Error(typeof detail.detail === 'string' ? detail.detail : `Request failed (${response.status}). Please check your inputs.`)
  }
  return response.json() as Promise<T>
}

export async function speechAudio(text: string, language: string, signal: AbortSignal): Promise<Blob> {
  if (auth) await auth.authStateReady()
  const token = await auth?.currentUser?.getIdToken()
  const response = await fetch(`${base}/api/speech/synthesize`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Demo-Profile': demoProfile(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ text, language }), signal })
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.detail || `Speech unavailable (${response.status})`) }
  return response.blob()
}

export interface OfficialScope { role: DemoProfile; designation: string; level: 'state' | 'district' | 'taluk' | 'department'; district: string | null; taluk: string | null; department: string | null }
export interface WorkspaceUser { uid: string; name: string; government: boolean; official_scope: OfficialScope | null; designation: string; demo: boolean }
export interface ReviewRow { name: string; total: number; resolved: number; pending: number; overdue: number; compliance: number | null }
export interface ReviewReport { schema: string; title: string; scope: OfficialScope; summary: Record<string, number | null>; departments: ReviewRow[]; territories: ReviewRow[]; updated_at: string; data_notice: string; definitions: Record<string, string> }
export interface SpeechCapabilities { configured: boolean; provider: string; languages: string[]; notice: string }

export interface Case {
  id: string; citizen: string; citizen_id: string; service: string; district: string; department: string;
  submitted: string; sla: number; status: string; officer: string; stage: string; escalated: boolean;
  age: number; delay: number; breached: boolean; documents: string[];
  taluk: string; geography_source?: string;
}
export interface Overview {
  total: number; resolved: number; pending: number; overdue: number; escalations: number;
  compliance: number | null; satisfaction: number | null; feedback_count: number; updated_at: string;
  trend: { date: string; requests: number; resolved: number }[];
  services: { service: string; total: number; compliance: number | null; delayed: number }[];
  districts: { name: string; total: number; delayed: number; complaints: number }[];
  delayed_cases: Case[];
  scope: OfficialScope; department_summary: ReviewRow[]; territories: ReviewRow[];
  territory_departments: { territory: string; department: string; total: number; active: number; resolved: number; overdue: number }[];
  territory_level: 'district' | 'taluk'; aging: { label: string; count: number }[]; average_delay: number; unassigned_taluk: number;
}
export interface Health { status: string; auth: string; data: string; gemini: boolean; storage: string; orchestration: string }
export interface AuditEvent { id: string; case_id: string; actor: string; created_at: string; district: string; message: string; notification: string }
export interface ChatResult {
  answer: string; engine: string; trace: { agent: string; detail: string; status: string }[];
  evidence: { policy?: { source: string }; escalations?: { created: boolean; message: string }[] };
}
export interface Eligibility { eligible: boolean; checks: { rule: string; passed: boolean }[]; documents: string[]; source: string; notice: string }
export interface Catalog { services: { name: string; department: string; sla: number }[]; districts: string[]; taluks?: Record<string, string[]>; departments?: string[] }
export type AssistantAction = 'services' | 'apply' | 'eligibility' | 'track' | 'grievance'
export type GuideTravelMode = 'walk' | 'run' | 'jump'
export interface AssistantNavigation { action: AssistantAction; motion: GuideTravelMode; service?: string; district?: string }
export interface AssistantCitation { id: string; title: string; version: string; kind: string; excerpt: string }
export interface AssistantPreferences { language?: string; movement?: GuideTravelMode; district?: string | null; detail?: 'brief' | 'detailed' }
export interface AssistantMemoryState { enabled: boolean; preferences: AssistantPreferences; context: { last_service?: string; last_action?: AssistantAction; last_case_id?: string }; feedback_sources: number; retention_days: number; shared_demo: boolean; updated_at: string | null }
export interface AssistantSessionContext { service?: string; case_id?: string; action?: AssistantAction }
export interface AssistantReply { answer: string; language: string; engine: string; actions: AssistantAction[]; sources: string[]; notice: string; navigation?: AssistantNavigation | null; citations?: AssistantCitation[]; context?: { service: string | null; case_id: string | null; action?: AssistantAction; used: string[]; clarification: boolean }; request_id?: string; retrieval?: { method: string; version: string }; personalized?: boolean }