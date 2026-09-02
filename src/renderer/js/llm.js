// Simville LLM Integration Module

class LLMManager {
  constructor() {
    this.config = null;
    this.connected = false;
    this.offline = false;
    this.messageHistory = [];
    this.maxHistory = 10;
    // Serialize API calls so local servers (LM Studio) never get overlapping requests
    this._requestQueue = Promise.resolve();
    this._pendingRequestCount = 0;
  }

  getRequestTimeoutMs(endpoint = this.config?.llm?.endpoint) {
    return this.isLocalEndpoint(endpoint) ? 120000 : 30000;
  }

  enqueueRequest(task) {
    this._pendingRequestCount += 1;
    const run = this._requestQueue.then(() => task());
    this._requestQueue = run.catch(() => {});
    return run.finally(() => {
      this._pendingRequestCount = Math.max(0, this._pendingRequestCount - 1);
    });
  }

  async initialize() {
    if (window.electronAPI) {
      this.config = await window.electronAPI.getAllConfig();
    } else {
      // Fallback to localStorage or defaults
      this.config = Utils.loadFromStorage('config') || {
        llm: {
          endpoint: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
          apiKey: '',
          maxTokens: 500,
          temperature: 0.8
        }
      };
    }
  }

  updateConfig(config) {
    this.config = { ...this.config, ...config };
    if (window.electronAPI) {
      window.electronAPI.setConfig('llm', this.config.llm);
    }
  }

  isLocalEndpoint(endpoint = this.config?.llm?.endpoint) {
    if (!endpoint || typeof endpoint !== 'string') return false;

    try {
      const url = new URL(endpoint.includes('://') ? endpoint : `http://${endpoint}`);
      const host = url.hostname.toLowerCase();
      return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1';
    } catch (error) {
      return /localhost|127\.0\.0\.1/i.test(endpoint);
    }
  }

  getSanitizedHistory(limit = 6) {
    const valid = this.messageHistory
      .filter(message =>
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' &&
        message.content.trim().length > 0
      )
      .map(message => ({ role: message.role, content: message.content.trim() }));

    let history = valid.slice(-limit);
    while (history.length > 0 && history[0].role === 'assistant') {
      history.shift();
    }

    return history;
  }

  buildChatMessages(prompt, systemPrompt = null) {
    const systemParts = [];
    if (systemPrompt && String(systemPrompt).trim()) {
      systemParts.push(String(systemPrompt).trim());
    }
    systemParts.push('You are the simulation engine for Simville. You must respond with valid JSON only, no markdown formatting or additional text.');

    const systemText = systemParts.join('\n\n');
    const userText = String(prompt ?? '').trim() || 'Respond with valid JSON.';
    const history = this.getSanitizedHistory();
    const messages = [];

    if (this.isLocalEndpoint()) {
      // LM Studio and similar local servers often use strict Jinja templates
      // that reject multiple system messages or missing user string content.
      messages.push(...history);
      messages.push({
        role: 'user',
        content: systemText ? `${systemText}\n\n${userText}` : userText
      });
      return messages;
    }

    if (systemText) {
      messages.push({ role: 'system', content: systemText });
    }

    messages.push(...history);
    messages.push({ role: 'user', content: userText });
    return messages;
  }

