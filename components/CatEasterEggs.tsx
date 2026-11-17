import React, { useEffect, useState } from "react";

export type CatEasterEggType = "spinning" | "crying" | null;

interface CatEasterEggsProps {
  activeEgg: CatEasterEggType;
  lang: string;
  soundEnabled?: boolean;
  onClose: () => void;
  onSwitchEgg: (next: Exclude<CatEasterEggType, null>) => void;
}

function playCatEasterEggSound(type: Exclude<CatEasterEggType, null>, soundEnabled: boolean) {
  if (!soundEnabled || typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (type === "spinning") {
      // Playful upbeat "O-I-I-A-I" rhythmic chiptune meow notes
      const notes = [523.25, 659.25, 783.99, 659.25, 880, 1046.5, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        const t = now + i * 0.11;
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.15, t + 0.08);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.11, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.105);
      });
    } else {
      // Gentle downward sad "Miau..." sound
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(340, now + 0.55);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.62);

      // Second tiny sniffle
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(480, now + 0.68);
      osc2.frequency.exponentialRampToValueAtTime(290, now + 1.05);
      gain2.gain.setValueAtTime(0.001, now + 0.68);
      gain2.gain.linearRampToValueAtTime(0.08, now + 0.74);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.08);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.68);
      osc2.stop(now + 1.1);
    }

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1500);
  } catch {
    // Ignore WebAudio autoplay restrictions cleanly
  }
}

