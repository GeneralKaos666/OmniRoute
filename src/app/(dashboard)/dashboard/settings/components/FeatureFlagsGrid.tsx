"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Search, AlertCircle, RefreshCcw } from "lucide-react";
import { FeatureFlagCard } from "./FeatureFlagCard";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function FeatureFlagsGrid() {
  const [flags, setFlags] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({
    total: 0,
    active: 0,
    inactive: 0,
    overriddenByDb: 0,
    overriddenByEnv: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [category, setCategory] = useState<string>("all");
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  const fetchFlags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/feature-flags");
      if (!res.ok) throw new Error("Failed to fetch feature flags");
      const data = await res.json();
      setFlags(data.flags);
      setSummary(data.summary);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const handleToggle = async (key: string, newValue: string) => {
    setSavingKeys((prev) => new Set(prev).add(key));
    try {
      const res = await fetch("/api/settings/feature-flags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: newValue }),
      });
      if (res.ok) {
        const result = await res.json();
        setFlags((prev) =>
          prev.map((f) =>
            f.key === key
              ? { ...f, effectiveValue: result.effectiveValue, source: result.source }
              : f
          )
        );
        fetchFlags(); // Silently refresh summary stats
      }
    } finally {
      setSavingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleReset = async (key: string) => {
    setSavingKeys((prev) => new Set(prev).add(key));
    try {
      const res = await fetch("/api/settings/feature-flags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }), // no value => remove override
      });
      if (res.ok) {
        const result = await res.json();
        setFlags((prev) =>
          prev.map((f) =>
            f.key === key
              ? { ...f, effectiveValue: result.effectiveValue, source: result.source }
              : f
          )
        );
        fetchFlags();
      }
    } finally {
      setSavingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleResetAll = async () => {
    if (
      !confirm(
        "Are you sure you want to clear all DB overrides? This will revert all feature flags to their default or ENV values."
      )
    )
      return;
    try {
      const res = await fetch("/api/settings/feature-flags", { method: "DELETE" });
      if (res.ok) {
        fetchFlags();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredFlags = useMemo(() => {
    return flags
      .filter((f) => category === "all" || f.definition.category === category)
      .filter(
        (f) =>
          debouncedSearch === "" ||
          f.key.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          f.definition.description.toLowerCase().includes(debouncedSearch.toLowerCase())
      );
  }, [flags, debouncedSearch, category]);

  const categories = ["all", "security", "network", "policies", "runtime", "cli", "health"];

  if (loading && flags.length === 0) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 bg-white/5 rounded-xl"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-40 bg-white/5 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border border-red-500/20 rounded-xl bg-red-500/5">
        <AlertCircle size={48} className="text-red-500 mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">Failed to load feature flags</h3>
        <p className="text-gray-400 mb-4">{error}</p>
        <button
          onClick={fetchFlags}
          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded font-medium transition"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-white/5 rounded-xl border border-white/10">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Feature Flags</h1>
          <div className="text-sm text-gray-400 flex items-center space-x-2">
            <span className="text-green-400 font-medium">{summary.active} active</span>
            <span>&middot;</span>
            <span className="text-gray-500 font-medium">{summary.inactive} inactive</span>
            <span>&middot;</span>
            <span className="text-blue-400 font-medium">{summary.overriddenByDb} DB overrides</span>
          </div>
        </div>

        <div className="flex items-center space-x-3 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search flags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-black/50 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full md:w-48 px-3 py-2 bg-black/50 border border-white/10 rounded-lg text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition capitalize"
          >
            {categories.map((c) => {
              const count =
                c === "all"
                  ? flags.length
                  : flags.filter((f) => f.definition.category === c).length;
              return (
                <option key={c} value={c}>
                  {c === "all" ? "All Categories" : c} ({count})
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Grid */}
      {filteredFlags.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 border border-white/5 rounded-xl bg-white/[0.02]">
          <Search size={48} className="text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-white mb-1">No flags found</h3>
          <p className="text-gray-400">No flags match your current search and filter criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFlags.map((flag) => (
            <FeatureFlagCard
              key={flag.key}
              flag={{
                key: flag.key,
                label: flag.definition.label,
                description: flag.definition.description,
                category: flag.definition.category,
                type: flag.definition.type,
                enumValues: flag.definition.enumValues,
                effectiveValue: flag.effectiveValue,
                source: flag.source,
                requiresRestart: flag.definition.requiresRestart,
                warningLevel: flag.definition.warningLevel,
              }}
              onToggle={handleToggle}
              onReset={handleReset}
              saving={savingKeys.has(flag.key)}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      {summary.overriddenByDb > 0 && (
        <div className="pt-8 flex justify-end">
          <button
            onClick={handleResetAll}
            className="flex items-center px-4 py-2 text-sm font-medium text-red-400 hover:text-white border border-red-500/50 hover:bg-red-500/20 rounded-lg transition"
          >
            <RefreshCcw size={16} className="mr-2" />
            Reset All Overrides
          </button>
        </div>
      )}
    </div>
  );
}