  async testConnection(config = null) {
    const testConfig = config || this.config?.llm;

    console.log('Testing LLM connection with config:', {
      endpoint: testConfig?.endpoint,
      model: testConfig?.model,
      hasApiKey: !!testConfig?.apiKey,
      apiKeySuffix: testConfig?.apiKey ? `...${String(testConfig.apiKey).slice(-4)}` : 'none'
    });

    if (!testConfig?.endpoint) {
      console.log('Endpoint not set');
      return { success: false, error: 'Endpoint not configured. Please enter your LLM endpoint URL.' };
    }

    try {
      // Handle endpoints that may already include /v1
      const baseUrl = testConfig.endpoint.replace(/\/$/, '');
      const url = `${baseUrl}/chat/completions`;
      console.log('Making request to:', url);

      // Build headers - local servers may not need auth
      const headers = {
        'Content-Type': 'application/json'
      };
      if (testConfig.apiKey) {
        headers['Authorization'] = `Bearer ${testConfig.apiKey}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          model: testConfig.model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Say "Connection successful" in exactly those words.' }],
          max_tokens: 20,
          temperature: 0
        })
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.log('Error response:', errorText);
        let errorMsg = `HTTP ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error?.message) errorMsg = errorJson.error.message;
        } catch (e) {}
        return { success: false, error: errorMsg };
      }

      const data = await response.json();
      console.log('Response data:', JSON.stringify(data));
      const content = data.choices?.[0]?.message?.content || '';

