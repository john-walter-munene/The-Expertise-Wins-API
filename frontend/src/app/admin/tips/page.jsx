// frontend/src/app/admin/tips/page.jsx
"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { adminApi } from "../../../api/admin.api";
import { productsApi } from "../../../api/products.api";
import { formatOdds, formatDate, outcomeColor, statusColor } from "../../../lib/utils";
import toast from "react-hot-toast";
import { Trophy, Plus, Search, Filter, CheckCircle, XCircle, Edit, Trash2, Send, Layers, Package } from "lucide-react";
import Modal from "../../../components/Modal";

const TIP_TIER_PRIORITY = { MAXBET: 0, VIP: 1, FREE: 2, UNASSIGNED: 3 };
const SETTLEMENT_OUTCOMES = [
  ["WON", "WON"],
  ["HALF_WON", "HALF WON"],
  ["LOST", "LOST"],
  ["HALF_LOST", "HALF LOST"],
  ["VOID", "VOID (Stake Returned)"],
  ["PUSH", "PUSH (Stake Returned)"],
  ["CANCELLED", "CANCELLED"],
];

function normalizeSettlementOutcome(outcome) {
  const value = String(outcome || "").trim().toUpperCase();
  if (value === "WIN") return "WON";
  if (value === "LOSE") return "LOST";
  return SETTLEMENT_OUTCOMES.some(([key]) => key === value) ? value : "";
}

function getTipTiers(tip) {
  const publishedTiers = (tip.publications || [])
    .map((publication) => String(publication.product?.slug || "").toUpperCase())
    .filter((slug) => ["MAXBET", "VIP", "FREE"].includes(slug));
  if (publishedTiers.length) return [...new Set(publishedTiers)];

  const title = `${tip.competition || ""} ${tip.previewTitle || ""}`.toLowerCase();
  if (tip.isFeatured || /bet of the day/.test(title)) return ["MAXBET"];
  if (["football", "soccer"].includes(String(tip.sport || "").toLowerCase())) return ["FREE"];
  if (tip.sport) return ["VIP"];
  return ["UNASSIGNED"];
}

function getTipTierRank(tip) {
  return Math.min(...getTipTiers(tip).map((tier) => TIP_TIER_PRIORITY[tier]));
}

function toJsonField(value) {
  return value == null ? "" : JSON.stringify(value, null, 2);
}

