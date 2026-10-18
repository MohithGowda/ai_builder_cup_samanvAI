import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity, ArrowRight, ArrowUpRight, AudioLines, Bell, BookOpen, Bot, Building2,
  Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardList,
  Clock3, Download, ExternalLink, FileCheck2, FileText, Fingerprint, HeartHandshake, LayoutDashboard,
  LoaderCircle, MapPin, Menu, MessageSquare, MoreHorizontal, Network, Plus, Search, Send, ShieldCheck,
  SlidersHorizontal, Sparkles, TriangleAlert, Users, Workflow, X, XCircle, Pause, Play, Sun, Moon,
} from 'lucide-react'
import { api, demoProfile, setDemoProfile, login, logout, type DemoProfile, type WorkspaceUser, type AssistantAction, type AuditEvent, type Case, type Catalog, type ChatResult, type Eligibility, type Health, type Overview } from './api'
import CivicBackground from './CivicBackground'
import VoiceAssistant from './VoiceAssistant'
import { applyTheme, currentTheme, type Theme } from './theme'
import GovernanceReview from './GovernanceReview'

type View = 'overview' | 'applications' | 'districts' | 'feedback' | 'agents' | 'citizen' | 'audit'
type Toast = { text: string; error?: boolean }
const navigation: { group: string; items: { view: View; label: string; icon: typeof Activity }[] }[] = [
  { group: 'GOVERNANCE', items: [
    { view: 'overview', label: 'Overview', icon: LayoutDashboard },
    { view: 'applications', label: 'Applications', icon: ClipboardList },
    { view: 'districts', label: 'District intelligence', icon: MapPin },
    { view: 'feedback', label: 'Citizen sentiment', icon: HeartHandshake },
  ] },
  { group: 'WORKSPACE', items: [
    { view: 'agents', label: 'Agent workspace', icon: Network },
    { view: 'citizen', label: 'Citizen services', icon: Users },
    { view: 'audit', label: 'Audit trail', icon: ShieldCheck },
  ] },
]
const agentNames = ['Citizen Service', 'Policy Reasoning', 'Case Resolution', 'Escalation', 'Sentiment & Grievance', 'Governance Intelligence']
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const percent = (value: number | null) => value === null ? 'N/A' : `${value}%`
const photo = '/karnataka.jpg'

function IconButton({ label, children, onClick, disabled }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</button>
}

function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}><span className="badge-dot" />{children}</span>
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className="empty"><CheckCircle2 size={28} /><h3>{title}</h3><p>{detail}</p></div>
}

function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => { dialog?.close() }
  }, [])
  return <dialog ref={ref} className="modal" onCancel={close} onClick={event => { if (event.target === event.currentTarget) close() }}><div className="modal-head"><h2>{title}</h2><IconButton label="Close dialog" onClick={close}><X size={20} /></IconButton></div>{children}</dialog>
}

function Chat({ role, district, taluk = '', department = '', onChange, notify }: { role: 'citizen' | 'government'; district: string; taluk?: string; department?: string; onChange: () => void; notify: (toast: Toast) => void }) {
  const [input, setInput] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<{ question: string; result: ChatResult }[]>([])
  const lastResult = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    setMessages([])
    const query = `?role=${role}${district ? `&district=${encodeURIComponent(district)}` : ''}${taluk ? `&taluk=${encodeURIComponent(taluk)}` : ''}${department ? `&department=${encodeURIComponent(department)}` : ''}`
    void api<{ question: string; result: ChatResult }[]>(`/chat/history${query}`, undefined, controller.signal)
      .then(setMessages)
      .catch(reason => { if (reason.name !== 'AbortError') notify({ text: reason.message, error: true }) })
    return () => controller.abort()
  }, [role, district, taluk, department, notify])
  async function submit(question: string) {
    if (!question.trim() || busy) return
    setBusy(true)
    setInput('')
    try {
      const result = await api<ChatResult>('/chat', { message: question, role, district: district || null, taluk: taluk || null, department: department || null, allow_escalation: consent })
      setMessages(previous => [...previous, { question, result }])
      onChange()
      requestAnimationFrame(() => lastResult.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
    } catch (error) { notify({ text: (error as Error).message, error: true }) }
    finally { setBusy(false) }
  }
  return <div className="chat-workspace">
    <div className="chat-intro"><span className="agent-avatar"><Sparkles size={24} /></span><div><h2>{role === 'government' ? 'Intelligence, with a clear trail.' : 'Your public services, connected.'}</h2><p>{role === 'government' ? 'Governance Intelligence Agent' : 'Citizen Service Agent'} <span className="inline-dot" /> Six-agent workflow</p></div></div>
    {messages.length === 0 && <div className="suggestion-list">{(role === 'government' ? ['Why are pension requests delayed?', 'Which district needs the most attention?', 'Which services have the lowest SLA compliance?'] : ['My pension application has been pending for 45 days.', 'Track SAM-2026-1042', 'What documents are required for pension?']).map(question => <button className="suggestion" key={question} onClick={() => void submit(question)} disabled={busy}>{question}<ArrowUpRight size={16} /></button>)}</div>}
    <div className="chat-history" aria-live="polite">{messages.map(({ question, result }, index) => <div className="exchange" key={index} ref={index === messages.length - 1 ? lastResult : undefined}>
      <p className="user-message">{question}</p><div className="assistant-message"><div className="assistant-label"><Sparkles size={15} /> SamanvAI <span>{result.engine}</span></div><p>{result.answer}</p>
        <details className="execution"><summary><Workflow size={14} /> {result.trace.length} agents completed <ChevronDown size={14} /></summary><ol>{result.trace.map(item => <li key={item.agent}><CheckCircle2 size={15} /><div><strong>{item.agent}</strong><span>{item.detail}</span></div></li>)}</ol></details>
        {result.evidence.policy && <span className="source"><BookOpen size={12} /> {result.evidence.policy.source} · Illustrative policy</span>}
      </div></div>)}{busy && <div className="thinking"><LoaderCircle size={16} className="spin" /> Agents are checking the evidence…</div>}</div>
    <form className="chat-form" onSubmit={event => { event.preventDefault(); void submit(input) }}>
      <div className="chat-input"><input aria-label="Message SamanvAI" value={input} onChange={event => setInput(event.target.value)} maxLength={2000} placeholder={role === 'government' ? 'Ask about your governance data…' : 'Ask about an application or service…'} disabled={busy} /><button type="submit" className="send-button" aria-label="Send message" title="Send message" disabled={busy || !input.trim()}>{busy ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={19} />}</button></div>
      <label className="consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> Allow supervisor escalation of matched overdue cases</label>
      <p className="fine-print"><ShieldCheck size={12} /> Synthetic demo data. Verify AI explanations before making decisions.</p>
    </form>
  </div>
}