      if (content.toLowerCase().includes('connection successful')) {
        return { success: true, message: 'Connection established!' };
      }
      return { success: false, error: 'Unexpected response: ' + content };
    } catch (error) {
      console.error('Connection test failed:', error);
      return { success: false, error: error.message };
    }
  }

  async generate(prompt, systemPrompt = null) {
    // Allow keyless local endpoints; require at least an endpoint
    if (!this.config?.llm?.endpoint) {
      console.log('LLM generate: No endpoint configured, using fallback');
      this.offline = true;
      return this.getFallbackResponse(prompt);
    }

    return this.enqueueRequest(() => this.executeGenerate(prompt, systemPrompt));
  }

  async executeGenerate(prompt, systemPrompt = null) {
    const messages = this.buildChatMessages(prompt, systemPrompt);
    const userPrompt = String(prompt ?? '').trim() || 'Respond with valid JSON.';
    const timeoutMs = this.getRequestTimeoutMs();

    console.log('LLM generate: Making API request to', this.config.llm.endpoint);

    let timeoutId = null;
    try {
      const baseUrl = this.config.llm.endpoint.replace(/\/$/, '');
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const headers = {
        'Content-Type': 'application/json'
      };
      if (this.config.llm.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.llm.apiKey}`;
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: this.config.llm.model,
          messages: messages,
          max_tokens: this.config.llm.maxTokens,
          temperature: this.config.llm.temperature
        })
      });
      clearTimeout(timeoutId);
      timeoutId = null;

      if (!response.ok) {
        console.error('LLM API error:', response.status, await response.text());
        this.offline = true;
        return this.getFallbackResponse(prompt);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      console.log('LLM generate: Got response, length:', content?.length);

      if (content) {
        this.addToHistory({ role: 'user', content: userPrompt.slice(0, 400) });
        this.addToHistory({ role: 'assistant', content: content.slice(0, 400) });
        const parsed = this.parseResponse(content);
        console.log('LLM generate: Parsed result:', parsed ? 'success' : 'null');
        if (parsed) {
          this.offline = false;
          return parsed;
        }
      }
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      if (error?.name === 'AbortError') {
        console.warn(`LLM request timed out after ${timeoutMs}ms`);
      } else {
        console.error('LLM request failed:', error);
      }
    }

    console.log('LLM generate: Falling back');
    this.offline = true;
    return this.getFallbackResponse(prompt);
  }

  addToHistory(message) {
    this.messageHistory.push(message);
    if (this.messageHistory.length > this.maxHistory * 2) {
      this.messageHistory = this.messageHistory.slice(-this.maxHistory);
    }
  }

  parseResponse(content) {
    if (!content || typeof content !== 'string') return null;

    const tryParse = (text) => {
      try {
        return JSON.parse(text);
      } catch (e) {
        return null;
      }
    };

    const wrapParsed = (parsed) => {
      if (parsed == null) return null;
      if (Array.isArray(parsed)) return { actions: parsed };
      if (typeof parsed === 'object') return parsed;
      return null;
    };

    // 1) Whole content as JSON
    let parsed = wrapParsed(tryParse(content.trim()));
    if (parsed) return parsed;

    // 2) Markdown fenced JSON (object or array)
    const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) {
      parsed = wrapParsed(tryParse(fenceMatch[1].trim()));
      if (parsed) return parsed;
    }

    // 3) Extract first JSON object or array by brace/bracket matching
    const extractBalanced = (src, openChar, closeChar) => {
      const start = src.indexOf(openChar);
      if (start === -1) return null;
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = start; i < src.length; i++) {
        const ch = src[i];
        if (inString) {
          if (escape) {
            escape = false;
          } else if (ch === '\\') {
            escape = true;
          } else if (ch === '"') {
            inString = false;
          }
          continue;
        }
        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === openChar) depth++;
        else if (ch === closeChar) {
          depth--;
          if (depth === 0) return src.substring(start, i + 1);
        }
      }
      return null;
    };

    // Prefer whichever structure appears first in the text
    const firstObj = content.indexOf('{');
    const firstArr = content.indexOf('[');
    const tryOrder = [];
    if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
      tryOrder.push(['[', ']'], ['{', '}']);
    } else {
      tryOrder.push(['{', '}'], ['[', ']']);
    }

    for (const [open, close] of tryOrder) {
      const extracted = extractBalanced(content, open, close);
      if (!extracted) continue;
      parsed = wrapParsed(tryParse(extracted));
      if (parsed) return parsed;
    }

    console.error('Failed to parse LLM response');
    console.error('Content was:', content?.substring(0, 200));
    return null;
  }

  getFallbackResponse(prompt) {
    // Generic fallback when no villager context is available
    console.warn('Using fallback LLM response');
    return {
      actions: [
        { villagerId: null, action: 'idle', activity: 'Waiting for guidance', duration: 5 }
      ],
      dialogue: 'The villagers continue their daily routine.',
      event: null
    };
  }

  getFallbackVillagerActions(villagers = []) {
    return {
      actions: villagers.map(v => ({
        villagerId: v.id || v.name,
        action: 'idle',
        activity: 'Waiting for guidance',
        duration: 5
      }))
    };
  }

  // Generate villager backstories
  generateFallbackBackstory(villager) {
    return `${villager.name} was born in the village during a ${Utils.randomElement(['stormy', 'peaceful', 'fruitful', 'harsh'])} season. ${Utils.randomElement([
      'They spent their youth learning from the elders.',
      'They were known for their curious nature.',
      'They showed early promise in their skills.',
      'They grew up during a time of plenty.'
    ])} As they matured, ${villager.name} became known for their ${Utils.randomElement(['kind heart', 'strong work ethic', 'wisdom', 'creativity'])}. Now ${villager.age} years old, they contribute to the village in their own unique way.`;
  }

  async generateBackstory(villager) {
    const prompt = `Generate a 2-3 paragraph backstory for this tribal villager. Include their childhood, a defining moment, and their current outlook.

Name: ${villager.name}
Age: ${villager.age}
Gender: ${villager.gender}
Personality traits: ${villager.personality.sociable > 50 ? 'Sociable' : 'Solitary'}, ${villager.personality.active > 50 ? 'Active' : 'Calm'}, ${villager.personality.curious > 50 ? 'Curious' : 'Traditional'}
Skills: ${Object.entries(villager.skills).filter(([k, v]) => v > 5).map(([k]) => k).join(', ') || 'Average'}

Village context: A tribal village in a tropical rainforest region, with a chieftan leading the community.

Write in an oral storytelling tradition style, as if told by village elders.

Respond with valid JSON only: {"backstory": "Your 2-3 paragraph backstory text here"}`;

    const systemPrompt = 'You are a creative writer for a tribal village simulation game. Generate backstories that feel authentic to a pre-industrial tribal culture. Always respond with valid JSON.';

    const result = await this.generate(prompt, systemPrompt);

    if (result && result.backstory) {
      console.log('generateBackstory: Got backstory from LLM');
      return result.backstory;
    }

    const fallback = this.generateFallbackBackstory(villager);
    console.log('generateBackstory: Using fallback backstory');
    return fallback;
  }

  // Generate villager goals
  async generateGoals(villager) {
    const prompt = `Generate 1-2 personal goals for this villager based on their personality and village context.

Villager: ${villager.name}, ${villager.age} years old, ${villager.gender}
Personality: Sociable=${villager.personality.sociable}, Active=${villager.personality.active}, Curious=${villager.personality.curious}, Empathetic=${villager.personality.empathetic}, Confident=${villager.personality.confident}
Skills: ${JSON.stringify(villager.skills)}
Life stage: ${Utils.getLifeStage(villager.age).name}

Output JSON with goals array. Each goal has: type (aspiration/skill/relationship/legacy/social), description, difficulty (easy/medium/hard/epic)`;

    const result = await this.generate(prompt);

    if (result && result.goals && result.goals.length > 0) {
      return result.goals.slice(0, 2).map(g => ({
        ...g,
        progress: 0,
        completed: false,
        failed: false,
        milestones: []
      }));
    }

    // Fallback goals
    return [{
      type: 'aspiration',
      description: `Become a respected member of the village`,
      difficulty: 'medium',
      progress: 0,
      completed: false,
      failed: false,
      milestones: ['Gain trust of villagers', 'Demonstrate skills', 'Lead a project']
    }];
  }

  // Generate villager secret
  async generateSecret(villager, otherVillagers = []) {
    const otherNames = otherVillagers.length > 0 ? otherVillagers.map(v => v.name).join(', ') : 'the other villagers';

    const prompt = `Generate a secret for this villager. Secrets add intrigue to the village simulation.

Villager: ${villager.name}, ${villager.age} years old
Personality: Sociable=${villager.personality.sociable}, Active=${villager.personality.active}, Curious=${villager.personality.curious}, Empathetic=${villager.personality.empathetic}, Confident=${villager.personality.confident}
Other villagers: ${otherNames}

Secret types: hidden_talent, past_betrayal, forbidden_romance, hidden_stash, illness, aspiration, grudge

Output JSON with: type, description, secrecyLevel (1-5), discoveryTriggers, target (villager id if applicable)`;

    const result = await this.generate(prompt);

    if (result && result.type) {
      return {
        ...result,
        revealed: false,
        discoveredBy: []
      };
    }

    return null;
  }

  // Generate chronicle entry
  async generateChronicleEntry(event, villageState) {
    const prompt = `Write a brief chronicle entry (2-3 sentences) for this event in an oral tradition storytelling style.

Event: ${event.description}
Village mood: ${villageState.averageMood > 50 ? 'generally positive' : villageState.averageMood > 0 ? 'mixed' : 'troubled'}
Day: ${event.day}

The style should be evocative and memorable, as if passed down through generations.

Respond with valid JSON only: {"chronicle":"Your 2-3 sentence chronicle text here"}`;

    const systemPrompt = 'You are chronicler for a tribal village, writing in an ancient oral tradition style. Keep entries brief but vivid. Always respond with valid JSON.';

    const result = await this.generate(prompt, systemPrompt);

    if (result && result.chronicle) {
      return result.chronicle;
    }

    return event.description;
  }

  // Generate villager actions
  async generateVillagerActions(villagers, worldState, timeState) {
    const villagerSummaries = villagers.map(v => ({
      id: v.id,
      name: v.name,
      age: v.age,
      lifeStage: Utils.getLifeStage(v.age).name,
      personality: v.personality,
      skills: v.skills,
      needs: { hunger: Math.round(v.hunger), thirst: Math.round(v.thirst ?? 100), energy: Math.round(v.energy), social: Math.round(v.socialNeed) },
      mood: v.mood,
      status: v.status,
      position: { x: Math.round(v.x), y: Math.round(v.y) },
      relationships: v.relationships ? Object.entries(v.relationships).slice(0, 3).map(([key, score]) => {
        const name = v.getRelationshipDisplayName?.(key) || key;
        return `${name}: ${score}`;
      }) : [],
      goals: v.goals?.filter(g => !g.completed).slice(0, 1).map(g => g.description) || []
    }));

    // Include structure positions for context
    const structureContext = worldState.structures?.map(s => `${s.type} at (${s.x}, ${s.y})`).join(', ') || 'none yet';
    const center = worldState.villageCenter || { x: 32, y: 32 };
    const rival = worldState.rivalVillage;
    const rivalBlock = rival ? `
RIVAL VILLAGE (competitive opponent — outplay them):
- Name: ${rival.name}
- Population: ${rival.population}
- Relation score: ${rival.relation} (-100=war, 0=neutral, +100=allied)
- At war: ${rival.atWar ? 'YES' : 'no'}
- Their strength: ${rival.strength}
- Their resources: ${JSON.stringify(rival.resources)}
Prioritize actions that strengthen YOUR village vs this rival (food security, builds, coordinated work).` : '';

    const prompt = `Generate actions for each villager in this tribal village simulation.

TIME: Day ${timeState.day}, ${Utils.formatTime(timeState.hours)} (${Utils.getTimeOfDay(timeState.hours)})
SEASON: ${timeState.season.name} (Day ${timeState.dayInSeason}/${timeState.season.duration})
VILLAGE RESOURCES: Wood=${worldState.resources.wood}, Food=${worldState.resources.food}, Water=${worldState.resources.water}, Stone=${worldState.resources.stone}, Herbs=${worldState.resources.herbs}, Clay=${worldState.resources.clay}, Fish=${worldState.resources.fish || 0}, Thatch=${worldState.resources.thatch || 0}, RareMaterials=${worldState.resources.rareMaterials || 0}
POPULATION: ${villagers.length} villagers
STRUCTURES: ${structureContext}
WORLD SIZE: 64x64 tiles, your village center is around (${center.x}, ${center.y})
${rivalBlock}

VILLAGERS (with current positions):
${JSON.stringify(villagerSummaries, null, 2)}

Based on each villager's needs, personality, and the time of day, decide what they should do next.

Output JSON with an "actions" array. Each action has:
- villagerId: string (the villager's id)
- action: idle|working|gathering|building|farming|hunting|fishing|socializing|sleeping|eating|drinking|resting|ritual
- moveTo: {x: number, y: number} - tile coordinates to move to (0-64 range, village center is ~32,32)
- target: optional villager name or resource type
- duration: 1-10 (minutes in game time)
- speechEmoji: emoji from this list 💬😂😢😠😍🤝😮🤔🍖😴💪🎣🏠👶🙏🎉
- speechTheme: brief description of what they're saying or doing
- interactionTarget: villager name if action involves another villager
- interactionType: talk|argue|share|help|romance|gossip if applicable

Rules:
- CRITICAL SURVIVAL PRIORITY: If ANY villager has hunger < 40, thirst < 40, or energy < 30, they MUST be assigned eating, drinking, gathering, hunting, fishing, or resting. NEVER assign idle, working, socializing, or building to a villager with critical needs.
- Movement should be purposeful - if action is gathering, move towards resources
- If socializing, move towards the other villager
- If sleeping/eating/drinking, move towards a hut, fire, well, or water source
- Active villagers should be working or gathering
- Social villagers should seek out others
- Move coordinates should be integers between 0-63
- Villagers with hunger < 30 or thirst < 30 should always be assigned survival actions first`;

    const result = await this.generate(prompt);

    if (result && result.actions && Array.isArray(result.actions)) {
      return result.actions;
    }

    // Schema-matching fallback for consumers expecting villagerId/action
    return this.getFallbackVillagerActions(villagers).actions;
  }

  // Generate ritual dialogue
  async generateRitualDialogue(ritual, villager, participants) {
    const prompt = `Describe what ${villager.name} says or does during a ${ritual.name}.

Participants: ${participants.map(p => p.name).join(', ')}
Ritual type: ${ritual.name}
Time of day: ${Utils.getTimeOfDay(Utils.randomInt(6, 20))}

Output JSON with: narration (2-3 sentences of sensory description), chant (optional traditional phrase villagers might say)`;

    const result = await this.generate(prompt);

    if (result) {
      return result;
    }

    return {
      narration: `${villager.name} participates in the ${ritual.name}, their voice joining with the others in ancient tradition.`,
      chant: null
    };
  }

  // Generate gossip about a secret
  async generateGossip(secret, sourceVillager, targetVillager) {
    const prompt = `Generate a brief piece of gossip (1-2 sentences) that ${sourceVillager.name} might spread about ${targetVillager.name}.

Secret: ${secret.description}
Source personality: ${sourceVillager.personality.sociable > 50 ? 'Sociable and talkative' : 'More reserved'}
Relationship to target: ${(sourceVillager.getRelationship?.(targetVillager) ?? sourceVillager.relationships?.[targetVillager.id] ?? sourceVillager.relationships?.[targetVillager.name] ?? 0)}

The gossip should be slightly embellished but not complete fiction - rumors that have a grain of truth.

Respond with valid JSON only: {"gossip":"Your 1-2 sentence gossip text here"}`;

    const result = await this.generate(prompt);

    if (result && result.gossip) {
      return result.gossip;
    }

    return `${sourceVillager.name} whispers something about ${targetVillager.name} to others...`;
  }

  // Generate tech research decisions
  async generateTechDecision(worldState, techState, timeState) {
    const researchedTechs = techState.researched || [];
    const currentResearch = techState.currentResearch?.techId || null;

    const allTechs = Object.entries(CONSTANTS.TECH).map(([key, tech]) => ({
      id: tech.id,
      name: tech.name,
      description: tech.description,
      tier: tech.tier,
      icon: tech.icon,
      prerequisites: tech.prerequisites,
      unlocks: tech.unlocks,
      researchTime: tech.researchTime,
      isResearched: researchedTechs.includes(tech.id),
      isAvailable: !researchedTechs.includes(tech.id) &&
                   tech.prerequisites.every(p => researchedTechs.includes(p)) &&
                   tech.id !== currentResearch
    }));

    const prompt = `You are advising a tribal village on which technology to research next.

VILLAGE STATE:
- Day ${timeState.day}, ${Utils.getTimeOfDay(timeState.hours)}
- Season: ${timeState.season.name}
- Population: ${worldState.population} villagers
- Resources: Wood=${worldState.resources.wood}, Food=${worldState.resources.food}, Water=${worldState.resources.water}, Stone=${worldState.resources.stone}, Herbs=${worldState.resources.herbs}

RESEARCHED TECHNOLOGIES (${researchedTechs.length}): ${researchedTechs.map(id => Utils.getTechDef(id)?.name || id).join(', ') || 'None yet'}

CURRENT RESEARCH: ${currentResearch ? Utils.getTechDef(currentResearch)?.name || currentResearch : 'None'}

AVAILABLE TECHNOLOGIES:
${allTechs.filter(t => t.isAvailable).map(t =>
  `- ${t.name} (id: ${t.id}, Tier ${t.tier}) ${t.prerequisites.length > 0 ? `[Requires: ${t.prerequisites.map(p => Utils.getTechDef(p)?.name || p).join(', ')}]` : ''} - ${t.description} (${t.researchTime} days)`
).join('\n')}

${allTechs.filter(t => t.isResearched).map(t =>
  `✓ ${t.name} - ${t.unlocks.join(', ')}`
).join('\n')}

Consider the village's current needs, resources, and development stage. Should the village continue current research, switch to a different technology, or wait?

Output JSON with:
- decision: "continue" | "switch" | "start_new" | "wait"
- techId: technology id to research (string or null if waiting)
- reason: brief explanation of the decision (1-2 sentences)`;

    const result = await this.generate(prompt);

    if (result && result.decision) {
      const resolvedTech = Utils.getTechDef(result.techId);
      return {
        decision: result.decision,
        techId: resolvedTech?.id || result.techId || null,
        reason: result.reason || 'The village considers its options.'
      };
    }

    // Fallback: continue current research or pick first available
    const fallbackTech = currentResearch
      ? Utils.getTechDef(currentResearch)
      : allTechs.find(t => t.isAvailable);
    return {
      decision: currentResearch ? 'continue' : 'start_new',
      techId: fallbackTech?.id || null,
      reason: 'Using village wisdom to guide research.'
    };
  }

  // Generate diplomatic action for chieftan regarding other village
  async generateDiplomaticAction(village, otherVillage, context) {
    const prompt = `As chieftan of "${village.name}", consider your relations with the rival village "${otherVillage.name}".

CURRENT RELATIONS:
- Your village: ${village.name} with ${village.villagerIds?.length || 0} villagers
- Their village: ${otherVillage.name} with ${otherVillage.villagerIds?.length || 0} villagers
- Current relation score: ${village.relations?.[otherVillage.id] || 0} (-100 to 100, negative is hostile)
- At war: ${village.atWarWith?.includes(otherVillage.id) ? 'Yes' : 'No'}

RESOURCES:
- Your village: ${JSON.stringify(village.resources)}
- Their village: ${JSON.stringify(otherVillage.resources)}

VILLAGE STRENGTHS:
- Your strength: ${context?.yourStrength || 0}
- Their strength: ${context?.theirStrength || 0}

Your people are watching your leadership. What action will you take regarding the rival village?

Choose ONE action:
1. "propose_trade" - Offer to exchange resources peacefully
2. "propose_alliance" - Suggest working together
3. "send_threat" - Warn them to stay away from your territory
4. "raid" - Launch a raid against their village
5. "ignore" - Focus on your own village for now
6. "observe" - Send scouts to learn more about them

Output JSON with:
- action: the chosen action
- targetVillage: "${otherVillage.name}"
- reason: brief explanation of why
- urgency: high|medium|low (affects how soon this is acted upon)`;

    const result = await this.generate(prompt);

    if (result && result.action) {
      return result;
    }

    // Default fallback - ignore if relations are neutral
    const relationScore = village.relations?.[otherVillage.id] || 0;
    return {
      action: relationScore < -30 ? 'send_threat' : 'ignore',
      targetVillage: otherVillage.name,
      reason: 'The wise leader knows when to wait.',
      urgency: 'low'
    };
  }

  // Generate inter-village relationship changes based on events
  async generateRelationChanges(villages, recentEvents) {
    if (villages.length < 2) return {};

    const v1 = villages[0];
    const v2 = villages[1];
    const currentRelation = v1.relations?.[v2.id] || 0;

    const prompt = `Two tribal villages share a continent. Their relations are currently ${currentRelation} (-100=war, 0=neutral, 100=allied).

RECENT EVENTS affecting relations:
${recentEvents.map(e => `- ${e}`).join('\n')}

Based on these events, how should the relationship between these villages change?

Output JSON with:
- relationDelta: number between -10 and +10 (positive improves relations, negative worsens)
- summary: brief explanation of why`;

    const result = await this.generate(prompt);

    if (result && typeof result.relationDelta === 'number') {
      return {
        [v2.id]: Utils.clamp(currentRelation + result.relationDelta, -100, 100)
      };
    }

    return {};
  }
}

// Global instance
const llm = new LLMManager();
if (typeof window !== 'undefined') {
  window.llm = llm;
  window.LLMManager = LLMManager;
}
