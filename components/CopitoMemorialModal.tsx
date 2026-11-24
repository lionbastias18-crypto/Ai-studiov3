import React, { useEffect, useState } from "react";

interface CopitoMemorialModalProps {
  isOpen: boolean;
  lang: string;
  soundEnabled?: boolean;
  onClose: () => void;
}

const STORAGE_KEY_CANDLES = "copito_memorial_candles_v1";
const STORAGE_KEY_FLOWERS = "copito_memorial_flowers_v1";
const STORAGE_KEY_NOTE = "copito_memorial_note_v1";
const STORAGE_KEY_CANDLE_LIT = "copito_memorial_candle_lit_v1";

function playGentleMemorialChime(soundEnabled: boolean) {
  if (!soundEnabled || typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes = [392.0, 493.88, 587.33, 783.99];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      const t = now + idx * 0.16;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.06, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.75);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.78);
    });
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1800);
  } catch {
    // Ignore autoplay errors cleanly
  }
}

export const CopitoMemorialModal: React.FC<CopitoMemorialModalProps> = ({
  isOpen,
  lang,
  soundEnabled = true,
  onClose,
}) => {
  const [candleLit, setCandleLit] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_CANDLE_LIT) === "1";
    } catch {
      return false;
    }
  });
  const [candlesCount, setCandlesCount] = useState<number>(() => {
    try {
      const saved = parseInt(localStorage.getItem(STORAGE_KEY_CANDLES) || "1", 10);
      return Number.isFinite(saved) && saved >= 1 ? saved : 1;
    } catch {
      return 1;
    }
  });
  const [flowersCount, setFlowersCount] = useState<number>(() => {
    try {
      const saved = parseInt(localStorage.getItem(STORAGE_KEY_FLOWERS) || "0", 10);
      return Number.isFinite(saved) && saved >= 0 ? saved : 0;
    } catch {
      return 0;
    }
  });
  const [savedNote, setSavedNote] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_NOTE) || "";
    } catch {
      return "";
    }
  });
  const [noteInput, setNoteInput] = useState<string>("");
  const [floatingMoment, setFloatingMoment] = useState<number>(0);

  useEffect(() => {
    if (!isOpen) return;
    setNoteInput(savedNote);
    playGentleMemorialChime(soundEnabled);
  }, [isOpen, soundEnabled, savedNote]);

  if (!isOpen) return null;

  const isEs = lang === "es";

  const handleLightCandle = () => {
    const nextCount = candlesCount + 1;
    setCandleLit(true);
    setCandlesCount(nextCount);
    setFloatingMoment((prev) => prev + 1);
    playGentleMemorialChime(soundEnabled);
    try {
      localStorage.setItem(STORAGE_KEY_CANDLE_LIT, "1");
      localStorage.setItem(STORAGE_KEY_CANDLES, String(nextCount));
    } catch {}
  };

  const handleLeaveFlower = () => {
    const nextCount = flowersCount + 1;
    setFlowersCount(nextCount);
    setFloatingMoment((prev) => prev + 1);
    playGentleMemorialChime(soundEnabled);
    try {
      localStorage.setItem(STORAGE_KEY_FLOWERS, String(nextCount));
    } catch {}
  };

  const handleSaveNote = (textToSave: string) => {
    const cleaned = textToSave.trim().slice(0, 140);
    setSavedNote(cleaned);
    setNoteInput(cleaned);
    try {
      if (cleaned) {
        localStorage.setItem(STORAGE_KEY_NOTE, cleaned);
      } else {
        localStorage.removeItem(STORAGE_KEY_NOTE);
      }
    } catch {}
  };

  const quickMessages = isEs
    ? [
        "Descansa en paz, Copito 🖤",
        "Gracias por tantos momentos en JuegaGerman 🕯️",
        "Siempre en el cielo de los michis ✨",
      ]
    : [
        "Rest in peace, Copito 🖤",
        "Thank you for every JuegaGerman memory 🕯️",
        "Forever in kitty heaven ✨",
      ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEs ? "En memoria de Copito" : "In memory of Copito"}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClose}
      className="fixed inset-0 z-[100060] bg-black/88 flex flex-col items-center justify-start overflow-y-auto overscroll-contain safe-area-inset p-2.5 sm:p-6 pointer-events-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[min(30rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] overflow-y-auto my-auto rounded-3xl border border-amber-300/35 bg-gradient-to-b from-slate-950 via-zinc-950 to-stone-950 p-4 sm:p-6 shadow-[0_24px_64px_rgba(0,0,0,0.9)] flex flex-col items-center text-center gap-3 sm:gap-4"
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

        {/* Memorial Header Badge */}
        <div className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-300/40 text-amber-200 text-[10px] font-mono font-black uppercase tracking-widest flex items-center gap-1.5">
          <span>🕯️</span>
          <span>{isEs ? "En Memoria de Copito • 24 Nov 2026" : "In Memory of Copito • Nov 24, 2026"}</span>
        </div>

        {/* Copito Portrait Stage */}
        <div className="relative w-56 h-52 sm:w-64 sm:h-56 flex items-center justify-center">
          {/* Soft Starlight & Golden Halo Glow */}
          <div className="absolute inset-3 rounded-full bg-amber-400/15 blur-xl pointer-events-none" />
          <div className="absolute inset-4 rounded-full border-2 border-amber-200/35 bg-gradient-to-b from-amber-50/15 via-slate-900/75 to-zinc-950/95 shadow-inner pointer-events-none" />

          {/* Twinkling memorial stars */}
          <span className="absolute top-3 left-6 text-amber-200/85 text-xs animate-pulse">✦</span>
          <span className="absolute top-6 right-5 text-amber-100/80 text-sm animate-pulse">✧</span>
          <span className="absolute bottom-7 left-5 text-white/65 text-xs animate-pulse">✦</span>
          <span className="absolute bottom-6 right-7 text-amber-300/85 text-xs animate-pulse">★</span>

          {floatingMoment > 0 && (
            <div key={floatingMoment} className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
              <span className="absolute top-5 left-12 text-amber-300 text-lg animate-bounce">🕯️</span>
              <span className="absolute top-4 right-12 text-white text-lg animate-bounce">🤍</span>
              <span className="absolute top-1 left-1/2 -translate-x-1/2 text-amber-200 text-base animate-pulse">✨</span>
            </div>
          )}

          {/* Real Copito Photo */}
          <img
            src="./assets/aistudio/1795556568280_ae4232ab.png"
            alt="Copito - JuegaGerman"
            className="relative z-10 w-40 h-44 sm:w-44 sm:h-48 object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.95)] select-none"
          />

          {/* Lit Candle Accent beside Copito */}
          <div
            className={`absolute bottom-3 right-6 z-20 flex items-center justify-center w-9 h-9 rounded-full border shadow-lg transition-all ${
              candleLit
                ? "bg-amber-500/25 border-amber-300/70 shadow-amber-500/30 animate-pulse"
                : "bg-zinc-900/85 border-white/15"
            }`}
          >
            <span className="text-base leading-none">🕯️</span>
          </div>
        </div>

        {/* Title & Subtitle */}
        <div className="space-y-2 px-1">
          <h3 className="text-xl sm:text-2xl font-black text-white minecraft-font tracking-wide drop-shadow">
            {isEs ? "Copito (Q.E.P.D.)" : "Copito (R.I.P.)"}
          </h3>
          <p className="text-amber-300 font-mono text-[11px] font-bold uppercase tracking-wider">
            {isEs
              ? "El gatito negro de JuegaGerman • YouTube"
              : "JuegaGerman's Black Cat • YouTube"}
          </p>
          <div className="text-zinc-200 text-xs sm:text-[13px] leading-relaxed max-w-md pt-1 space-y-2 bg-zinc-900/55 border border-amber-200/15 rounded-2xl p-3.5 text-left">
            <p className="font-bold text-amber-100 text-center">
              Descansa en paz, amiguito. 🐾
            </p>
            <p>
              Gracias por haber estado siempre ahí junto a Germán, acompañándolo fielmente en cada etapa, en cada grabación y en cada momento de su vida. Fuiste mucho más que una mascota; te convertiste en parte fundamental de su hogar y de una gran familia virtual que te guardará siempre en el corazón.
            </p>
            <p className="font-semibold text-amber-100/95">
              Gracias por tantas sonrisas, por tu compañía incondicional y por dejar una huella imborrable. Jamás te olvidaremos. 🖤
            </p>
          </div>
        </div>

        {/* Interactive Tribute Counters & Buttons */}
        <div className="w-full grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleLightCandle}
            className="py-2.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-300/45 text-amber-100 font-bold text-xs uppercase tracking-wider cursor-pointer active:scale-95 transition flex flex-col items-center justify-center gap-0.5"
          >
            <span className="flex items-center gap-1.5">
              <span>🕯️</span>
              <span>{isEs ? "Encender Vela" : "Light Candle"}</span>
            </span>
            <span className="text-[10px] font-mono text-amber-300">
              {candlesCount} {isEs ? (candlesCount === 1 ? "vela" : "velas") : (candlesCount === 1 ? "candle" : "candles")}
            </span>
          </button>

          <button
            type="button"
            onClick={handleLeaveFlower}
            className="py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/20 text-zinc-100 font-bold text-xs uppercase tracking-wider cursor-pointer active:scale-95 transition flex flex-col items-center justify-center gap-0.5"
          >
            <span className="flex items-center gap-1.5">
              <span>🤍</span>
              <span>{isEs ? "Dejar Recuerdo" : "Leave Tribute"}</span>
            </span>
            <span className="text-[10px] font-mono text-zinc-400">
              {flowersCount} {isEs ? (flowersCount === 1 ? "flor" : "flores") : (flowersCount === 1 ? "flower" : "flowers")}
            </span>
          </button>
        </div>

        {/* Dedicated Memory Message */}
        <div className="w-full rounded-2xl bg-zinc-900/75 border border-white/10 p-3 text-left space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300 font-bold">
              {isEs ? "Tu dedicatoria para Copito" : "Your dedication for Copito"}
            </span>
            {savedNote && (
              <span className="text-[9px] font-mono text-emerald-400">
                {isEs ? "Guardado" : "Saved"}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {quickMessages.map((msg) => (
              <button
                key={msg}
                type="button"
                onClick={() => handleSaveNote(msg)}
                className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-[10px] text-zinc-200 cursor-pointer transition"
              >
                {msg}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            <input
              type="text"
              value={noteInput}
              maxLength={140}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSaveNote(noteInput);
                }
              }}
              placeholder={isEs ? "Escribe un recuerdo bonito..." : "Write a fond memory..."}
              className="flex-1 min-w-0 bg-zinc-950 border border-white/15 focus:border-amber-400/70 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-zinc-500 outline-none"
            />
            <button
              type="button"
              onClick={() => handleSaveNote(noteInput)}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wider cursor-pointer active:scale-95 transition shrink-0"
            >
              {isEs ? "Guardar" : "Save"}
            </button>
          </div>

          {savedNote && (
            <p className="text-xs text-amber-100/95 italic bg-amber-500/10 border border-amber-300/25 rounded-xl px-3 py-2">
              “{savedNote}”
            </p>
          )}
        </div>

        {/* Footer Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/15 text-white font-bold text-xs uppercase tracking-wider cursor-pointer active:scale-95 transition"
        >
          {isEs ? "Volver al Menú" : "Back to Menu"}
        </button>
      </div>
    </div>
  );
};