function CaseTable({ cases, select, limit }: { cases: Case[]; select: (item: Case) => void; limit?: number }) {
  if (!cases.length) return <Empty title="No applications here" detail="Try another filter or create a new application." />
  return <div className="table-scroll"><table><thead><tr><th>Application / Service</th><th>District</th><th>Assigned officer</th><th>Status</th><th>Delay</th><th aria-label="Open application" /></tr></thead><tbody>{cases.slice(0, limit).map(item => <tr key={item.id} onClick={() => select(item)}><td><button className="case-link" onClick={event => { event.stopPropagation(); select(item) }}>{item.id}</button><span className="table-secondary">{item.service}</span></td><td>{item.district}</td><td><span className="officer"><span className="mini-avatar">{item.officer.split(' ').map(part => part[0]).slice(0, 2).join('')}</span>{item.officer}</span></td><td><Badge tone={item.status === 'Resolved' ? 'green' : item.escalated ? 'red' : 'amber'}>{item.status}</Badge></td><td><span className={item.delay ? 'delay' : 'muted'}>{item.delay ? `${item.delay} days` : 'On time'}</span></td><td><ArrowUpRight size={15} className="muted" /></td></tr>)}</tbody></table></div>
}

function waitForGuideTarget(selector: string, signal?: AbortSignal): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    let finished = false
    function finish(target: HTMLElement | null, error?: Error) {
      if (finished) return
      finished = true
      observer.disconnect()
      window.clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
      if (target) resolve(target)
      else reject(error || new Error('The service could not be loaded. Please retry.'))
    }
    function abort() { finish(null, new DOMException('Guide movement cancelled', 'AbortError')) }
    function check() {
      const target = document.querySelector<HTMLElement>(selector)
      if (target && target.getClientRects().length) finish(target)
      else if (document.querySelector('.error-banner')) finish(null, new Error('The workspace could not load. Please retry before navigating.'))
    }
    const observer = new MutationObserver(check)
    const timeout = window.setTimeout(() => finish(null), 8000)
    observer.observe(document.getElementById('root')!, { childList: true, subtree: true })
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    else check()
  })
}