export default function AdminTipsPage() {
  const [tips, setTips] = useState([]);
  const [products, setProducts] = useState([]);
  const [sportFilter, setSportFilter] = useState("ALL");
  const [tierFilter, setTierFilter] = useState("ALL");
  // Filter and selection state
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState("today");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedTipIds, setSelectedTipIds] = useState([]);

  // Create Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    teams: "",
    homeTeam: "",
    awayTeam: "",
    sport: "Football",
    competition: "",
    market: "Match Winner",
    selection: "1",
    odds: 1.85,
    kickoff: "",
  });

  // Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);

  // Settle Modal State
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [targetTip, setTargetTip] = useState(null);
  const [settleOutcome, setSettleOutcome] = useState("WON");
  const [settleSelections, setSettleSelections] = useState([]);

  // Publication Assignment Modal State
  const [pubModalOpen, setPubModalOpen] = useState(false);
  const [pubTip, setPubTip] = useState(null);
  const [selectedProdId, setSelectedProdId] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tipsRes, prodRes] = await Promise.allSettled([
        adminApi.getTips({ day: selectedDay, limit: 100 }),
        productsApi.getProducts(),
      ]);

      if (tipsRes.status === "fulfilled") {
        const list = tipsRes.value?.tips || tipsRes.value?.data || tipsRes.value || [];
        setTips(Array.isArray(list) ? [...list].sort((a, b) =>
          getTipTierRank(a) - getTipTierRank(b) ||
          new Date(b.scrapedAt || b.createdAt || 0) - new Date(a.scrapedAt || a.createdAt || 0)
        ) : []);
      }
      if (prodRes.status === "fulfilled") {
        const pList = prodRes.value?.products || prodRes.value?.data || prodRes.value || [];
        setProducts(Array.isArray(pList) ? pList : []);
      }
    } catch (err) {
      toast.error("Failed loading admin tips list");
    } finally {
      setLoading(false);
    }
  }, [selectedDay]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateTip = async (e) => {
    e.preventDefault();
    try {
      let homeTeam = createForm.homeTeam;
      let awayTeam = createForm.awayTeam;
      if (!homeTeam && !awayTeam && createForm.teams) {
        const parts = createForm.teams.split(/\s+(?:vs\.?|v|-)\s+/i);
        if (parts.length >= 2) {
          homeTeam = parts[0].trim();
          awayTeam = parts[1].trim();
        } else {
          homeTeam = createForm.teams.trim();
        }
      }

      // `teams` is a form-only helper for the team input; the API schema is
      // strict, so send only the fields the admin tip endpoint accepts.
      const { teams: _teams, homeTeam: _homeTeam, awayTeam: _awayTeam, ...formFields } = createForm;

      await adminApi.createTip({
        ...formFields,
        source: createForm.source || "MANUAL",
        homeTeam: homeTeam || undefined,
        awayTeam: awayTeam || undefined,
        odds: Number(createForm.odds) || 1.85,
        competition: createForm.competition || undefined,
        kickoff: createForm.kickoff || undefined,
      });
      toast.success("Tip created successfully");
      setCreateModalOpen(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed creating tip");
    }
  };

  const handleUpdateTipSubmit = async (e) => {
    e.preventDefault();
    if (!editForm) return;
    try {
      let homeTeam = editForm.homeTeam;
      let awayTeam = editForm.awayTeam;
      if (editForm.teams && (!homeTeam || !awayTeam)) {
        const parts = editForm.teams.split(/\s+(?:vs\.?|v|-)\s+/i);
        if (parts.length >= 2) {
          homeTeam = parts[0].trim();
          awayTeam = parts[1].trim();
        }
      }

      const parseJsonField = (value, label) => {
        try {
          return value.trim() ? JSON.parse(value) : null;
        } catch {
          throw new Error(`${label} must contain valid JSON.`);
        }
      };

      const payload = {
        source: editForm.source || "MANUAL",
        externalId: editForm.externalId || null,
        sport: editForm.sport,
        competition: editForm.competition || null,
        league: editForm.league || null,
        country: editForm.country || null,
        homeTeam: homeTeam || null,
        awayTeam: awayTeam || null,
        kickoff: editForm.kickoff || null,
        market: editForm.market,
        selection: editForm.selection,
        odds: editForm.odds === "" || editForm.odds == null ? null : Number(editForm.odds),
        stakeUnits: editForm.stakeUnits === "" || editForm.stakeUnits == null ? null : Number(editForm.stakeUnits),
        previewTitle: editForm.previewTitle || null,
        preview: editForm.preview || null,
        verdict: editForm.verdict || null,
        tips: parseJsonField(editForm.tipsJson, "Selections"),
        analytics: parseJsonField(editForm.analyticsJson, "Analytics"),
        confidenceIndex: editForm.confidenceIndex === "" || editForm.confidenceIndex == null ? null : Number(editForm.confidenceIndex),
        predictedScore: editForm.predictedScore || null,
        detailsUrl: editForm.detailsUrl || null,
        status: editForm.status,
        result: editForm.result || null,
        outcome: editForm.outcome,
        extraTips: parseJsonField(editForm.extraTipsJson, "Extra selections"),
      };

      await adminApi.updateTip(editForm.id, payload);
      toast.success("Tip updated successfully");
      setEditModalOpen(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed updating tip");
    }
  };

  const handlePublish = async (id) => {
    try {
      await adminApi.publishTip(id);
      toast.success("Tip published");
      loadData();
    } catch {
      toast.error("Failed publishing tip");
    }
  };

  const handleUnpublish = async (id) => {
    try {
      await adminApi.unpublishTip(id);
      toast.success("Tip unpublished");
      loadData();
    } catch {
      toast.error("Failed unpublishing tip");
    }
  };

  const handleCancelTip = async (id) => {
    try {
      await adminApi.cancelTip(id);
      toast.success("Tip cancelled");
      loadData();
    } catch {
      toast.error("Failed cancelling tip");
    }
  };

  const handleSettleSubmit = async (e) => {
    e.preventDefault();
    if (!targetTip) return;
    if (settleSelections.some((outcome) => !outcome)) {
      toast.error("Choose an outcome for every selection before saving.");
      return;
    }
    try {
      const payload = { outcome: settleOutcome };
      if (settleSelections.length) payload.selectionOutcomes = settleSelections;
      await adminApi.settleTip(targetTip.id, payload);
      toast.success(`Tip and ${settleSelections.length} selection${settleSelections.length === 1 ? "" : "s"} settled`);
      setSettleModalOpen(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed settling tip");
    }
  };

  const openSettleTip = (tip) => {
    setTargetTip(tip);
    setSettleOutcome(normalizeSettlementOutcome(tip.result?.outcome || tip.outcome) || "WON");
    setSettleSelections(Array.isArray(tip.tips)
      ? tip.tips.map((selection) => normalizeSettlementOutcome(selection?.outcome))
      : []);
    setSettleModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this tip?")) return;
    try {
      await adminApi.deleteTip(id);
      toast.success("Tip deleted");
      loadData();
    } catch {
      toast.error("Failed deleting tip");
    }
  };

  // Publication Assignment
  const handleAssignPublication = async (e) => {
    e.preventDefault();
    if (!pubTip || !selectedProdId) return;
    try {
      await adminApi.publishTipToProduct(pubTip.id, selectedProdId);
      toast.success("Tip published to product tier!");
      setPubModalOpen(false);
      loadData();
    } catch {
      toast.error("Failed assigning tip publication");
    }
  };

  const handleRemovePublication = async (tipId, prodId) => {
    try {
      await adminApi.removeTipPublication(tipId, prodId);
      toast.success("Publication assignment removed");
      loadData();
    } catch {
      toast.error("Failed removing publication");
    }
  };

  // Bulk Operations
  const handleBulkPublish = async () => {
    if (selectedTipIds.length === 0) return;
    try {
      await adminApi.publishTipsBulk(selectedTipIds);
      toast.success(`Published ${selectedTipIds.length} tips`);
      setSelectedTipIds([]);
      loadData();
    } catch {
      toast.error("Bulk publish failed");
    }
  };

  const handleBulkUnpublish = async () => {
    if (selectedTipIds.length === 0) return;
    try {
      await adminApi.unpublishTipsBulk(selectedTipIds);
      toast.success(`Unpublished ${selectedTipIds.length} tips`);
      setSelectedTipIds([]);
      loadData();
    } catch {
      toast.error("Bulk unpublish failed");
    }
  };

  const handleBulkSettle = async () => {
    if (selectedTipIds.length === 0) return;
    try {
      await adminApi.settleTipsBulk({ tipIds: selectedTipIds, outcome: "WON" });
      toast.success(`Settled ${selectedTipIds.length} tips as WON`);
      setSelectedTipIds([]);
      loadData();
    } catch {
      toast.error("Bulk settle failed");
    }
  };

  const handleBulkCancel = async () => {
    if (selectedTipIds.length === 0) return;
    try {
      await adminApi.cancelTipsBulk(selectedTipIds);
      toast.success(`Cancelled ${selectedTipIds.length} tips`);
      setSelectedTipIds([]);
      loadData();
    } catch {
      toast.error("Bulk cancel failed");
    }
  };

  const toggleSelectAll = () => {
    if (selectedTipIds.length === filteredTips.length) {
      setSelectedTipIds([]);
    } else {
      setSelectedTipIds(filteredTips.map((t) => t.id));
    }
  };

  const toggleSelectTip = (id) => {
    setSelectedTipIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const filteredTips = tips.filter((t) => {
    const matchStr = `${t.teams || ""} ${t.homeTeam || ""} ${t.awayTeam || ""} ${t.competition || ""} ${t.selection || ""}`.toLowerCase();
    const matchesSearch = matchStr.includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || (t.status || "PUBLISHED") === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openEditTip = (tip) => {
    setEditForm({
      ...tip,
      teams: tip.teams || [tip.homeTeam, tip.awayTeam].filter(Boolean).join(" vs "),
      tipsJson: toJsonField(tip.tips),
      extraTipsJson: toJsonField(tip.extraTips),
      analyticsJson: toJsonField(tip.analytics),
    });
    setEditModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 flex items-center gap-2">
            <Trophy className="w-6 h-6 text-cyan-400" />
            Tips & Curation Management Engine
          </h1>
          <p className="text-slate-400 text-xs">Create, edit, publish, settle, cancel, or assign product publications.</p>
        </div>

        <button
          onClick={() => setCreateModalOpen(true)}
          className="px-4 py-2 bg-cyan-gradient text-slate-950 text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 self-start"
        >
          <Plus className="w-4 h-4" />
          <span>New Tip (`createTip`)</span>
        </button>
      </div>

      {/* Filter & Bulk Control Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-dark-card border border-dark-border p-4 rounded-2xl">
        <div className="flex items-center gap-3">
          <label className="sr-only" htmlFor="tip-day-filter">Tip date</label>
          <select
            id="tip-day-filter"
            value={selectedDay}
            onChange={(event) => { setSelectedTipIds([]); setSelectedDay(event.target.value); }}
            className="px-3 py-2 bg-dark-bg border border-dark-border rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="today">Today&apos;s tips</option>
            <option value="yesterday">Yesterday&apos;s tips</option>
          </select>
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              placeholder="Filter teams, selection..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3.5 py-2 bg-dark-bg border border-dark-border rounded-xl text-xs text-slate-100 focus:outline-none focus:border-cyan-500 pl-9"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-dark-bg border border-dark-border rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="PUBLISHED">PUBLISHED</option>
            <option value="SETTLED">SETTLED</option>
            <option value="PENDING">PENDING</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>

        {selectedTipIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 bg-dark-bg px-3 py-1.5 rounded-xl border border-dark-border">
            <span className="text-xs font-bold text-cyan-400">{selectedTipIds.length} Selected</span>
            <button
              onClick={handleBulkPublish}
              className="px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[11px] font-bold hover:bg-emerald-500/20"
            >
              Bulk Publish
            </button>
            <button
              onClick={handleBulkUnpublish}
              className="px-2 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-[11px] font-bold hover:bg-amber-500/20"
            >
              Bulk Unpublish
            </button>
            <button
              onClick={handleBulkSettle}
              className="px-2 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded text-[11px] font-bold hover:bg-indigo-500/20"
            >
              Bulk Settle (WON)
            </button>
            <button
              onClick={handleBulkCancel}
              className="px-2 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded text-[11px] font-bold hover:bg-rose-500/20"
            >
              Bulk Cancel
            </button>
          </div>
        )}
      </div>

      {/* Tips Table */}
      <div className="bg-dark-card border border-dark-border rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-xs">Loading tips...</div>
        ) : filteredTips.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-dark-bg text-slate-400 uppercase text-[10px] tracking-wider border-b border-dark-border">
                <tr>
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={selectedTipIds.length === filteredTips.length && filteredTips.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-4 py-3">Match / Teams</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3">Selection</th>
                  <th className="px-4 py-3">Odds</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border text-slate-300">
                {filteredTips.map((t) => (
                  <tr key={t.id} className="hover:bg-dark-hover">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedTipIds.includes(t.id)}
                        onChange={() => toggleSelectTip(t.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-100">{t.teams || `${t.homeTeam} vs ${t.awayTeam}`}</div>
                      <div className="text-[10px] text-slate-400">{t.sport} • {t.competition}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {getTipTiers(t).map((tier) => (
                          <span key={tier} className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
                            tier === "MAXBET" ? "border-amber-500/30 bg-amber-500/10 text-amber-300" :
                            tier === "VIP" ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-300" :
                            tier === "FREE" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" :
                            "border-slate-700 text-slate-400"
                          }`}>{tier === "VIP" ? "PIKK BETTER VIP" : tier}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-cyan-400">{t.selection}</div>
                      <div className="text-[10px] text-slate-400">{t.market}</div>
                    </td>
                    <td className="px-4 py-3 font-bold text-amber-400">@{formatOdds(t.odds)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusColor(t.status)}`}>
                        {t.status || "PUBLISHED"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {t.result?.outcome || t.outcome ? (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${outcomeColor(t.result?.outcome || t.outcome)}`}>
                          {t.result?.outcome || t.outcome}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <button
                        onClick={() => {
                          openEditTip(t);
                        }}
                        className="p-1 text-slate-400 hover:text-cyan-400 transition-colors"
                        title="Edit Tip"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => {
                          setPubTip(t);
                          setPubModalOpen(true);
                        }}
                        className="p-1 text-slate-400 hover:text-amber-400 transition-colors"
                        title="Assign Product Tier"
                      >
                        <Package className="w-3.5 h-3.5" />
                      </button>

                      {t.status === "PUBLISHED" ? (
                        <button
                          onClick={() => handleUnpublish(t.id)}
                          className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-[10px] font-semibold hover:bg-amber-500/20"
                        >
                          Unpublish
                        </button>
                      ) : (
                        <button
                          onClick={() => handlePublish(t.id)}
                          className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[10px] font-semibold hover:bg-emerald-500/20"
                        >
                          Publish
                        </button>
                      )}

                      <button
                        onClick={() => openSettleTip(t)}
                        className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded text-[10px] font-semibold hover:bg-indigo-500/20"
                      >
                        Settle
                      </button>

                      <button
                        onClick={() => handleDelete(t.id)}
                        className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                        title="Delete Tip"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 text-xs">No tips found.</div>
        )}
      </div>

      {/* Create Tip Modal */}
      <Modal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Create New Betting Tip (`createTip`)">
        <form onSubmit={handleCreateTip} className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-400 font-semibold mb-1">Teams / Match *</label>
            <input
              type="text"
              required
              placeholder="Arsenal vs Chelsea"
              value={createForm.teams}
              onChange={(e) => setCreateForm({ ...createForm, teams: e.target.value })}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-xl text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Sport</label>
              <input
                type="text"
                value={createForm.sport}
                onChange={(e) => setCreateForm({ ...createForm, sport: e.target.value })}
                className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-xl text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Competition</label>
              <input
                type="text"
                placeholder="Premier League"
                value={createForm.competition}
                onChange={(e) => setCreateForm({ ...createForm, competition: e.target.value })}
                className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-xl text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Market</label>
              <input
                type="text"
                value={createForm.market}
                onChange={(e) => setCreateForm({ ...createForm, market: e.target.value })}
                className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-xl text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Selection *</label>
              <input
                type="text"
                required
                placeholder="Arsenal to Win"
                value={createForm.selection}
                onChange={(e) => setCreateForm({ ...createForm, selection: e.target.value })}
                className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-xl text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Odds *</label>
              <input
                type="number"
                step="0.01"
                required
                value={createForm.odds}
                onChange={(e) => setCreateForm({ ...createForm, odds: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-xl text-slate-100"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-cyan-gradient text-slate-950 font-bold rounded-xl transition-all shadow-md mt-2"
          >
            Create Tip Now
          </button>
        </form>
      </Modal>

      {/* Edit Tip Modal */}
      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Tip Details">
        {editForm && (
          <form onSubmit={handleUpdateTipSubmit} className="max-h-[75vh] space-y-4 overflow-y-auto px-1 text-xs">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                ["source", "Source"], ["sport", "Sport"], ["competition", "Competition"],
                ["league", "League"], ["country", "Country"], ["teams", "Teams / Match"],
                ["kickoff", "Kickoff"], ["market", "Market"], ["selection", "Selection"],
                ["odds", "Odds"], ["stakeUnits", "Stake (units)"], ["previewTitle", "Preview title"],
                ["predictedScore", "Predicted score"], ["confidenceIndex", "Confidence index"],
                ["detailsUrl", "Details URL"], ["externalId", "External ID"],
              ].map(([field, label]) => (
                <label key={field} className="space-y-1 text-slate-400">
                  <span className="block font-semibold">{label}</span>
                  <input
                    type={field === "odds" || field === "stakeUnits" || field === "confidenceIndex" ? "number" : "text"}
                    step={field === "odds" || field === "stakeUnits" || field === "confidenceIndex" ? "0.01" : undefined}
                    value={editForm[field] ?? ""}
                    onChange={(event) => setEditForm({ ...editForm, [field]: event.target.value })}
                    className="w-full rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-slate-100"
                  />
                </label>
              ))}
              <label className="space-y-1 text-slate-400">
                <span className="block font-semibold">Status</span>
                <select value={editForm.status || "PENDING"} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })} className="w-full rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-slate-100">
                  {["PENDING", "PUBLISHED", "SETTLED", "CANCELLED", "LOCKED"].map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-slate-400">
                <span className="block font-semibold">Outcome</span>
                <select value={editForm.outcome || "PENDING"} onChange={(event) => setEditForm({ ...editForm, outcome: event.target.value })} className="w-full rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-slate-100">
                  {["PENDING", "WON", "LOST", "VOID", "PUSH", "HALF_WON", "HALF_LOST", "CANCELLED"].map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-slate-400 sm:col-span-2">
                <span className="block font-semibold">Result / settlement note</span>
                <input value={editForm.result || ""} onChange={(event) => setEditForm({ ...editForm, result: event.target.value })} className="w-full rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-slate-100" />
              </label>
              {[["preview", "Reasoning / preview"], ["verdict", "Verdict"], ["tipsJson", "Selections JSON"], ["extraTipsJson", "Extra selections JSON"], ["analyticsJson", "Analytics JSON"]].map(([field, label]) => (
                <label key={field} className="space-y-1 text-slate-400 sm:col-span-2">
                  <span className="block font-semibold">{label}</span>
                  <textarea
                    rows={field.endsWith("Json") ? 6 : 3}
                    value={field.endsWith("Json") ? (editForm[field] ?? (field === "analyticsJson" ? "" : "[]")) : (editForm[field] || "")}
                    onChange={(event) => setEditForm({ ...editForm, [field]: event.target.value })}
                    className="w-full rounded-xl border border-dark-border bg-dark-bg px-3 py-2 font-mono text-slate-100"
                  />
                </label>
              ))}
            </div>
            <button type="submit" className="w-full rounded-xl bg-indigo-600 py-2.5 font-bold text-white shadow-md transition-all hover:bg-indigo-500">
              Save All Tip Changes
            </button>
          </form>
        )}
      </Modal>

      {/* Product Publication Modal */}
      <Modal isOpen={pubModalOpen} onClose={() => setPubModalOpen(false)} title="Assign Tip to Product Tier (`publishTipToProduct`)">
        <form onSubmit={handleAssignPublication} className="space-y-4 text-xs">
          <p className="text-slate-300">
            Assign tip <strong>{pubTip?.teams}</strong> to a specific product feed (e.g. VIP or MaxBet).
          </p>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">Select Product Tier</label>
            <select
              required
              value={selectedProdId}
              onChange={(e) => setSelectedProdId(e.target.value)}
              className="w-full px-3 py-2.5 bg-dark-bg border border-dark-border rounded-xl text-slate-100"
            >
              <option value="">Select Tier...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-md"
          >
            Publish to Product Feed
          </button>
        </form>
      </Modal>

      {/* Settle Tip Modal */}
      <Modal isOpen={settleModalOpen} onClose={() => setSettleModalOpen(false)} title="Settle Tip and Selections">
        <form onSubmit={handleSettleSubmit} className="space-y-4 text-xs">
          <p className="text-slate-300">
            Match: <strong className="text-slate-100">{targetTip?.teams || `${targetTip?.homeTeam || ""} vs ${targetTip?.awayTeam || ""}`}</strong>
          </p>

          <div>
            <label className="block text-slate-400 font-semibold mb-1.5 uppercase tracking-wider text-[10px]">
              Outcome Result
            </label>
            <select
              value={settleOutcome}
              onChange={(e) => setSettleOutcome(e.target.value)}
              className="w-full px-3 py-2.5 bg-dark-bg border border-dark-border rounded-xl text-slate-100 font-bold"
            >
              {SETTLEMENT_OUTCOMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          {Array.isArray(targetTip?.tips) && targetTip.tips.length > 0 && (
            <section className="space-y-3 rounded-xl border border-dark-border bg-dark-bg/70 p-3" aria-labelledby="settlement-selections-heading">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 id="settlement-selections-heading" className="font-bold text-slate-100">Selections in this tip</h3>
                  <p className="mt-1 text-[11px] leading-5 text-slate-400">Set an outcome for each option. All selections save together.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettleSelections(targetTip.tips.map(() => settleOutcome))}
                  className="rounded-lg border border-indigo-400/30 bg-indigo-400/10 px-3 py-2 font-semibold text-indigo-200 hover:bg-indigo-400/20"
                >
                  Apply overall result to all
                </button>
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {targetTip.tips.map((selection, index) => (
                  <label key={`${selection.selection || selection.market || "selection"}-${index}`} className="grid gap-2 rounded-lg border border-dark-border bg-slate-900 p-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
                    <span className="min-w-0">
                      <span className="block break-words font-semibold text-slate-100">{selection.selection || selection.market || `Option ${index + 1}`}</span>
                      <span className="mt-1 block text-[10px] text-slate-400">
                        {[selection.market, selection.odds != null ? `@${selection.odds}` : null, selection.units != null ? `${selection.units} units` : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <select
                      required
                      aria-label={`Outcome for ${selection.selection || selection.market || `option ${index + 1}`}`}
                      value={settleSelections[index] || ""}
                      onChange={(event) => setSettleSelections((previous) => previous.map((value, itemIndex) => itemIndex === index ? event.target.value : value))}
                      className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2.5 font-semibold text-slate-100"
                    >
                      <option value="">Choose outcome…</option>
                      {SETTLEMENT_OUTCOMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </section>
          )}

          <button
            type="submit"
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-md"
          >
            Save Settlement Result
          </button>
        </form>
      </Modal>
    </div>
  );
}
