// Simville Village Agents — per-village LLM/baseline routing for interactive UI
// Mirrors headless BenchmarkRunner dual-agent wiring with isolated LLM clients.

/**
 * Manages Agent A / Agent B for the two rival villages in interactive mode.
 * Each LLM agent gets its own LLMManager instance and messageHistory (no shared bleed).
 */
class VillageAgents {
  /**
   * Create an empty agent registry keyed by village id.
   */
  constructor() {
    // villageId → agent object (baseline or { type:'llm', llm, stats, name })
    this.agents = {};
    // villageId → { slot, type, name, model, endpoint }
    this.meta = {};
    // Last normalized slot configs used for setup
    this.normalized = null;
  }

  /**
   * Build one agent from a slot config (llm | baseline | heuristic).
   * Reuses BenchmarkRunner.createAgent when available for parity with headless.
   * @param {object} agentConfig
   * @returns {object}
   */
  static createAgent(agentConfig = {}) {
    // Prefer shared factory so UI and CLI stay aligned
    if (typeof BenchmarkRunner !== 'undefined' && BenchmarkRunner.createAgent) {
      return BenchmarkRunner.createAgent(agentConfig);
    }

    // Fallback when benchmark module is not loaded (unit tests of this class alone)
    if (agentConfig.type === 'baseline' || agentConfig.type === 'heuristic') {
      return new BaselineAgent({
        name: agentConfig.name || 'baseline-heuristic',
        strategy: agentConfig.strategy || 'default'
      });
    }

    // Fresh LLMManager — never reuse the global `llm` singleton
    const manager = new LLMManager();
    manager.config = {
      llm: {
        endpoint: agentConfig.endpoint || '',
        model: agentConfig.model || 'gpt-4o-mini',
        apiKey: agentConfig.apiKey || '',
        maxTokens: agentConfig.maxTokens || 500,
        temperature: agentConfig.temperature ?? 0.8
      }
    };
    return {
      type: 'llm',
      name: agentConfig.name || agentConfig.model || 'llm-agent',
      llm: manager,
      stats: {
        calls: 0,
        diplomacyCalls: 0,
        failures: 0,
        actionsGenerated: 0,
        actionsApplied: 0,
        totalLatencyMs: 0
      }
    };
  }

  /**
   * Fill missing llm fields from a legacy shared llm config blob.
   * @param {object} slot
   * @param {object} legacyLlm
   * @param {string} slotLabel
   * @returns {object}
   */
  static normalizeOne(slot = {}, legacyLlm = {}, slotLabel = 'A') {
    const type = (slot.type || 'llm').toLowerCase();
    if (type === 'baseline' || type === 'heuristic') {
      return {
        type: 'baseline',
        name: slot.name || `baseline-${slotLabel.toLowerCase()}`,
        strategy: slot.strategy || 'balanced'
      };
    }

    // LLM slot: prefer explicit fields, then fall back to legacy single-llm settings
    return {
      type: 'llm',
      name: slot.name || slot.model || legacyLlm.model || `llm-agent-${slotLabel.toLowerCase()}`,
      endpoint: slot.endpoint ?? legacyLlm.endpoint ?? '',
      model: slot.model ?? legacyLlm.model ?? 'gpt-4o-mini',
      apiKey: slot.apiKey ?? legacyLlm.apiKey ?? '',
      maxTokens: slot.maxTokens ?? legacyLlm.maxTokens ?? 500,
      temperature: slot.temperature ?? legacyLlm.temperature ?? 0.8
    };
  }

  /**
   * Resolve Agent A/B configs with backward-compatible legacy llm handling.
   *
   * Behavior:
   * - Explicit `agents.agentA` / `agents.agentB` (or top-level agentA/agentB) win.
   * - Missing B with explicit A → B defaults to baseline rival.
   * - No agents block but `llm.endpoint` set → **legacy twin-isolated**: both villages
   *   get independent LLMManager clones of the same endpoint/model (separate history).
   * - Nothing configured → both baseline (offline play).
   *
   * @param {object} config - Full app config (llm + optional agents)
   * @returns {{ agentA: object, agentB: object, mode: string }}
   */
  static normalizeAgentConfigs(config = {}) {
    const legacyLlm = config.llm || {};
    const explicitA = config.agents?.agentA || config.agentA || null;
    const explicitB = config.agents?.agentB || config.agentB || null;

    if (explicitA || explicitB) {
      const agentA = VillageAgents.normalizeOne(
        explicitA || { type: 'llm' },
        legacyLlm,
        'A'
      );
      // Focus-tribe default: missing B becomes baseline opponent
      const agentB = VillageAgents.normalizeOne(
        explicitB || { type: 'baseline', name: 'baseline-rival' },
        legacyLlm,
        'B'
      );
      return { agentA, agentB, mode: 'explicit' };
    }

    if (legacyLlm.endpoint) {
      // Same model/endpoint for both tribes, but separate clients/history
      return {
        agentA: VillageAgents.normalizeOne(
          { type: 'llm', name: 'llm-agent-a', ...legacyLlm },
          legacyLlm,
          'A'
        ),
        agentB: VillageAgents.normalizeOne(
          { type: 'llm', name: 'llm-agent-b', ...legacyLlm },
          legacyLlm,
          'B'
        ),
        mode: 'legacy-twin-isolated'
      };
    }

    return {
      agentA: { type: 'baseline', name: 'baseline-a' },
      agentB: { type: 'baseline', name: 'baseline-b' },
      mode: 'offline-baseline'
    };
  }

