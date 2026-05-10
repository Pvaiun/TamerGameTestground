// Procedural SVG generators per species. Each takes a 4-color palette and
// returns SVG markup. Retained for the standalone tools/editor — no
// longer used by the game (the dossier UI uses bitmap glyphs instead).
export const ART_GENERATORS = {
  Emberkin: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="86" rx="32" ry="6" fill="${p.dark}" opacity="0.4"/>
    <path d="M40 78 Q 30 60 50 50 Q 70 46 82 60 Q 90 76 76 84 Q 58 90 40 78Z" fill="${p.primary}"/>
    <path d="M48 68 Q 60 60 72 68" stroke="${p.secondary}" stroke-width="2" fill="none"/>
    <ellipse cx="55" cy="60" rx="3" ry="4" fill="${p.accent}"/><ellipse cx="55" cy="61" rx="1.2" ry="2" fill="#000"/>
    <path d="M50 50 L 46 36 L 56 46 M62 48 L 60 32 L 70 44" stroke="${p.accent}" stroke-width="2" fill="${p.secondary}"/>
    <path d="M40 84 L 38 92 M52 86 L 52 94 M70 86 L 70 94" stroke="${p.dark}" stroke-width="3"/>
  </svg>`,
  Ashmaw: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="88" rx="34" ry="5" fill="${p.dark}" opacity="0.4"/>
    <path d="M28 76 Q 28 58 50 54 Q 74 52 90 64 Q 98 78 84 86 Q 60 92 38 86 Q 26 82 28 76Z" fill="${p.primary}"/>
    <path d="M28 60 L 32 48 L 38 60 M50 50 L 54 40 L 60 52" fill="${p.dark}"/>
    <ellipse cx="44" cy="68" rx="3.5" ry="4" fill="${p.accent}"/><ellipse cx="44" cy="69" rx="1.4" ry="2" fill="#000"/>
    <path d="M28 76 L 18 76 L 22 84 L 30 82" fill="${p.dark}"/>
    <path d="M55 78 Q 60 84 65 78" stroke="${p.dark}" stroke-width="2" fill="none"/>
    <path d="M50 86 L 50 92 M62 86 L 62 92 M76 86 L 76 92" stroke="${p.dark}" stroke-width="3"/>
  </svg>`,
  Cinderling: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="90" rx="22" ry="4" fill="${p.dark}" opacity="0.3"/>
    <ellipse cx="60" cy="68" rx="20" ry="22" fill="${p.primary}"/>
    <path d="M60 46 L 52 32 L 60 38 L 68 32 L 60 46" fill="${p.accent}"/>
    <circle cx="54" cy="64" r="3" fill="${p.accent}"/><circle cx="66" cy="64" r="3" fill="${p.accent}"/>
    <circle cx="54" cy="65" r="1" fill="#000"/><circle cx="66" cy="65" r="1" fill="#000"/>
    <path d="M52 76 Q 60 80 68 76" stroke="${p.dark}" stroke-width="2" fill="none"/>
    <path d="M40 60 Q 30 56 28 64 Q 30 72 40 70 M80 60 Q 90 56 92 64 Q 90 72 80 70" fill="${p.secondary}" opacity="0.7"/>
    <path d="M52 88 L 50 96 M68 88 L 70 96" stroke="${p.dark}" stroke-width="2.5"/>
  </svg>`,
  Pyrelord: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="90" rx="38" ry="6" fill="${p.dark}" opacity="0.4"/>
    <path d="M24 80 Q 22 56 50 50 Q 80 46 98 64 Q 100 84 80 88 Q 50 92 26 88 Q 22 84 24 80Z" fill="${p.primary}"/>
    <path d="M22 56 L 28 38 L 36 54 M48 50 L 54 32 L 62 48 M76 50 L 84 36 L 90 52" fill="${p.accent}" stroke="${p.dark}" stroke-width="1"/>
    <ellipse cx="44" cy="70" rx="4" ry="5" fill="${p.accent}"/><ellipse cx="76" cy="70" rx="4" ry="5" fill="${p.accent}"/>
    <ellipse cx="44" cy="71" rx="1.6" ry="2.5" fill="#000"/><ellipse cx="76" cy="71" rx="1.6" ry="2.5" fill="#000"/>
    <path d="M50 80 L 60 86 L 70 80" stroke="${p.dark}" stroke-width="2" fill="${p.dark}"/>
    <path d="M44 86 L 44 94 M60 88 L 60 96 M76 86 L 76 94" stroke="${p.dark}" stroke-width="3.5"/>
  </svg>`,
  Magmaw: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="92" rx="36" ry="5" fill="${p.dark}" opacity="0.4"/>
    <path d="M30 84 Q 24 60 44 52 Q 70 48 90 60 Q 96 84 78 90 Q 50 94 30 84Z" fill="${p.primary}"/>
    <circle cx="40" cy="68" r="6" fill="${p.dark}"/><circle cx="60" cy="64" r="7" fill="${p.dark}"/><circle cx="78" cy="70" r="5" fill="${p.dark}"/>
    <circle cx="40" cy="68" r="3" fill="${p.accent}"/><circle cx="60" cy="64" r="4" fill="${p.accent}"/><circle cx="78" cy="70" r="2.5" fill="${p.accent}"/>
    <path d="M40 80 Q 50 88 60 82 Q 70 88 78 80" stroke="${p.dark}" stroke-width="2" fill="none"/>
  </svg>`,
  Soothlick: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="90" rx="26" ry="4" fill="${p.dark}" opacity="0.3"/>
    <path d="M40 84 Q 32 64 44 50 Q 60 38 76 50 Q 88 64 80 84 Q 60 88 40 84Z" fill="${p.primary}"/>
    <path d="M44 50 Q 36 32 50 30 M76 50 Q 84 32 70 30" stroke="${p.dark}" stroke-width="2" fill="${p.secondary}"/>
    <ellipse cx="50" cy="62" rx="3" ry="4" fill="${p.accent}"/><ellipse cx="70" cy="62" rx="3" ry="4" fill="${p.accent}"/>
    <ellipse cx="50" cy="63" rx="1.2" ry="2" fill="#000"/><ellipse cx="70" cy="63" rx="1.2" ry="2" fill="#000"/>
    <path d="M52 74 Q 60 82 68 74 L 60 82 L 60 90" stroke="${p.accent}" stroke-width="2" fill="none"/>
  </svg>`,
  Charnel: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="92" rx="30" ry="4" fill="${p.dark}" opacity="0.3"/>
    <path d="M30 80 Q 28 60 48 54 Q 70 50 88 60 Q 94 80 80 88 Q 50 92 30 80Z" fill="${p.primary}"/>
    <path d="M30 60 L 26 48 L 36 56 M50 50 L 50 38 L 58 50 M76 52 L 80 40 L 84 54" stroke="${p.dark}" stroke-width="1" fill="${p.secondary}"/>
    <circle cx="46" cy="68" r="4" fill="${p.dark}"/><circle cx="46" cy="68" r="2" fill="${p.accent}"/>
    <circle cx="74" cy="68" r="4" fill="${p.dark}"/><circle cx="74" cy="68" r="2" fill="${p.accent}"/>
    <path d="M48 80 L 52 86 L 56 80 L 60 86 L 64 80 L 68 86 L 72 80" stroke="${p.dark}" stroke-width="1.5" fill="none"/>
  </svg>`,
  Tidewhelp: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="90" rx="28" ry="4" fill="${p.dark}" opacity="0.3"/>
    <ellipse cx="60" cy="68" rx="26" ry="22" fill="${p.primary}"/>
    <path d="M34 68 Q 24 60 22 70 Q 24 80 36 78 Z" fill="${p.secondary}"/>
    <path d="M86 68 Q 96 60 98 70 Q 96 80 84 78 Z" fill="${p.secondary}"/>
    <ellipse cx="52" cy="64" rx="3" ry="4" fill="${p.accent}"/><ellipse cx="68" cy="64" rx="3" ry="4" fill="${p.accent}"/>
    <ellipse cx="52" cy="65" rx="1.2" ry="2" fill="#000"/><ellipse cx="68" cy="65" rx="1.2" ry="2" fill="#000"/>
    <path d="M52 76 Q 60 80 68 76" stroke="${p.dark}" stroke-width="2" fill="none"/>
    <circle cx="46" cy="76" r="2" fill="${p.accent}" opacity="0.7"/><circle cx="74" cy="76" r="2" fill="${p.accent}" opacity="0.7"/>
  </svg>`,
  Rivergeist: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="92" rx="22" ry="3" fill="${p.dark}" opacity="0.2"/>
    <path d="M60 28 Q 40 36 38 56 Q 40 76 56 86 Q 60 90 64 86 Q 80 76 82 56 Q 80 36 60 28Z" fill="${p.primary}" opacity="0.85"/>
    <path d="M44 50 Q 60 56 76 50 M42 64 Q 60 70 78 64" stroke="${p.secondary}" stroke-width="2" fill="none" opacity="0.7"/>
    <ellipse cx="54" cy="46" rx="2.5" ry="3.5" fill="${p.accent}"/><ellipse cx="66" cy="46" rx="2.5" ry="3.5" fill="${p.accent}"/>
    <ellipse cx="54" cy="47" rx="1" ry="1.8" fill="#000"/><ellipse cx="66" cy="47" rx="1" ry="1.8" fill="#000"/>
    <path d="M52 58 Q 60 62 68 58" stroke="${p.dark}" stroke-width="1.5" fill="none"/>
  </svg>`,
  Brineback: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="92" rx="40" ry="5" fill="${p.dark}" opacity="0.4"/>
    <path d="M20 84 Q 18 60 50 50 Q 86 48 100 64 Q 102 84 86 88 Q 50 92 24 88 Z" fill="${p.primary}"/>
    <path d="M28 56 L 36 42 L 42 58 M50 48 L 56 36 L 62 50 M70 48 L 78 38 L 84 52" fill="${p.secondary}" stroke="${p.dark}" stroke-width="1"/>
    <ellipse cx="40" cy="74" rx="3" ry="4" fill="${p.accent}"/><ellipse cx="40" cy="75" rx="1.2" ry="2" fill="#000"/>
    <path d="M48 82 Q 60 86 72 82" stroke="${p.dark}" stroke-width="2" fill="none"/>
  </svg>`,
  Mireling: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="90" rx="30" ry="5" fill="${p.dark}" opacity="0.4"/>
    <path d="M34 86 Q 28 70 36 56 Q 50 44 70 48 Q 86 56 84 76 Q 82 88 60 90 Q 40 90 34 86Z" fill="${p.primary}"/>
    <circle cx="48" cy="62" r="4" fill="${p.accent}"/><circle cx="68" cy="62" r="4" fill="${p.accent}"/>
    <circle cx="48" cy="63" r="1.6" fill="#000"/><circle cx="68" cy="63" r="1.6" fill="#000"/>
    <path d="M50 76 Q 58 72 66 76" stroke="${p.dark}" stroke-width="2" fill="none"/>
    <ellipse cx="46" cy="80" rx="3" ry="2" fill="${p.secondary}" opacity="0.6"/>
    <ellipse cx="74" cy="80" rx="3" ry="2" fill="${p.secondary}" opacity="0.6"/>
  </svg>`,
  Coralhusk: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="92" rx="32" ry="5" fill="${p.dark}" opacity="0.4"/>
    <ellipse cx="60" cy="72" rx="28" ry="20" fill="${p.primary}"/>
    <path d="M40 60 Q 36 44 50 40 M80 60 Q 84 44 70 40 M52 50 Q 50 36 60 32 Q 70 36 68 50" stroke="${p.dark}" stroke-width="2" fill="${p.secondary}"/>
    <ellipse cx="52" cy="72" rx="3" ry="4" fill="${p.accent}"/><ellipse cx="68" cy="72" rx="3" ry="4" fill="${p.accent}"/>
    <ellipse cx="52" cy="73" rx="1.2" ry="2" fill="#000"/><ellipse cx="68" cy="73" rx="1.2" ry="2" fill="#000"/>
    <path d="M50 84 Q 60 88 70 84" stroke="${p.dark}" stroke-width="2" fill="none"/>
  </svg>`,
  Frostfin: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="90" rx="26" ry="4" fill="${p.dark}" opacity="0.3"/>
    <path d="M30 70 Q 30 54 60 50 Q 92 56 90 70 Q 90 80 60 84 Q 30 80 30 70Z" fill="${p.primary}"/>
    <path d="M30 70 L 18 64 L 22 78 L 30 76 M90 70 L 102 64 L 98 78 L 90 76" fill="${p.secondary}" stroke="${p.dark}" stroke-width="1"/>
    <ellipse cx="42" cy="66" rx="3" ry="4" fill="${p.accent}"/><ellipse cx="42" cy="67" rx="1.2" ry="2" fill="#000"/>
    <path d="M50 74 Q 60 78 70 74" stroke="${p.dark}" stroke-width="2" fill="none"/>
    <path d="M58 56 L 60 48 L 62 56 M68 58 L 70 50 L 72 58" stroke="${p.accent}" stroke-width="1.5" fill="${p.accent}"/>
  </svg>`,
  Deepmaw: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="92" rx="36" ry="5" fill="${p.dark}" opacity="0.4"/>
    <path d="M22 80 Q 20 56 50 48 Q 86 46 100 62 Q 102 84 88 88 Q 50 92 26 88 Z" fill="${p.primary}"/>
    <path d="M30 68 L 36 78 L 42 68 L 48 78 L 54 68 L 60 78 L 66 68 L 72 78 L 78 68" stroke="${p.accent}" stroke-width="1.5" fill="none"/>
    <circle cx="46" cy="60" r="5" fill="${p.dark}"/><circle cx="46" cy="60" r="2.5" fill="${p.accent}"/>
    <circle cx="74" cy="60" r="5" fill="${p.dark}"/><circle cx="74" cy="60" r="2.5" fill="${p.accent}"/>
  </svg>`,
  Loamback: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="90" rx="32" ry="5" fill="${p.dark}" opacity="0.4"/>
    <path d="M28 84 Q 22 64 40 54 Q 64 48 84 56 Q 96 76 84 86 Q 60 92 38 88 Q 26 86 28 84Z" fill="${p.primary}"/>
    <path d="M40 50 Q 36 32 48 28 Q 56 36 50 50 M70 50 Q 74 32 62 28 Q 54 36 60 50" fill="${p.secondary}" stroke="${p.dark}" stroke-width="1"/>
    <ellipse cx="48" cy="68" rx="3" ry="4" fill="${p.accent}"/><ellipse cx="72" cy="68" rx="3" ry="4" fill="${p.accent}"/>
    <ellipse cx="48" cy="69" rx="1.2" ry="2" fill="#000"/><ellipse cx="72" cy="69" rx="1.2" ry="2" fill="#000"/>
    <path d="M50 80 Q 60 84 70 80" stroke="${p.dark}" stroke-width="2" fill="none"/>
    <path d="M40 88 L 38 96 M58 90 L 58 98 M76 88 L 78 96" stroke="${p.dark}" stroke-width="3"/>
  </svg>`,
  Sproutkin: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="92" rx="22" ry="3" fill="${p.dark}" opacity="0.3"/>
    <ellipse cx="60" cy="74" rx="20" ry="18" fill="${p.primary}"/>
    <path d="M60 56 Q 50 40 56 32 Q 64 36 64 50 Q 70 36 76 38 Q 74 50 64 56" fill="${p.secondary}"/>
    <ellipse cx="54" cy="72" rx="3" ry="4" fill="${p.accent}"/><ellipse cx="66" cy="72" rx="3" ry="4" fill="${p.accent}"/>
    <ellipse cx="54" cy="73" rx="1.2" ry="2" fill="#000"/><ellipse cx="66" cy="73" rx="1.2" ry="2" fill="#000"/>
    <path d="M52 82 Q 60 86 68 82" stroke="${p.dark}" stroke-width="2" fill="none"/>
  </svg>`,
  Mosshorn: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="92" rx="34" ry="5" fill="${p.dark}" opacity="0.4"/>
    <path d="M28 86 Q 24 64 50 56 Q 80 54 92 64 Q 96 84 80 88 Q 50 92 30 88 Z" fill="${p.primary}"/>
    <path d="M36 56 L 30 38 L 42 50 M84 56 L 90 38 L 78 50" stroke="${p.dark}" stroke-width="2.5" fill="${p.secondary}"/>
    <ellipse cx="48" cy="70" rx="3.5" ry="4" fill="${p.accent}"/><ellipse cx="72" cy="70" rx="3.5" ry="4" fill="${p.accent}"/>
    <ellipse cx="48" cy="71" rx="1.4" ry="2" fill="#000"/><ellipse cx="72" cy="71" rx="1.4" ry="2" fill="#000"/>
    <path d="M50 82 Q 60 86 70 82" stroke="${p.dark}" stroke-width="2" fill="none"/>
    <path d="M40 88 L 40 96 M60 90 L 60 98 M80 88 L 80 96" stroke="${p.dark}" stroke-width="3"/>
  </svg>`,
  Vinewyrm: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="92" rx="32" ry="4" fill="${p.dark}" opacity="0.3"/>
    <path d="M30 84 Q 30 70 40 70 Q 50 70 50 80 Q 60 76 60 64 Q 60 50 72 50 Q 88 52 92 70 Q 90 84 76 86 Q 60 90 40 88 Z" fill="${p.primary}"/>
    <ellipse cx="80" cy="60" rx="3" ry="4" fill="${p.accent}"/><ellipse cx="80" cy="61" rx="1.2" ry="2" fill="#000"/>
    <circle cx="44" cy="76" r="2" fill="${p.secondary}"/><circle cx="56" cy="74" r="2" fill="${p.secondary}"/><circle cx="68" cy="68" r="2" fill="${p.secondary}"/>
    <path d="M76 68 Q 84 64 86 70" stroke="${p.dark}" stroke-width="1.5" fill="none"/>
  </svg>`,
  Bloomback: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="90" rx="30" ry="5" fill="${p.dark}" opacity="0.4"/>
    <path d="M30 84 Q 26 64 44 56 Q 64 50 82 58 Q 94 76 82 86 Q 60 90 30 84Z" fill="${p.primary}"/>
    <circle cx="46" cy="50" r="6" fill="${p.accent}"/><circle cx="46" cy="50" r="3" fill="${p.secondary}"/>
    <circle cx="60" cy="44" r="6" fill="${p.accent}"/><circle cx="60" cy="44" r="3" fill="${p.secondary}"/>
    <circle cx="74" cy="50" r="6" fill="${p.accent}"/><circle cx="74" cy="50" r="3" fill="${p.secondary}"/>
    <ellipse cx="50" cy="68" rx="3" ry="4" fill="${p.accent}"/><ellipse cx="70" cy="68" rx="3" ry="4" fill="${p.accent}"/>
    <ellipse cx="50" cy="69" rx="1.2" ry="2" fill="#000"/><ellipse cx="70" cy="69" rx="1.2" ry="2" fill="#000"/>
    <path d="M52 78 Q 60 82 68 78" stroke="${p.dark}" stroke-width="2" fill="none"/>
  </svg>`,
  Thornling: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="92" rx="24" ry="4" fill="${p.dark}" opacity="0.3"/>
    <ellipse cx="60" cy="72" rx="22" ry="20" fill="${p.primary}"/>
    <path d="M40 64 L 36 56 L 44 60 M60 50 L 56 42 L 64 46 M80 64 L 84 56 L 76 60 M40 84 L 36 92 L 44 88 M80 84 L 84 92 L 76 88" stroke="${p.dark}" stroke-width="1.5" fill="${p.secondary}"/>
    <ellipse cx="54" cy="70" rx="3" ry="4" fill="${p.accent}"/><ellipse cx="66" cy="70" rx="3" ry="4" fill="${p.accent}"/>
    <ellipse cx="54" cy="71" rx="1.2" ry="2" fill="#000"/><ellipse cx="66" cy="71" rx="1.2" ry="2" fill="#000"/>
    <path d="M52 82 Q 60 86 68 82" stroke="${p.dark}" stroke-width="2" fill="none"/>
  </svg>`,
  Hollowoak: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="92" rx="36" ry="5" fill="${p.dark}" opacity="0.4"/>
    <path d="M30 88 Q 24 60 40 50 Q 60 42 80 50 Q 96 60 90 88 Q 60 92 30 88Z" fill="${p.primary}"/>
    <path d="M40 50 L 36 30 L 44 42 M58 42 L 60 22 L 64 42 M78 50 L 84 32 L 76 44" stroke="${p.dark}" stroke-width="2" fill="${p.secondary}"/>
    <circle cx="50" cy="68" r="4" fill="${p.dark}"/><circle cx="50" cy="68" r="2" fill="${p.accent}"/>
    <circle cx="70" cy="68" r="4" fill="${p.dark}"/><circle cx="70" cy="68" r="2" fill="${p.accent}"/>
    <path d="M50 82 Q 60 84 70 82" stroke="${p.dark}" stroke-width="2.5" fill="none"/>
  </svg>`,
  Lumenpup: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="90" rx="28" ry="4" fill="${p.dark}" opacity="0.3"/>
    <ellipse cx="60" cy="68" rx="24" ry="20" fill="${p.primary}"/>
    <path d="M44 50 L 38 38 L 50 46 M76 50 L 82 38 L 70 46" fill="${p.secondary}" stroke="${p.dark}" stroke-width="1"/>
    <ellipse cx="52" cy="64" rx="3.5" ry="4" fill="${p.accent}"/><ellipse cx="68" cy="64" rx="3.5" ry="4" fill="${p.accent}"/>
    <ellipse cx="52" cy="65" rx="1.4" ry="2" fill="#000"/><ellipse cx="68" cy="65" rx="1.4" ry="2" fill="#000"/>
    <ellipse cx="60" cy="74" rx="3" ry="2.5" fill="${p.dark}"/>
    <path d="M54 78 Q 60 82 66 78" stroke="${p.dark}" stroke-width="1.5" fill="none"/>
    <circle cx="40" cy="56" r="2" fill="${p.accent}" opacity="0.7"/><circle cx="80" cy="56" r="2" fill="${p.accent}" opacity="0.7"/>
  </svg>`,
  Aurabeast: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="92" rx="34" ry="5" fill="${p.dark}" opacity="0.4"/>
    <path d="M28 84 Q 26 60 50 50 Q 78 46 92 64 Q 96 84 80 88 Q 50 92 30 88 Z" fill="${p.primary}"/>
    <circle cx="60" cy="56" r="22" fill="${p.accent}" opacity="0.18"/>
    <ellipse cx="48" cy="68" rx="3.5" ry="4" fill="${p.accent}"/><ellipse cx="72" cy="68" rx="3.5" ry="4" fill="${p.accent}"/>
    <ellipse cx="48" cy="69" rx="1.4" ry="2" fill="#000"/><ellipse cx="72" cy="69" rx="1.4" ry="2" fill="#000"/>
    <path d="M50 80 Q 60 84 70 80" stroke="${p.dark}" stroke-width="2" fill="none"/>
    <path d="M44 50 L 40 36 L 50 44 M76 50 L 80 36 L 70 44" stroke="${p.accent}" stroke-width="2" fill="${p.secondary}"/>
  </svg>`,
  Dawnstag: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="92" rx="28" ry="4" fill="${p.dark}" opacity="0.3"/>
    <path d="M40 84 Q 36 60 50 56 Q 70 54 80 60 Q 86 80 76 88 Q 60 92 42 88 Z" fill="${p.primary}"/>
    <path d="M44 56 L 36 30 L 44 42 L 38 30 M76 56 L 84 30 L 76 42 L 82 30" stroke="${p.accent}" stroke-width="2" fill="none"/>
    <ellipse cx="52" cy="68" rx="3" ry="4" fill="${p.accent}"/><ellipse cx="68" cy="68" rx="3" ry="4" fill="${p.accent}"/>
    <ellipse cx="52" cy="69" rx="1.2" ry="2" fill="#000"/><ellipse cx="68" cy="69" rx="1.2" ry="2" fill="#000"/>
    <path d="M52 80 Q 60 84 68 80" stroke="${p.dark}" stroke-width="2" fill="none"/>
    <path d="M44 88 L 44 96 M60 90 L 60 98 M76 88 L 76 96" stroke="${p.dark}" stroke-width="2.5"/>
  </svg>`,
  Halowyrm: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="92" rx="34" ry="4" fill="${p.dark}" opacity="0.3"/>
    <path d="M22 78 Q 26 70 38 72 Q 50 76 56 70 Q 60 60 70 60 Q 86 60 92 76 Q 90 86 76 86 Q 56 88 36 86 Q 22 86 22 78Z" fill="${p.primary}"/>
    <ellipse cx="78" cy="68" rx="3" ry="4" fill="${p.accent}"/><ellipse cx="78" cy="69" rx="1.2" ry="2" fill="#000"/>
    <ellipse cx="80" cy="58" rx="14" ry="3" fill="none" stroke="${p.accent}" stroke-width="1.5" opacity="0.7"/>
    <path d="M76 78 Q 84 76 84 82" stroke="${p.dark}" stroke-width="1.5" fill="none"/>
  </svg>`,
  Glimmerfox: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="90" rx="30" ry="4" fill="${p.dark}" opacity="0.3"/>
    <path d="M30 80 Q 28 60 46 54 Q 70 50 84 60 Q 92 80 78 86 Q 60 90 32 86 Z" fill="${p.primary}"/>
    <path d="M44 54 L 38 36 L 50 48 M76 54 L 82 36 L 70 48" fill="${p.secondary}" stroke="${p.dark}" stroke-width="1"/>
    <ellipse cx="50" cy="66" rx="3" ry="4" fill="${p.accent}"/><ellipse cx="70" cy="66" rx="3" ry="4" fill="${p.accent}"/>
    <ellipse cx="50" cy="67" rx="1.2" ry="2" fill="#000"/><ellipse cx="70" cy="67" rx="1.2" ry="2" fill="#000"/>
    <path d="M52 76 Q 60 80 68 76" stroke="${p.dark}" stroke-width="2" fill="none"/>
    <path d="M84 80 Q 96 78 102 70 Q 108 80 100 88 Q 90 90 84 86Z" fill="${p.secondary}"/>
  </svg>`,
  Shadowmaw: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="92" rx="34" ry="5" fill="${p.dark}" opacity="0.5"/>
    <path d="M26 82 Q 22 56 50 48 Q 80 46 96 64 Q 100 84 84 88 Q 50 92 28 88 Z" fill="${p.primary}"/>
    <path d="M28 56 L 36 38 L 42 56 M50 48 L 56 32 L 64 48 M74 48 L 82 36 L 88 52" fill="${p.dark}" stroke="${p.accent}" stroke-width="0.5"/>
    <ellipse cx="46" cy="68" rx="4" ry="5" fill="${p.accent}"/><ellipse cx="74" cy="68" rx="4" ry="5" fill="${p.accent}"/>
    <ellipse cx="46" cy="69" rx="1.6" ry="2.5" fill="#000"/><ellipse cx="74" cy="69" rx="1.6" ry="2.5" fill="#000"/>
    <path d="M44 80 L 50 86 L 54 80 L 60 86 L 66 80 L 70 86 L 76 80" stroke="${p.dark}" stroke-width="2" fill="none"/>
  </svg>`,
  Voidling: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="92" rx="22" ry="3" fill="${p.dark}" opacity="0.4"/>
    <ellipse cx="60" cy="68" rx="22" ry="22" fill="${p.primary}"/>
    <path d="M48 50 L 44 38 L 52 46 M72 50 L 76 38 L 68 46" fill="${p.dark}"/>
    <ellipse cx="52" cy="66" rx="3" ry="5" fill="${p.accent}"/><ellipse cx="68" cy="66" rx="3" ry="5" fill="${p.accent}"/>
    <ellipse cx="52" cy="67" rx="1.2" ry="2.5" fill="#000"/><ellipse cx="68" cy="67" rx="1.2" ry="2.5" fill="#000"/>
    <path d="M50 78 L 60 82 L 70 78" stroke="${p.dark}" stroke-width="2" fill="none"/>
    <circle cx="42" cy="56" r="2" fill="${p.accent}" opacity="0.5"/>
    <circle cx="78" cy="58" r="2" fill="${p.accent}" opacity="0.5"/>
  </svg>`,
  Nightcreep: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="92" rx="32" ry="4" fill="${p.dark}" opacity="0.4"/>
    <path d="M28 84 Q 30 64 50 60 Q 72 58 88 68 Q 92 84 76 86 Q 50 90 30 88 Z" fill="${p.primary}"/>
    <ellipse cx="46" cy="74" rx="3" ry="4" fill="${p.accent}"/><ellipse cx="58" cy="72" rx="3" ry="4" fill="${p.accent}"/>
    <ellipse cx="70" cy="74" rx="3" ry="4" fill="${p.accent}"/>
    <ellipse cx="46" cy="75" rx="1.2" ry="2" fill="#000"/><ellipse cx="58" cy="73" rx="1.2" ry="2" fill="#000"/>
    <ellipse cx="70" cy="75" rx="1.2" ry="2" fill="#000"/>
    <path d="M30 84 L 24 90 M50 88 L 48 96 M70 88 L 72 96 M90 84 L 96 90" stroke="${p.dark}" stroke-width="2.5"/>
  </svg>`,
  Wraithfin: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="92" rx="20" ry="3" fill="${p.dark}" opacity="0.3"/>
    <path d="M60 30 Q 38 38 36 60 Q 38 80 50 88 Q 56 92 60 88 L 60 96 L 64 88 Q 70 92 70 88 Q 82 80 84 60 Q 82 38 60 30Z" fill="${p.primary}" opacity="0.85"/>
    <ellipse cx="52" cy="50" rx="2.5" ry="4" fill="${p.accent}"/><ellipse cx="68" cy="50" rx="2.5" ry="4" fill="${p.accent}"/>
    <ellipse cx="52" cy="51" rx="1" ry="2" fill="#000"/><ellipse cx="68" cy="51" rx="1" ry="2" fill="#000"/>
    <path d="M50 64 Q 60 68 70 64" stroke="${p.dark}" stroke-width="1.5" fill="none"/>
    <path d="M44 78 L 40 88 M76 78 L 80 88" stroke="${p.dark}" stroke-width="1.5"/>
  </svg>`,
  Umbragale: (p) => `<svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="92" rx="36" ry="5" fill="${p.dark}" opacity="0.5"/>
    <path d="M24 84 Q 20 56 40 50 Q 60 44 80 50 Q 100 56 96 84 Q 60 92 24 84Z" fill="${p.primary}"/>
    <path d="M30 50 L 22 30 L 36 44 M90 50 L 98 30 L 84 44" stroke="${p.dark}" stroke-width="2.5" fill="${p.dark}"/>
    <ellipse cx="46" cy="66" rx="4" ry="5" fill="${p.accent}"/><ellipse cx="74" cy="66" rx="4" ry="5" fill="${p.accent}"/>
    <ellipse cx="46" cy="67" rx="1.6" ry="2.5" fill="#000"/><ellipse cx="74" cy="67" rx="1.6" ry="2.5" fill="#000"/>
    <path d="M46 80 L 52 86 L 60 80 L 68 86 L 74 80" stroke="${p.dark}" stroke-width="2" fill="none"/>
    <circle cx="60" cy="58" r="2" fill="${p.accent}" opacity="0.5"/>
  </svg>`,
};

export function blendPalettes(a, b) {
  const blend = (h1, h2) => {
    const p = (h) => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
    const [r1,g1,b1] = p(h1), [r2,g2,b2] = p(h2);
    const mix = (a,b) => Math.round((a+b)/2).toString(16).padStart(2,'0');
    return '#' + mix(r1,r2) + mix(g1,g2) + mix(b1,b2);
  };
  return {
    primary: blend(a.primary, b.primary),
    secondary: blend(a.secondary, b.secondary),
    accent: blend(a.accent, b.accent),
    dark: blend(a.dark, b.dark),
  };
}