export const CatEasterEggs: React.FC<CatEasterEggsProps> = ({
  activeEgg,
  lang,
  soundEnabled = true,
  onClose,
  onSwitchEgg,
}) => {
  const [spinSpeed, setSpinSpeed] = useState<"normal" | "turbo">("normal");
  const [comfortHearts, setComfortHearts] = useState(0);

  useEffect(() => {
    if (!activeEgg) return;
    setSpinSpeed("normal");
    setComfortHearts(0);
    playCatEasterEggSound(activeEgg, soundEnabled);
  }, [activeEgg, soundEnabled]);

  if (!activeEgg) return null;

  const isEs = lang === "es";

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClose}
      className="fixed inset-0 z-[100050] bg-black/80 backdrop-blur-md flex items-center justify-center safe-area-inset p-3 sm:p-6 overflow-y-auto pointer-events-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-md max-h-[92dvh] overflow-y-auto my-auto rounded-3xl border-2 p-5 sm:p-6 shadow-2xl flex flex-col items-center text-center gap-4 ${
          activeEgg === "spinning"
            ? "bg-gradient-to-b from-indigo-950 via-zinc-950 to-purple-950 border-amber-400/70"
            : "bg-gradient-to-b from-slate-900 via-zinc-950 to-sky-950 border-sky-400/60"
        }`}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label={isEs ? "Cerrar" : "Close"}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-zinc-900/90 hover:bg-zinc-800 border border-white/15 text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer transition"
        >
          <i className="fas fa-times text-xs" />
        </button>

        {/* Secret Badge */}
        <div
          className={`px-3 py-1 rounded-full text-[10px] font-mono font-black uppercase tracking-widest border ${
            activeEgg === "spinning"
              ? "bg-amber-500/20 border-amber-400/50 text-amber-300"
              : "bg-sky-500/20 border-sky-400/50 text-sky-300"
          }`}
        >
          {activeEgg === "spinning"
            ? (isEs ? "★ Easter Egg #1 • Secreto Desbloqueado ★" : "★ Easter Egg #1 • Secret Unlocked ★")
            : (isEs ? "★ Easter Egg #2 • Segundo Secreto ★" : "★ Easter Egg #2 • Second Secret ★")}
        </div>

        {/* STAGE */}
        {activeEgg === "spinning" ? (
          <div className="relative w-52 h-52 sm:w-60 sm:h-60 flex items-center justify-center my-1">
            {/* Rainbow Glowing Aura Ring */}
            <div
              className="cat-rainbow-ring absolute inset-3 rounded-full opacity-75 blur-[1px]"
              style={{
                background: "conic-gradient(from 0deg, #ef4444, #f59e0b, #10b981, #06b6d4, #8b5cf6, #ec4899, #ef4444)",
              }}
            />
            <div className="absolute inset-5 rounded-full bg-zinc-950/90 border border-white/15 shadow-inner" />

            {/* Floating music notes & stars */}
            <span className="absolute top-2 left-4 text-amber-300 text-lg font-black animate-bounce">★</span>
            <span className="absolute top-4 right-4 text-pink-400 text-lg font-black animate-pulse">♫</span>
            <span className="absolute bottom-4 left-5 text-cyan-300 text-lg font-black animate-pulse">♪</span>
            <span className="absolute bottom-3 right-6 text-emerald-300 text-base font-black animate-bounce">★</span>

            {/* Spinning Voxel Cat SVG */}
            <div
              className={spinSpeed === "turbo" ? "cat-spin-turbo" : "cat-spin-normal"}
              style={{ transformStyle: "preserve-3d" }}
            >
              <svg viewBox="0 0 128 128" className="w-36 h-36 sm:w-40 sm:h-40 drop-shadow-[0_12px_20px_rgba(0,0,0,0.85)]">
                {/* Tail */}
                <rect x="92" y="64" width="14" height="32" rx="4" fill="#3f3f46" stroke="#18181b" strokeWidth="3" />
                <rect x="96" y="60" width="12" height="12" rx="3" fill="#e4e4e7" />
                {/* Body */}
                <rect x="34" y="64" width="60" height="44" rx="8" fill="#52525b" stroke="#18181b" strokeWidth="3" />
                {/* White tummy */}
                <rect x="46" y="72" width="36" height="34" rx="6" fill="#fafafa" />
                {/* Paws */}
                <rect x="38" y="100" width="18" height="14" rx="5" fill="#fafafa" stroke="#18181b" strokeWidth="3" />
                <rect x="72" y="100" width="18" height="14" rx="5" fill="#fafafa" stroke="#18181b" strokeWidth="3" />
                {/* Left Ear */}
                <polygon points="32,42 36,14 54,32" fill="#3f3f46" stroke="#18181b" strokeWidth="3" />
                <polygon points="37,37 39,22 49,33" fill="#fda4af" />
                {/* Right Ear */}
                <polygon points="96,42 92,14 74,32" fill="#3f3f46" stroke="#18181b" strokeWidth="3" />
                <polygon points="91,37 89,22 79,33" fill="#fda4af" />
                {/* Head */}
                <rect x="30" y="28" width="68" height="48" rx="12" fill="#52525b" stroke="#18181b" strokeWidth="3" />
                {/* Forehead stripes */}
                <rect x="59" y="29" width="10" height="12" rx="2" fill="#27272a" />
                <rect x="48" y="30" width="6" height="9" rx="2" fill="#27272a" />
                <rect x="74" y="30" width="6" height="9" rx="2" fill="#27272a" />
                {/* White cheeks / muzzle */}
                <rect x="42" y="54" width="44" height="20" rx="8" fill="#fafafa" />
                {/* Eyes (happy shiny) */}
                <circle cx="48" cy="48" r="7" fill="#09090b" />
                <circle cx="80" cy="48" r="7" fill="#09090b" />
                <circle cx="45.5" cy="45.5" r="2.6" fill="#ffffff" />
                <circle cx="77.5" cy="45.5" r="2.6" fill="#ffffff" />
                <circle cx="50" cy="50" r="1.4" fill="#34d399" />
                <circle cx="82" cy="50" r="1.4" fill="#34d399" />
                {/* Pink nose & smile */}
                <polygon points="60,56 68,56 64,61" fill="#fb7185" />
                <path d="M56 63 Q60 68 64 62 Q68 68 72 63" fill="none" stroke="#18181b" strokeWidth="2.5" strokeLinecap="round" />
                {/* Whiskers */}
                <line x1="20" y1="53" x2="36" y2="56" stroke="#e4e4e7" strokeWidth="2.2" strokeLinecap="round" />
                <line x1="18" y1="62" x2="36" y2="62" stroke="#e4e4e7" strokeWidth="2.2" strokeLinecap="round" />
                <line x1="108" y1="53" x2="92" y2="56" stroke="#e4e4e7" strokeWidth="2.2" strokeLinecap="round" />
                <line x1="110" y1="62" x2="92" y2="62" stroke="#e4e4e7" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        ) : (
          <div className="relative w-52 h-52 sm:w-60 sm:h-60 flex items-center justify-center my-1">
            {/* Tiny Rain Cloud Overhead */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
              <div className="flex items-center justify-center text-sky-200/90 drop-shadow">
                <i className="fas fa-cloud text-3xl text-slate-400" />
              </div>
              <div className="flex gap-3 text-sky-400 text-[10px] -mt-1 animate-bounce">
                <span>💧</span>
                <span>💧</span>
              </div>
            </div>

            {/* Growing Tear Puddle */}
            <div className="cat-puddle-pulse absolute bottom-2 left-1/2 -translate-x-1/2 w-40 h-7 rounded-full bg-cyan-400/35 border border-cyan-300/40 blur-[1px]" />

            {/* Floating comfort hearts */}
            {comfortHearts > 0 && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
                <span className="absolute top-8 left-10 text-emerald-400 text-xl animate-bounce">💚</span>
                <span className="absolute top-10 right-10 text-pink-400 text-xl animate-pulse">💖</span>
                {comfortHearts > 1 && (
                  <span className="absolute top-4 left-1/2 -translate-x-1/2 text-amber-300 text-lg animate-bounce">✨</span>
                )}
              </div>
            )}

            {/* Crying Trembling Voxel Cat SVG */}
            <div className="cat-sob-shake relative mt-4">
              <svg viewBox="0 0 128 128" className="w-36 h-36 sm:w-40 sm:h-40 drop-shadow-[0_10px_18px_rgba(0,0,0,0.85)]">
                {/* Droopy Tail */}
                <rect x="90" y="84" width="16" height="22" rx="6" fill="#64748b" stroke="#0f172a" strokeWidth="3" />
                {/* Body */}
                <rect x="34" y="64" width="60" height="44" rx="8" fill="#94a3b8" stroke="#0f172a" strokeWidth="3" />
                {/* Tummy */}
                <rect x="46" y="72" width="36" height="34" rx="6" fill="#f1f5f9" />
                {/* Paws */}
                <rect x="38" y="100" width="18" height="14" rx="5" fill="#f1f5f9" stroke="#0f172a" strokeWidth="3" />
                <rect x="72" y="100" width="18" height="14" rx="5" fill="#f1f5f9" stroke="#0f172a" strokeWidth="3" />
                {/* Droopy Ears */}
                <polygon points="30,44 20,26 48,32" fill="#64748b" stroke="#0f172a" strokeWidth="3" />
                <polygon points="98,44 108,26 80,32" fill="#64748b" stroke="#0f172a" strokeWidth="3" />
                {/* Head */}
                <rect x="30" y="30" width="68" height="48" rx="14" fill="#94a3b8" stroke="#0f172a" strokeWidth="3" />
                {/* Muzzle */}
                <rect x="43" y="54" width="42" height="20" rx="8" fill="#f8fafc" />
                {/* Huge watery crying eyes */}
                <circle cx="48" cy="48" r="9.5" fill="#020617" />
                <circle cx="80" cy="48" r="9.5" fill="#020617" />
                {/* Shimmering highlights */}
                <circle cx="44" cy="44" r="3.6" fill="#ffffff" />
                <circle cx="76" cy="44" r="3.6" fill="#ffffff" />
                <circle cx="51" cy="51" r="2.2" fill="#bae6fd" />
                <circle cx="83" cy="51" r="2.2" fill="#bae6fd" />
                {/* Sad eyebrows */}
                <line x1="38" y1="39" x2="54" y2="35" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
                <line x1="90" y1="39" x2="74" y2="35" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
                {/* Tear streams from eyes */}
                <rect x="42" y="55" width="9" height="36" rx="4" fill="#38bdf8" opacity="0.8" />
                <rect x="77" y="55" width="9" height="36" rx="4" fill="#38bdf8" opacity="0.8" />
                {/* Nose & trembling frown */}
                <polygon points="60,57 68,57 64,61" fill="#fb7185" />
                {comfortHearts > 0 ? (
                  <path d="M56 64 Q64 70 72 64" fill="none" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
                ) : (
                  <path d="M56 68 Q64 60 72 68" fill="none" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
                )}
              </svg>

              {/* Animated Falling Teardrops */}
              <span className="cat-tear-drop-left absolute left-[34%] top-[44%] w-2.5 h-4 rounded-full bg-cyan-300 shadow-[0_0_8px_#38bdf8]" />
              <span className="cat-tear-drop-right absolute right-[34%] top-[44%] w-2.5 h-4 rounded-full bg-cyan-300 shadow-[0_0_8px_#38bdf8]" />
            </div>
          </div>
        )}

        {/* Title & Funny Subtitle */}
        <div className="flex flex-col gap-1">
          <h2 className="text-xl sm:text-2xl font-black minecraft-font uppercase tracking-wide text-white drop-shadow">
            {activeEgg === "spinning"
              ? (isEs ? "¡El Gato Girando!" : "Spinning Cat!")
              : (isEs ? "El Gato Llorando..." : "The Crying Cat...")}
          </h2>
          <p className="text-xs text-zinc-300 font-mono">
            {activeEgg === "spinning"
              ? (isEs
                  ? "O-i-i-a-i... ¡Encontraste el primer secreto del título!"
                  : "O-i-i-a-i... You discovered the first title secret!")
              : comfortHearts > 0
                ? (isEs
                    ? "¡Gracias por consolarlo! Sigue siendo un michi valiente."
                    : "Thanks for comforting the kitty!")
                : (isEs
                    ? "Miau... ¿Por qué no estás jugando aún? ¡Tócalo para consolarlo!"
                    : "Meow... Why aren't you playing yet? Pet to comfort!")}
          </p>
        </div>

        {/* Interactive Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-2 w-full">
          {activeEgg === "spinning" ? (
            <button
              type="button"
              onClick={() => {
                setSpinSpeed((s) => (s === "normal" ? "turbo" : "normal"));
                playCatEasterEggSound("spinning", soundEnabled);
              }}
              className="flex-1 min-w-[130px] py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-pink-500 hover:brightness-110 text-white font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 transition cursor-pointer"
            >
              <i className="fas fa-bolt mr-1.5" />
              {spinSpeed === "turbo"
                ? (isEs ? "Velocidad Normal" : "Normal Speed")
                : (isEs ? "¡Modo Turbo OIIA!" : "Turbo OIIA Mode!")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setComfortHearts((c) => c + 1);
                playCatEasterEggSound("crying", soundEnabled);
              }}
              className="flex-1 min-w-[130px] py-2.5 px-3 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 hover:brightness-110 text-white font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 transition cursor-pointer"
            >
              <i className="fas fa-heart mr-1.5" />
              {isEs ? `Consolar (${comfortHearts})` : `Comfort (${comfortHearts})`}
            </button>
          )}

          <button
            type="button"
            onClick={() => onSwitchEgg(activeEgg === "spinning" ? "crying" : "spinning")}
            className="flex-1 min-w-[130px] py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/15 text-zinc-100 font-bold text-xs uppercase tracking-wider active:scale-95 transition cursor-pointer"
          >
            <i className={`fas ${activeEgg === "spinning" ? "fa-droplet text-sky-400" : "fa-rotate text-amber-400"} mr-1.5`} />
            {activeEgg === "spinning"
              ? (isEs ? "Ver Gato Llorando" : "See Crying Cat")
              : (isEs ? "Ver Gato Girando" : "See Spinning Cat")}
          </button>
        </div>
      </div>
    </div>
  );
};
