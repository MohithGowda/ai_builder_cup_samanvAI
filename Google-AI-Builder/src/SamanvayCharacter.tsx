import './samanvay.css'

export type GuideMotion = 'idle' | 'walk' | 'run' | 'jump' | 'point'
export type GuideExpression = 'smiling' | 'speaking' | 'listening' | 'thinking' | 'concerned'

export default function SamanvayCharacter({ motion = 'idle', expression = 'smiling', portrait = false }: { motion?: GuideMotion; expression?: GuideExpression; portrait?: boolean }) {
  return <svg className={`samanvay-character motion-${motion} expression-${expression} ${portrait ? 'portrait' : ''}`} data-motion={motion} data-expression={expression} viewBox={portrait ? '24 0 112 118' : '0 0 160 300'} aria-hidden="true" fill="none">
    {!portrait && <ellipse className="samanvay-floor" cx="80" cy="291" rx="38" ry="5" fill="#061F2C" opacity=".18" />}
    <g className="samanvay-body">
      <g className="samanvay-leg samanvay-leg-left"><path d="m53 180 25 1-1 60-6 43H48l4-45z" fill="#2B3D4C" /><path d="m64 195-3 72" stroke="#415564" strokeWidth="1.3" /><path d="m48 278 24 1 1 12H38c-4-7 1-11 10-13" fill="#152A36" /><path d="M39 291h34" stroke="#78929E" strokeWidth="2" strokeLinecap="round" /></g>
      <g className="samanvay-leg samanvay-leg-right"><path d="m80 181 25-1 4 59 5 44H91l-10-42z" fill="#354B5D" /><path d="m94 195 7 72" stroke="#4A6171" strokeWidth="1.3" /><path d="m91 278 23 1c9 2 14 6 10 12H90z" fill="#1B303E" /><path d="M91 291h33" stroke="#78929E" strokeWidth="2" strokeLinecap="round" /></g>
      <g className="samanvay-arm samanvay-arm-left"><path d="M50 110c-11 5-14 20-16 35l-5 26 15 5 10-30 10-24z" fill="#314759" /><path d="m30 162 15 5-2 6-15-5z" fill="#E5EFF1" /><path d="m30 166 14 5-3 18c-2 7-6 10-10 7-3-2-5-5-5-10l-3-9c-1-4 3-6 5-2z" fill="#DFA482" /><circle cx="38" cy="163" r="1.3" fill="#9AB2BD" /></g>
      <g className="samanvay-arm samanvay-arm-right"><path d="M108 111c12 6 14 18 16 32l5 28-14 5-10-31-8-23z" fill="#40586B" /><path d="m113 165 15-5 2 6-15 5z" fill="#F0F5F5" /><path d="m115 170 13-5 5 11c2-4 5-4 6-1l-2 11c0 9-5 14-10 10l-7-10z" fill="#ECB38F" /><circle cx="120" cy="164" r="1.3" fill="#B9CAD1" /></g>
      <g className="samanvay-suit">
        <path d="M51 112c8-6 18-9 29-9s24 4 30 10l-2 73-23 4-6-7-6 7-22-4z" fill="#354E62" />
        <path d="m67 105 13 13 13-13-4 56-9 12-10-12z" fill="#EFF5F5" />
        <path d="M68 95h23l3 12-14 14-15-14z" fill="#D89B79" />
        <path d="m66 106 14 13-8 9-11-17m33-5-14 13 8 9 11-17" fill="#FFFFFF" />
        <path d="m77 120 6-1 3 6-6 5-6-5z" fill="#117C91" /><path d="m77 128 6 1 4 29-7 10-7-10z" fill="#168EA1" />
        <path d="m62 108-11 7 8 17-6 5 26 35-9-43z" fill="#496376" />
        <path d="m98 108 12 8-8 16 5 5-27 35 10-43z" fill="#577286" />
        <path d="m59 132 20 40 1 14m22-54-22 40" stroke="#203A4D" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="m94 140 1-8 5 3 4-5 2 10z" fill="#E6F3F5" />
        <path d="M93 141h14" stroke="#223D50" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M56 166h15m20 0h13" stroke="#223D50" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="81" cy="172" r="1.8" fill="#AFC3CA" /><circle cx="81" cy="182" r="1.5" fill="#9AB1BC" />
        <path d="m62 121 2-4 2 4-2 4z" fill="#D6C497" />
      </g>
      <g className="samanvay-head">
        <path d="M48 41c-2-19 11-29 32-29 23 0 36 12 33 32l-5 17-4-5H54l-4 5z" fill="#263744" />
        <path className="samanvay-face" d="M51 42c0-17 13-26 29-26s30 10 30 28v24c0 13-5 22-13 29-5 4-11 7-17 7s-12-3-17-7c-8-7-13-17-13-30z" fill="#EBB18C" />
        <path d="M56 49c1-10 6-16 13-19-8 8-9 20-8 32l-5 8z" fill="#F7CCAA" opacity=".32" />
        <path d="M48 54c-7-3-11 2-8 11 1 7 7 11 12 9m58-20c8-4 12 1 9 10-2 7-5 11-10 10" fill="#DFA381" />
        <g className="samanvay-hair">
          <g className="samanvay-hair-fade"><path d="m49 36 8-3-2 14-2 11-4-2z" fill="#74665F" /><path d="m104 33 8 4-3 19-4 2-2-12z" fill="#74665F" /><path d="m49 36 7-2-2 12-5 4m56-16 7 3-2 13-5-4" fill="#4B4B4C" /></g>
          <path className="samanvay-hair-crop" d="M49 43c-4-11 1-21 10-26l-2-4 10 1 8-6 8 3 7-4 4 6c15 1 24 15 17 31l-6-7c-11 2-20-1-27-5-6 7-15 11-25 11l-2 9-3-2z" fill="#243542" />
          <path d="M56 30c5-8 13-12 24-13m-20 19c6-7 13-11 23-13m3-6c7 4 13 6 19 6m-19 1c6 5 13 7 20 7" stroke="#49606D" strokeWidth="1.8" strokeLinecap="round" />
          <path d="m83 17-4 13" stroke="#B18C70" strokeWidth="1.5" strokeLinecap="round" />
          <path d="m54 45-1 5m54-5 1 5" stroke="#9D8270" strokeWidth="1.2" strokeLinecap="round" />
        </g>
        <path className="samanvay-brow-left" d="M59 51c4-2.6 9-3.2 14-1.5" stroke="#4C4042" strokeWidth="2.1" strokeLinecap="round" />
        <path className="samanvay-brow-right" d="M88 49.5c5-1.7 10-1.1 14 1.5" stroke="#4C4042" strokeWidth="2.1" strokeLinecap="round" />
        <g className="samanvay-eyes">
          <path d="M60 61c3-5 10-5 14 0-3 5-10 5-14 0m28 0c3-5 10-5 14 0-3 5-10 5-14 0" fill="#FFF9F2" />
          <ellipse cx="67" cy="61" rx="3.7" ry="4" fill="#4B7881" /><ellipse cx="95" cy="61" rx="3.7" ry="4" fill="#4B7881" />
          <ellipse cx="67" cy="61.5" rx="2.1" ry="2.8" fill="#203B47" /><ellipse cx="95" cy="61.5" rx="2.1" ry="2.8" fill="#203B47" />
          <circle cx="68.2" cy="59.5" r="1.25" fill="#fff" /><circle cx="96.2" cy="59.5" r="1.25" fill="#fff" />
          <path d="M60 61c3-4.6 10-4.6 14 0m14 0c3-4.6 10-4.6 14 0" stroke="#614D49" strokeWidth="1.2" strokeLinecap="round" />
        </g>
        <path d="M81 67c-1 3-2 5-2 7 1 2 4 3 6 1" stroke="#C58A6D" strokeWidth="1.4" strokeLinecap="round" />
        <ellipse cx="60" cy="76" rx="6.5" ry="3.5" fill="#E69D8A" opacity=".35" /><ellipse cx="102" cy="76" rx="6.5" ry="3.5" fill="#E69D8A" opacity=".35" />
        <g className="samanvay-smile"><path d="M67 83c7 11 21 11 28-1-9 4-19 4-28 1" fill="#995C58" /><path d="M70 84c7 3 14 3 22-1-5 7-17 8-22 1" fill="#FFF9F1" /><path d="M75 91c4 1 8 1 12-1" stroke="#DB9690" strokeWidth="1.5" strokeLinecap="round" /><path d="m64 82 2-2m30 0 2 2" stroke="#CF9077" strokeWidth="1.2" strokeLinecap="round" /></g>
        <g className="samanvay-talking-mouth"><ellipse cx="81" cy="87" rx="9.5" ry="6.5" fill="#995C58" /><path d="M73.5 83h15v3h-15z" fill="#FFF9F1" /><ellipse cx="81" cy="91" rx="5" ry="1.8" fill="#DE9991" /></g>
      </g>
    </g>
  </svg>
}