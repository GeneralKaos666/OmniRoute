import React from "react";
import { AlertTriangle, Loader2, RefreshCw, RotateCcw } from "lucide-react";

interface FeatureFlagCardProps {
  flag: {
    key: string;
    label: string;
    description: string;
    category: "security" | "network" | "policies" | "runtime" | "cli" | "health";
    type: "boolean" | "enum";
    enumValues?: string[];
    effectiveValue: string;
    source: "db" | "env" | "default";
    requiresRestart: boolean;
    warningLevel?: "info" | "caution" | "danger";
  };
  onToggle: (key: string, newValue: string) => void;
  onReset: (key: string) => void;
  saving?: boolean;
}

const categoryStyles = {
  security: "bg-red-500/15 text-red-500",
  network: "bg-blue-500/15 text-blue-500",
  policies: "bg-amber-500/15 text-amber-500",
  runtime: "bg-purple-500/15 text-purple-500",
  cli: "bg-green-500/15 text-green-500",
  health: "bg-cyan-500/15 text-cyan-500",
};

const sourceBadgeConfig = {
  db: { label: "DB", className: "bg-blue-500/20 text-blue-400" },
  env: { label: "ENV", className: "bg-amber-500/20 text-amber-400" },
  default: { label: "DEF", className: "bg-slate-500/20 text-slate-400" },
};

export const FeatureFlagCard: React.FC<FeatureFlagCardProps> = ({
  flag,
  onToggle,
  onReset,
  saving = false,
}) => {
  const isEnabled =
    flag.effectiveValue === "true" || flag.effectiveValue === "1" || flag.effectiveValue === "yes";

  // Base glassmorphism + hover + active states
  let cardClass = `feature-flag-card relative flex flex-col justify-between p-4 rounded-xl border bg-black/40 backdrop-blur-md transition-all duration-200 group`;

  if (flag.type === "boolean") {
    cardClass += isEnabled
      ? " border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.08)] hover:border-green-500/50 -translate-y-[1px]"
      : " border-white/10 opacity-80 hover:border-white/20";
  } else {
    cardClass += " border-white/10 hover:border-white/20";
  }

  const handleToggle = () => {
    if (saving) return;
    const newValue = isEnabled ? "false" : "true";
    onToggle(flag.key, newValue);
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (saving) return;
    onToggle(flag.key, e.target.value);
  };

  return (
    <div
      className={cardClass}
      role="group"
      aria-label={flag.description}
      data-enabled={flag.type === "boolean" ? isEnabled.toString() : "neutral"}
    >
      <div>
        <div className="flex items-center justify-between mb-3">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${categoryStyles[flag.category]}`}
            aria-label={`Category: ${flag.category}`}
          >
            {flag.category}
          </span>

          <div className="flex items-center space-x-2">
            {flag.requiresRestart && (
              <span
                className="flex items-center text-[10px] uppercase font-bold text-amber-500/70"
                title="Restart required to apply changes"
              >
                <RefreshCw size={10} className="mr-1" /> Restart
              </span>
            )}
            {flag.type === "boolean" ? (
              <button
                type="button"
                role="switch"
                aria-checked={isEnabled}
                aria-label={flag.label}
                disabled={saving}
                onClick={handleToggle}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 ${isEnabled ? "bg-green-500" : "bg-gray-600"} ${saving ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <span className="sr-only">Toggle {flag.label}</span>
                {saving && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Loader2 size={12} className="animate-spin text-white" />
                  </span>
                )}
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${isEnabled ? "translate-x-4" : "translate-x-0"}`}
                />
              </button>
            ) : (
              <div className="relative">
                {saving && (
                  <span className="absolute -left-5 top-1/2 -translate-y-1/2">
                    <Loader2 size={12} className="animate-spin text-gray-400" />
                  </span>
                )}
                <select
                  value={flag.effectiveValue}
                  onChange={handleSelectChange}
                  disabled={saving}
                  className="bg-gray-800 text-xs border border-gray-700 rounded px-2 py-1 outline-none focus:border-blue-500"
                >
                  {flag.enumValues?.map((val) => (
                    <option key={val} value={val}>
                      {val}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2 mb-1">
          <h3
            className="font-mono text-[13px] font-semibold text-gray-200 truncate"
            title={flag.key}
          >
            {flag.key}
          </h3>
          {flag.warningLevel === "caution" && (
            <AlertTriangle size={14} className="text-amber-500" />
          )}
          {flag.warningLevel === "danger" && (
            <AlertTriangle size={14} className="text-red-500 animate-pulse" />
          )}
        </div>

        <p
          className="text-xs text-gray-400 line-clamp-2 leading-relaxed h-8"
          title={flag.description}
        >
          {flag.description}
        </p>
      </div>

      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-[10px] text-gray-500 uppercase">Source:</span>
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sourceBadgeConfig[flag.source].className}`}
          >
            {sourceBadgeConfig[flag.source].label}
          </span>
        </div>

        {flag.source === "db" && (
          <button
            onClick={() => onReset(flag.key)}
            disabled={saving}
            className="text-[10px] text-gray-400 hover:text-white flex items-center space-x-1 transition-colors px-2 py-1 rounded bg-white/5 hover:bg-white/10"
            aria-label="Reset to default"
          >
            <RotateCcw size={10} />
            <span>Reset</span>
          </button>
        )}
      </div>
    </div>
  );
};