  /**
   * Attach agents to villages by slot (A = villages[0], B = villages[1]).
   * @param {Array} villages
   * @param {object} config
   * @returns {{ agentA: object, agentB: object, mode: string }}
   */
  setup(villages, config = {}) {
    this.agents = {};
    this.meta = {};
    this.normalized = VillageAgents.normalizeAgentConfigs(config);

    const slots = [
      { key: 'agentA', slot: 'A', index: 0 },
      { key: 'agentB', slot: 'B', index: 1 }
    ];

    for (const { key, slot, index } of slots) {
      const village = villages?.[index];
      if (!village) continue;

      const agentConfig = this.normalized[key];
      const agent = VillageAgents.createAgent(agentConfig);
      this.agents[village.id] = agent;
      this.meta[village.id] = {
        slot,
        type: agent.type || agentConfig.type || 'llm',
        name: agent.name || agentConfig.name || key,
        model: agentConfig.model || null,
        endpoint: agentConfig.endpoint || null
      };
    }

    return this.normalized;
  }

  /**
   * Look up the decision agent for a village id.
   * @param {string} villageId
   * @returns {object|null}
   */
  getAgent(villageId) {
    return this.agents?.[villageId] || null;
  }

  /**
   * Metadata for HUD / logging.
   * @param {string} villageId
   * @returns {object|null}
   */
  getMeta(villageId) {
    return this.meta?.[villageId] || null;
  }

  /**
   * True when any attached agent is an LLM with an endpoint configured.
   * @returns {boolean}
   */
  anyLlmEndpointConfigured() {
    return Object.values(this.agents).some(
      (agent) => agent?.type === 'llm' && Boolean(agent.llm?.config?.llm?.endpoint)
    );
  }

  /**
   * True when this village's agent is LLM-backed with an endpoint (owns resource labor).
   * Baseline agents also "own" decisions via tick actions — callers may treat both as agent-owned.
   * @param {string} villageId
   * @returns {boolean}
   */
  villageUsesLlm(villageId) {
    const agent = this.getAgent(villageId);
    if (!agent) return false;
    if (agent.type !== 'llm') return false;
    return Boolean(agent.llm?.config?.llm?.endpoint);
  }

  /**
   * True when a decision agent (llm or baseline) is attached for the village.
   * @param {string} villageId
   * @returns {boolean}
   */
  hasAgent(villageId) {
    return Boolean(this.getAgent(villageId));
  }

  /**
   * Sync the global `llm` singleton from Agent A's LLM config (narrative / legacy callers).
   * Does not share messageHistory — only copies config fields.
   * @param {object} [globalLlm]
   */
  syncLegacyGlobalLlm(globalLlm) {
    if (!globalLlm) return;
    const agentA = Object.values(this.agents).find(
      (a) => a?.type === 'llm' && a.llm?.config?.llm
    );
    if (!agentA?.llm?.config?.llm) return;

    const src = agentA.llm.config.llm;
    globalLlm.config = globalLlm.config || {};
    globalLlm.config.llm = {
      ...(globalLlm.config.llm || {}),
      endpoint: src.endpoint,
      model: src.model,
      apiKey: src.apiKey,
      maxTokens: src.maxTokens,
      temperature: src.temperature
    };
  }

  /**
   * Collect LLM managers for offline HUD status (any offline → show offline).
   * @returns {Array}
   */
  listLlmManagers() {
    return Object.values(this.agents)
      .filter((a) => a?.type === 'llm' && a.llm)
      .map((a) => a.llm);
  }

  /**
   * Build a persistence-ready agents block from current normalized configs.
   * @returns {{ agentA: object, agentB: object }|null}
   */
  toConfigBlock() {
    if (!this.normalized) return null;
    return {
      agentA: { ...this.normalized.agentA },
      agentB: { ...this.normalized.agentB }
    };
  }
}

// Browser / test globals
if (typeof window !== 'undefined') {
  window.VillageAgents = VillageAgents;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VillageAgents };
}