export default function App() {
  const [view, setView] = useState<View>(() => demoProfile() === 'citizen' ? 'citizen' : 'overview')
  const [profile, setProfile] = useState<DemoProfile>(demoProfile)
  const [backgroundPaused, setBackgroundPaused] = useState(false)
  const [theme, setTheme] = useState<Theme>(currentTheme)
  useEffect(() => { applyTheme(theme) }, [theme])
  const [district, setDistrict] = useState('')
  const [taluk, setTaluk] = useState('')
  const [department, setDepartment] = useState('')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [cases, setCases] = useState<Case[]>([])
  const [citizenCases, setCitizenCases] = useState<Case[]>([])
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [health, setHealth] = useState<Health | null>(null)
  const [catalog, setCatalog] = useState<Catalog>({ services: [], districts: [] })
  const [user, setUser] = useState<WorkspaceUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [toast, setToast] = useState<Toast | null>(null)
  const [mobileNav, setMobileNav] = useState(false)
  const [selected, setSelected] = useState<Case | null>(null)
  const [modal, setModal] = useState<'application' | 'eligibility' | 'grievance' | 'infrastructure' | 'help' | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All statuses')
  const [page, setPage] = useState(1)
  const [eligibility, setEligibility] = useState<Eligibility | null>(null)
  const [newService, setNewService] = useState('Pension assistance')
  const [newDistrict, setNewDistrict] = useState('Bengaluru South')
  const [newTaluk, setNewTaluk] = useState('')
  const [feedbackText, setFeedbackText] = useState('')
  const [age, setAge] = useState(65)
  const [income, setIncome] = useState(24000)
  const [region, setRegion] = useState('Karnataka')

  const reload = () => setRefresh(value => value + 1)
  useEffect(() => {
    const controller = new AbortController()
    let current = true
    async function load() {
      setError('')
      try {
        const [healthResult, me, services] = await Promise.all([api<Health>('/health', undefined, controller.signal), api<WorkspaceUser>('/me', undefined, controller.signal), api<Catalog>('/services', undefined, controller.signal)])
        if (!current) return
        setHealth(healthResult); setUser(me); setCatalog(services)
        const query = `${district ? `&district=${encodeURIComponent(district)}` : ''}${taluk ? `&taluk=${encodeURIComponent(taluk)}` : ''}${department ? `&department=${encodeURIComponent(department)}` : ''}`
        const [citizenRows, auditRows] = await Promise.all([api<Case[]>('/cases?scope=citizen', undefined, controller.signal), api<AuditEvent[]>(`/audit?scope=${me.government ? 'government' : 'citizen'}${query}`, undefined, controller.signal)])
        if (!current) return
        setCitizenCases(citizenRows); setAudit(auditRows)
        if (me.government) {
          const [overviewResult, caseRows] = await Promise.all([api<Overview>(`/overview${query ? `?${query.slice(1)}` : ''}`, undefined, controller.signal), api<Case[]>(`/cases?scope=government${query}`, undefined, controller.signal)])
          if (current) { setOverview(overviewResult); setCases(caseRows) }
        } else {
          setOverview(null); setCases(citizenRows)
          setView(previous => ['citizen', 'audit', 'agents'].includes(previous) ? previous : 'citizen')
        }
      } catch (reason) { if (current && (reason as Error).name !== 'AbortError') setError((reason as Error).message) }
      finally { if (current) setLoading(false) }
    }
    void load()
    return () => { current = false; controller.abort() }
  }, [district, taluk, department, profile, refresh])

  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(null), 6000); return () => clearTimeout(timer) } }, [toast])
  useEffect(() => {
    const interval = setInterval(() => setRefresh(value => value + 1), 15000)
    return () => clearInterval(interval)
  }, [])
  useEffect(() => { setPage(1) }, [search, status, district, taluk, department])

  useEffect(() => {
    if (!(catalog.taluks?.[newDistrict] || []).includes(newTaluk)) setNewTaluk('')
  }, [newDistrict, newTaluk, catalog.taluks])
  useEffect(() => {
    setNewDistrict(value => catalog.districts.length && !catalog.districts.includes(value) ? catalog.districts[0] : value)
  }, [catalog.districts])

  function changeProfile(value: DemoProfile) {
    setDemoProfile(value); setProfile(value); setDistrict(''); setTaluk(''); setDepartment(''); setOverview(null); setCases([]); setAudit([]); setUser(null); setSelected(null); setModal(null); setMobileNav(false); setLoading(true); setView(value === 'citizen' ? 'citizen' : 'overview')
  }

  function navigate(next: View) { setView(next); setMobileNav(false); setSearch(''); setStatus('All statuses'); setPage(1) }
  async function prepareAssistantAction(action: AssistantAction, service?: string, districtPreference?: string, signal?: AbortSignal): Promise<HTMLElement | null> {
    navigate('citizen')
    setEligibility(null)
    if (service && catalog.services.some(item => item.name === service)) setNewService(service)
    if (districtPreference && catalog.districts.includes(districtPreference)) setNewDistrict(districtPreference)
    const target = await waitForGuideTarget(action === 'track' ? '.citizen-applications' : action === 'services' ? '.citizen-actions' : `[data-guide-target="${action}"]`, signal)
    if (signal?.aborted) throw new DOMException('Guide movement cancelled', 'AbortError')
    if (target && !target.matches('button, a, input, select, textarea, [tabindex]')) target.setAttribute('tabindex', '-1')
    target?.scrollIntoView({ behavior: 'auto', block: 'center' })
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    return target
  }
  function assistantAction(action: AssistantAction) {
    if (action === 'apply') setModal('application')
    if (action === 'eligibility') setModal('eligibility')
    if (action === 'grievance') setModal('grievance')
  }
  async function escalate(item: Case) {
    setBusy(true)
    try {
      const result = await api<{ created: boolean; message: string }>('/escalations', { case_id: item.id })
      setToast({ text: result.message })
      setSelected(null); reload()
    } catch (reason) { setToast({ text: (reason as Error).message, error: true }) }
    finally { setBusy(false) }
  }
  function exportReport() {
    const rows = [['Application', 'Service', 'District', 'Status', 'Delay days', 'Officer'], ...cases.map(item => [item.id, item.service, item.district, item.status, String(item.delay), item.officer])]
    const csv = rows.map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `samanvai-${district || 'all-districts'}-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url)
    setToast({ text: `Exported ${cases.length} applications.` })
  }
  async function submitForm(event: FormEvent) {
    event.preventDefault(); setBusy(true)
    try {
      if (modal === 'application') {
        const result = await api<Case>('/applications', { service: newService, district: newDistrict, taluk: newTaluk || null })
        setToast({ text: `Application ${result.id} created. Document review is pending.` }); setModal(null); reload()
      } else if (modal === 'eligibility') {
        setEligibility(await api<Eligibility>('/eligibility', { age, annual_income: income, region }))
      } else if (modal === 'grievance') {
        const result = await api<{ id: string }>('/grievances', { service: newService, district: newDistrict, taluk: newTaluk || null, message: feedbackText })
        setToast({ text: `Grievance ${result.id} recorded. Thank you for your feedback.` }); setFeedbackText(''); setModal(null); reload()
      }
    } catch (reason) { setToast({ text: (reason as Error).message, error: true }) }
    finally { setBusy(false) }
  }

  const filteredCases = cases.filter(item => (status === 'All statuses' || (status === 'Overdue' ? item.breached && item.status !== 'Resolved' : item.status === status)) && `${item.id} ${item.service} ${item.citizen} ${item.district} ${item.officer}`.toLowerCase().includes(search.toLowerCase()))
  const pageCount = Math.max(1, Math.ceil(filteredCases.length / 10))
  const title = navigation.flatMap(group => group.items).find(item => item.view === view)?.label || 'Overview'
  const activeDistricts = overview?.districts.filter(item => item.total > 0) || []
  const reviewQuery = new URLSearchParams({ ...(district ? { district } : {}), ...(taluk ? { taluk } : {}), ...(department ? { department } : {}) }).toString()
  const assignedScope = user?.official_scope

  return <div className="app-shell">
    <CivicBackground paused={backgroundPaused} citizen={view === 'citizen'} />
    {user && <VoiceAssistant hidden={Boolean(modal || selected || mobileNav)} districts={catalog.districts} onPrepareAction={prepareAssistantAction} onAction={assistantAction} />}
    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <button className="brand" onClick={() => navigate(user?.government === false ? 'citizen' : 'overview')} aria-label="SamanvAI home"><span className="brand-mark"><AudioLines size={25} strokeWidth={2.4} /></span><span>Samanv<span className="brand-ai">AI</span><small>GOVERNANCE, IN SYNC.</small></span></button>
      <div className="workspace-label"><span className="workspace-icon"><Building2 size={17} /></span><div>Karnataka pilot<small>{user?.government ? user.designation : 'Citizen workspace'}</small></div><span className="tiny-tag">DEMO</span></div>
      {user?.demo && <><label className="demo-profile-label" htmlFor="demo-profile">SYNTHETIC ROLE PREVIEW</label><select id="demo-profile" aria-label="Demo workspace role" className="demo-profile-select" value={profile} onChange={event => changeProfile(event.target.value as DemoProfile)}><option value="chief_secretary">Chief Secretary · State</option><option value="deputy_commissioner">DC · Mysuru district</option><option value="tahsildar">Tahsildar · Hunsur / Revenue</option><option value="department_officer">Department Officer · Transport</option><option value="citizen">Citizen · My applications</option></select></>}
      <nav aria-label="Main navigation">{navigation.map(group => <div className="nav-group" key={group.group}><p className="nav-label">{group.group}</p>{group.items.filter(item => user?.government !== false || ['citizen', 'audit', 'agents'].includes(item.view)).map(item => <button key={item.view} onClick={() => navigate(item.view)} className={`nav-item ${view === item.view ? 'active' : ''}`} aria-current={view === item.view ? 'page' : undefined}><item.icon size={18} /><span>{item.label}</span>{item.view === 'agents' && <span className="nav-count">6</span>}{item.view === 'applications' && !!overview?.overdue && <span className="nav-count alert-count">{overview.overdue}</span>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="pilot-photo"><img src={photo} alt="Bengaluru city, Karnataka" /><span><span className="photo-dot" /> Built for public good.</span></div><button className="system-state" onClick={() => setModal('infrastructure')}><span className={`status-light ${error ? 'offline' : ''}`} /><span>{error ? 'Connection needs attention' : 'Workspace connected'}</span><ArrowUpRight size={14} /></button><button className="profile" onClick={() => setModal('help')}><span className="profile-avatar">{user?.name?.split(' ').map(part => part[0]).slice(0, 2).join('') || 'AR'}</span><span>{user?.name || 'Demo workspace'}<small>{user?.designation || 'Workspace'}</small></span><MoreHorizontal size={18} /></button></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumbs"><span className="mobile-menu"><IconButton label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20} /></IconButton></span><Building2 size={15} /><span>Workspace</span><ChevronRight size={13} /><strong>{title}</strong></div><div className="topbar-actions"><span className="demo-label"><span /> Synthetic data</span><span className="theme-control"><button type="button" className="icon-button" role="switch" aria-checked={theme === 'dark'} aria-label="Dark theme" title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button></span><span className="background-motion-control"><button type="button" className="icon-button" aria-pressed={backgroundPaused} aria-label={backgroundPaused ? 'Resume background motion' : 'Pause background motion'} title={backgroundPaused ? 'Resume background motion' : 'Pause background motion'} onClick={() => setBackgroundPaused(value => !value)}>{backgroundPaused ? <Play size={16} /> : <Pause size={16} />}</button></span><IconButton label="View escalation notifications" onClick={() => navigate('audit')}><Bell size={18} />{!!audit.length && <span className="notification-dot" />}</IconButton><span className="topbar-divider" /><IconButton label="Workspace information" onClick={() => setModal('help')}><CircleHelp size={18} /></IconButton><span className="top-avatar">{user?.name?.charAt(0) || 'A'}</span></div></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow"><span className="inline-dot" /> SAMANVAI INTELLIGENCE</div><h1>{view === 'overview' ? 'Governance overview' : title}</h1><p>{({ overview: 'A connected view of public service. Every request, every district.', applications: 'Track requests, review bottlenecks, and move cases forward.', districts: 'Local signals. Statewide perspective.', feedback: 'Listen closely. Make public service better.', agents: 'Specialist agents. Shared evidence. Accountable actions.', citizen: 'A simpler connection to the services that matter.', audit: 'Every escalation, recorded and traceable.' })[view]}</p></div><div className="heading-actions">{user?.government && view !== 'citizen' && <button className="button secondary" onClick={exportReport}><Download size={15} />Export report</button>}<button className="button primary" onClick={() => navigate(view === 'citizen' ? 'agents' : 'citizen')}>{view === 'citizen' ? <Network size={16} /> : <Plus size={16} />}{view === 'citizen' ? 'Agent workspace' : 'Citizen workspace'}</button></div></div>
        {error && <div className="error-banner" role="alert"><TriangleAlert size={19} /><div><strong>Could not load the workspace</strong><p>{error}</p></div><button className="button secondary" onClick={reload}>Retry</button>{error.toLowerCase().includes('sign in') && <button className="button primary" onClick={() => void login().then(reload).catch(reason => setToast({ text: reason.message, error: true }))}>Sign in with Google</button>}</div>}
        {loading && <div className="loading"><LoaderCircle className="spin" size={24} /><span>Connecting your workspace…</span></div>}
        {!loading && !error && <>
          {user?.government && view !== 'citizen' && <div className="official-context-controls"><label>District<select aria-label="Filter by district" value={assignedScope?.district || district} disabled={!!assignedScope?.district} onChange={event => { setDistrict(event.target.value); setTaluk('') }}><option value="">All districts</option>{catalog.districts.map(name => <option key={name}>{name}</option>)}</select></label><label>Taluk<select aria-label="Filter by taluk" value={assignedScope?.taluk || taluk} disabled={!!assignedScope?.taluk || !(assignedScope?.district || district)} onChange={event => setTaluk(event.target.value)}><option value="">All taluks</option>{(catalog.taluks?.[assignedScope?.district || district] || []).map(name => <option key={name}>{name}</option>)}</select></label><label>Department<select aria-label="Filter by department" value={assignedScope?.department || department} disabled={!!assignedScope?.department} onChange={event => setDepartment(event.target.value)}><option value="">All departments</option>{catalog.departments?.map(name => <option key={name}>{name}</option>)}</select></label><span className="scope-label"><ShieldCheck size={13} />{user.designation} · {assignedScope?.taluk || assignedScope?.district || 'State jurisdiction'}</span></div>}
          {view === 'overview' && overview && user && <GovernanceReview data={overview} user={user} department={department || assignedScope?.department || ''} query={reviewQuery ? `?${reviewQuery}` : ''} select={setSelected} inspect={() => { navigate('applications'); setStatus('Overdue') }} drilldown={name => { if (overview.territory_level === 'district') { setDistrict(name); setTaluk('') } else setTaluk(name) }} />}
          {view === 'applications' && <section className="applications-view"><div className="application-toolbar"><div className="search-box"><Search size={16} /><input aria-label="Search applications" placeholder="Search ID, citizen, service, officer…" value={search} onChange={event => setSearch(event.target.value)} /></div><label className="select-wrap"><SlidersHorizontal size={15} /><select aria-label="Filter by status" value={status} onChange={event => setStatus(event.target.value)}>{['All statuses', 'Overdue', 'Pending review', 'In progress', 'Escalated', 'Resolved'].map(option => <option key={option}>{option}</option>)}</select><ChevronDown size={13} /></label><span className="result-count">{filteredCases.length} applications</span></div><CaseTable cases={filteredCases.slice((page - 1) * 10, page * 10)} select={setSelected} /><div className="pagination"><span>Page {page} of {pageCount}</span><IconButton label="Previous page" onClick={() => setPage(value => value - 1)} disabled={page === 1}><ChevronLeft size={16} /></IconButton><IconButton label="Next page" onClick={() => setPage(value => value + 1)} disabled={page >= pageCount}><ChevronRight size={16} /></IconButton></div></section>}
          {view === 'districts' && overview && <><div className="district-title"><MapPin size={20} /><h2>{overview.scope.taluk || overview.scope.district || 'Karnataka pilot'} service signals</h2><span>{overview.territories.length} {overview.territory_level === 'taluk' ? 'taluks' : 'districts'}</span></div><div className="district-comparison">{overview.territories.map(item => <article className="district-record" key={item.name}><div className="district-record-head"><span className="location-icon"><MapPin size={20} /></span><h3>{item.name}</h3><Badge tone={item.overdue > 0 ? 'amber' : 'green'}>{item.overdue > 0 ? 'Needs attention' : 'Within deadlines'}</Badge></div><div className="district-stats"><div><strong>{item.total}</strong><span>Applications</span></div><div><strong>{item.overdue}</strong><span>Overdue</span></div><div><strong>{percent(item.compliance)}</strong><span>Compliance</span></div></div><button className="text-button" onClick={() => { if (overview.territory_level === 'taluk') setTaluk(item.name); else { setDistrict(item.name); setTaluk('') } navigate('applications') }}>Review applications <ArrowRight size={15} /></button></article>)}</div><p className="method-note"><CircleHelp size={14} /> Counts are restricted to your authorized jurisdiction and department. Synthetic pilot geography is illustrative.</p></>}
          {view === 'feedback' && overview && <div className="feedback-view"><div className="feedback-score"><HeartHandshake size={36} /><span className="eyebrow">CITIZEN SATISFACTION</span><strong>{percent(overview.satisfaction)}</strong><p>Positive share of positive + negative feedback.<br />{overview.feedback_count} total records, including neutral feedback.</p><button className="button primary" onClick={() => setModal('grievance')}><Plus size={16} /> Share feedback</button></div><div className="feedback-breakdown"><h2>Complaints by district</h2>{activeDistricts.map(item => <div className="complaint-row" key={item.name}><span>{item.name}</span><div className="progress-track"><div className="bar-amber" style={{ width: `${Math.min(100, item.complaints / Math.max(1, ...activeDistricts.map(row => row.complaints)) * 100)}%` }} /></div><strong>{item.complaints}</strong></div>)}<div className="method-note"><CircleHelp size={16} /><p>Seed feedback uses demo labels. New feedback uses a transparent keyword baseline that may misread negation, not an AI sentiment assessment.</p></div></div></div>}
          {view === 'agents' && <div className="agents-layout"><Chat key={`${profile}-${district}-${taluk}-${department}`} role={user?.government ? 'government' : 'citizen'} district={district} taluk={taluk} department={department} onChange={reload} notify={setToast} /><aside className="agent-directory"><div className="section-heading"><h2>The collective</h2><span className="tiny-tag">LANGGRAPH</span></div>{agentNames.map((name, index) => <div className="agent-directory-row" key={name}><span className={`directory-icon agent-color-${index}`}><Bot size={19} /></span><div><strong>{name}</strong><span>{['Discovers services & citizen records', 'Evaluates explicit policy criteria', 'Checks stages & deadlines', 'Routes overdue cases with consent', 'Aggregates citizen feedback', 'Explains service bottlenecks'][index]}</span></div><span className="status-light" /></div>)}<div className="agent-engine"><Sparkles size={16} /><div><strong>{health?.gemini ? 'Gemini configured' : 'Deterministic demo mode'}</strong><p>{health?.gemini ? 'Evidence-grounded Gemini synthesis with deterministic fallback.' : 'Live workflow, real tool calls. No language model credentials required.'}</p></div></div></aside></div>}
          {view === 'citizen' && <>
            <div className="citizen-overview-head"><div><span className="eyebrow">YOUR CITIZEN WORKSPACE</span><h2>Welcome, {user?.name?.split(' ')[0] || 'citizen'}.</h2><p>Your applications and next steps, together in one place.</p></div><div className="citizen-overview-stats"><div><strong>{citizenCases.filter(item => item.status !== 'Resolved').length}</strong><span>Open requests</span></div><div><strong>{citizenCases.filter(item => item.status !== 'Resolved' && item.breached).length}</strong><span>Overdue</span></div><div><strong>{citizenCases.filter(item => item.status === 'Resolved').length}</strong><span>Completed</span></div></div></div>
            <div className="citizen-actions">{[{ title: 'New application', detail: 'Start a public service request', icon: FileText, action: 'application' }, { title: 'Check eligibility', detail: 'Illustrative pension policy', icon: Fingerprint, action: 'eligibility' }, { title: 'Raise a grievance', detail: 'Make your experience count', icon: MessageSquare, action: 'grievance' }].map(item => <button key={item.title} data-guide-target={item.action === 'application' ? 'apply' : item.action} onClick={() => { setEligibility(null); setModal(item.action as 'application' | 'eligibility' | 'grievance') }}><span className="citizen-action-icon"><item.icon size={22} /></span><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowUpRight size={18} /></button>)}</div>
            <div className="citizen-home-layout"><div><section className="citizen-applications"><div className="section-heading"><h2>Your applications</h2><span className="number-tag">{citizenCases.length}</span></div><div className="citizen-applications-primary">{citizenCases.length ? citizenCases.map(item => <button key={item.id} className="citizen-case" onClick={() => setSelected(item)}><div><span className="case-id">{item.id}</span><Badge tone={item.status === 'Resolved' ? 'green' : item.escalated ? 'red' : 'amber'}>{item.status}</Badge></div><h3>{item.service}</h3><p><MapPin size={13} />{item.taluk}, {item.district}</p><div className="citizen-case-bottom"><span><Clock3 size={13} />{item.status === 'Resolved' ? item.delay ? 'Completed after deadline' : 'Completed within deadline' : `${item.age} days · ${item.delay ? `${item.delay} days overdue` : 'Within deadline'}`}</span><ArrowRight size={16} /></div></button>) : <Empty title="Your next step starts here" detail="Create an application to begin." />}</div></section><div className="citizen-service-heading"><h2>Start a service request</h2><span>Illustrative service deadlines</span></div><div className="citizen-service-catalog">{catalog.services.map(service => <button key={service.name} onClick={() => { setNewService(service.name); setModal('application') }}><div><strong>{service.name}</strong><small>{service.department} · {service.sla}-day demo SLA</small></div><ArrowUpRight size={16} /></button>)}</div></div><Chat key={`citizen-chat-${profile}`} role="citizen" district="" onChange={reload} notify={setToast} /></div>
          </>}
          {view === 'audit' && <section className="audit-view"><div className="audit-banner"><ShieldCheck size={24} /><div><h2>An accountable chain of action.</h2><p>{audit.length} escalation {audit.length === 1 ? 'event' : 'events'} recorded. Each application can have one escalation.</p></div></div>{audit.length ? audit.map(item => <article className="audit-event" key={item.id}><span className="audit-check"><CheckCircle2 size={20} /></span><div><div className="audit-event-heading"><strong>{item.id}</strong><time>{new Date(item.created_at).toLocaleString('en-IN')}</time></div><p>{item.message}</p><span>{item.district} · Actor: {item.actor}</span><small><Bell size={12} />{item.notification}</small></div></article>) : <Empty title="A clear trail starts with an action" detail="Escalate an overdue application to record the first event. No external emails or SMS are sent." />}</section>}
        </>}
        <footer className="page-footer"><span><AudioLines size={15} /> SamanvAI <span className="footer-sep">/</span> Better governance, together.</span><span>Hackathon pilot <span className="inline-dot" /> Synthetic data only</span></footer>
      </main>
    </div>
    {toast && <div className={`toast ${toast.error ? 'toast-error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <TriangleAlert size={18} /> : <CheckCircle2 size={18} />}<span>{toast.text}</span><IconButton label="Dismiss notification" onClick={() => setToast(null)}><X size={15} /></IconButton></div>}
    {selected && <Modal title="Application details" close={() => setSelected(null)}><div className="case-modal"><div className="case-detail-id"><span>{selected.id}</span><Badge tone={selected.escalated ? 'red' : selected.status === 'Resolved' ? 'green' : 'amber'}>{selected.status}</Badge></div><h3>{selected.service}</h3><div className="detail-grid">{[['Citizen', selected.citizen], ['District', selected.district], ['Department', selected.department], ['Officer', selected.officer], ['Submitted', dateLabel(selected.submitted)], ['Service deadline', `${selected.sla} days`]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="case-stage"><Workflow size={19} /><div><strong>{selected.stage}</strong><p>{selected.status === 'Resolved' ? 'Application completed' : selected.delay ? `${selected.delay} days beyond the service deadline` : 'Within the expected service timeline'}</p></div></div><div className="document-list"><h4>Documents recorded</h4>{selected.documents.length ? selected.documents.map(document => <span key={document}><FileCheck2 size={15} />{document}</span>) : <p>No documents collected. Submission is awaiting document review.</p>}</div><p className="fine-print">Demo metadata only. Do not upload identity documents or real personal data.</p><button className="button primary full" onClick={() => void escalate(selected)} disabled={busy || selected.escalated || !selected.breached || selected.status === 'Resolved'}>{busy ? <LoaderCircle className="spin" size={17} /> : <ArrowUpRight size={17} />}{selected.escalated ? 'Escalation already recorded' : 'Escalate to supervisor'}</button></div></Modal>}
    {modal && <Modal title={({ application: 'Start an application', eligibility: 'Pension eligibility', grievance: 'Share your experience', infrastructure: 'Platform connections', help: 'About this workspace' })[modal]} close={() => setModal(null)}>
      {['application', 'eligibility', 'grievance'].includes(modal) && <form className="service-form" onSubmit={event => void submitForm(event)}>
        {modal !== 'eligibility' && <><label>Service<select value={newService} onChange={event => setNewService(event.target.value)}>{catalog.services.map(service => <option key={service.name}>{service.name}</option>)}</select></label><label>District<select value={newDistrict} onChange={event => setNewDistrict(event.target.value)}>{catalog.districts.map(name => <option key={name}>{name}</option>)}</select></label><label>Taluk<select aria-label="Application taluk" value={newTaluk} onChange={event => setNewTaluk(event.target.value)}><option value="">Choose taluk (optional)</option>{(catalog.taluks?.[newDistrict] || []).map(name => <option key={name}>{name}</option>)}</select></label></>}
        {modal === 'application' && <div className="form-note"><FileText size={18} /><p>Expected service deadline: <strong>{catalog.services.find(service => service.name === newService)?.sla} days.</strong><br />This creates an intake request. Document collection and departmental submission are not connected in this pilot.</p></div>}
        {modal === 'eligibility' && <><p className="form-intro">Illustrative rules, not an official government determination.</p><div className="form-columns"><label>Age<input required type="number" min="0" max="120" value={age} onChange={event => setAge(Number(event.target.value))} /></label><label>Annual income (INR)<input required type="number" min="0" max="100000000" value={income} onChange={event => setIncome(Number(event.target.value))} /></label></div><label>State of residence<select value={region} onChange={event => setRegion(event.target.value)}><option>Karnataka</option><option>Other</option></select></label>{eligibility && <div className="eligibility-result" aria-live="polite"><h3>{eligibility.eligible ? <CheckCircle2 size={20} /> : <XCircle size={20} />}{eligibility.eligible ? 'Meets demo criteria' : 'Does not meet all demo criteria'}</h3>{eligibility.checks.map(check => <div className={check.passed ? 'passed' : 'failed'} key={check.rule}>{check.passed ? <Check size={15} /> : <X size={15} />}{check.rule}</div>)}<h4>Required documents</h4><ul>{eligibility.documents.map(document => <li key={document}>{document}</li>)}</ul><small>{eligibility.source}</small></div>}</>}
        {modal === 'grievance' && <label>Your feedback<textarea required minLength={10} maxLength={2000} rows={5} value={feedbackText} onChange={event => setFeedbackText(event.target.value)} placeholder="Tell us what happened. Do not include personal or identity information." /></label>}
        <button className="button primary full" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : modal === 'eligibility' ? <Fingerprint size={17} /> : <Send size={16} />}{modal === 'application' ? 'Create application' : modal === 'eligibility' ? 'Check demo eligibility' : 'Submit feedback'}</button><p className="fine-print"><ShieldCheck size={13} /> Synthetic demo. No official application is submitted.</p>
      </form>}
      {modal === 'infrastructure' && <div className="infrastructure-list">{[['FastAPI', 'Connected', 'API and validated tool execution'], ['LangGraph', 'Connected', 'Six specialist workflow nodes'], [health?.storage || 'Database', 'Connected', 'Transactional applications and audit records'], ['Gemini', health?.gemini ? 'Configured' : 'Not configured', 'Optional evidence-grounded response generation'], ['Firebase Authentication', health?.auth === 'firebase' ? 'Configured' : 'Demo identity', 'Verified tokens and government custom claims when enabled'], ['AlloyDB', health?.storage.includes('PostgreSQL') ? 'Configured' : 'Not provisioned', 'Supported through DATABASE_URL (PostgreSQL)'], ['Firestore / BigQuery / Vertex RAG', 'Planned', 'Cloud ingestion, analytics warehouse, and vector retrieval']].map(([name, state, detail]) => <div className="infrastructure-row" key={name}><div><strong>{name}</strong><p>{detail}</p></div><Badge tone={state === 'Connected' || state === 'Configured' ? 'green' : 'neutral'}>{state}</Badge></div>)}</div>}
      {modal === 'help' && <div className="help-content"><span className="help-brand"><AudioLines size={26} />SamanvAI</span><p>An agentic governance intelligence platform. This hackathon pilot connects citizen requests, SLA enforcement, accountable escalations, and district-level insights.</p><div className="form-note"><ShieldCheck size={21} /><p>All seeded citizens, policies, and applications are synthetic. Demo mode intentionally grants a shared pilot administrator identity. Do not enter real citizen data.</p></div><p>Cloud resources are not provisioned automatically. The connections panel shows which integrations are active.</p><button className="button secondary full" onClick={() => setModal('infrastructure')}><ExternalLink size={16} /> View platform connections</button>{health?.auth === 'firebase' && <button className="button secondary full" onClick={() => void logout().then(() => { setModal(null); reload() })}>Sign out</button>}</div>}
    </Modal>}
  </div>
}