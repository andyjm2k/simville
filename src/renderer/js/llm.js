// Simville LLM Integration Module

class LLMManager {
  constructor() {
    this.config = null;
    this.connected = false;
    this.messageHistory = [];
    this.maxHistory = 10;
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

  async testConnection(config = null) {
    const testConfig = config || this.config?.llm;

    console.log('Testing LLM connection with config:', {
      endpoint: testConfig?.endpoint,
      model: testConfig?.model,
      hasApiKey: !!testConfig?.apiKey,
      apiKeyPrefix: testConfig?.apiKey?.substring(0, 10) || 'none'
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
    if (!this.config?.llm?.apiKey) {
      console.log('LLM generate: No API key configured, using fallback');
      return this.getFallbackResponse(prompt);
    }

    const messages = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'system', content: 'You are the simulation engine for Simville. You must respond with valid JSON only, no markdown formatting or additional text.' });

    // Add relevant history
    const relevantHistory = this.messageHistory.slice(-3);
    messages.push(...relevantHistory);

    messages.push({ role: 'user', content: prompt });

    console.log('LLM generate: Making API request to', this.config.llm.endpoint);

    let timeoutId = null;
    try {
      const baseUrl = this.config.llm.endpoint.replace(/\/$/, '');
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 15000);
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
        return this.getFallbackResponse(prompt);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      console.log('LLM generate: Got response, length:', content?.length);

      if (content) {
        this.addToHistory({ role: 'user', content: prompt });
        this.addToHistory({ role: 'assistant', content: content });
        const parsed = this.parseResponse(content);
        console.log('LLM generate: Parsed result:', parsed ? 'success' : 'null');
        return parsed;
      }
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      console.error('LLM request failed:', error);
    }

    console.log('LLM generate: Falling back');
    return this.getFallbackResponse(prompt);
  }

  addToHistory(message) {
    this.messageHistory.push(message);
    if (this.messageHistory.length > this.maxHistory * 2) {
      this.messageHistory = this.messageHistory.slice(-this.maxHistory);
    }
  }

  parseResponse(content) {
    try {
      // Try to extract and parse JSON from the response
      // Strategy: find the first { and try parsing from there, handling nested braces
      const firstBrace = content.indexOf('{');
      if (firstBrace === -1) {
        console.error('No JSON object found in response');
        return null;
      }

      const jsonStart = content.substring(firstBrace);
      let endBrace = -1;
      let braceCount = 0;

      // Find the matching closing brace by counting nested braces
      for (let i = 0; i < jsonStart.length; i++) {
        if (jsonStart[i] === '{') braceCount++;
        else if (jsonStart[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            endBrace = i + 1;
            break;
          }
        }
      }

      if (endBrace === -1) {
        console.error('Could not find matching closing brace');
        return null;
      }

      const jsonStr = jsonStart.substring(0, endBrace);
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error('Failed to parse LLM response:', error);
      console.error('Content was:', content?.substring(0, 200));
      return null;
    }
  }

  getFallbackResponse(prompt) {
    // Return a reasonable default action when LLM is unavailable
    console.warn('Using fallback LLM response');
    return {
      actions: [
        { type: 'idle', duration: 5 }
      ],
      dialogue: 'The villagers continue their daily routine.',
      event: null
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

The style should be evocative and memorable, as if passed down through generations.`;

    const systemPrompt = 'You are chronicler for a tribal village, writing in an ancient oral tradition style. Keep entries brief but vivid.';

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
      relationships: v.relationships ? Object.entries(v.relationships).slice(0, 3).map(([name, score]) => `${name}: ${score}`) : [],
      goals: v.goals?.filter(g => !g.completed).slice(0, 1).map(g => g.description) || []
    }));

    // Include structure positions for context
    const structureContext = worldState.structures?.map(s => `${s.type} at (${s.x}, ${s.y})`).join(', ') || 'none yet';

    const prompt = `Generate actions for each villager in this tribal village simulation.

TIME: Day ${timeState.day}, ${Utils.formatTime(timeState.hours)} (${Utils.getTimeOfDay(timeState.hours)})
SEASON: ${timeState.season.name} (Day ${timeState.dayInSeason}/${timeState.season.duration})
VILLAGE RESOURCES: Wood=${worldState.resources.wood}, Food=${worldState.resources.food}, Water=${worldState.resources.water}, Stone=${worldState.resources.stone}, Herbs=${worldState.resources.herbs}, Clay=${worldState.resources.clay}, Fish=${worldState.resources.fish || 0}, Thatch=${worldState.resources.thatch || 0}, RareMaterials=${worldState.resources.rareMaterials || 0}
POPULATION: ${villagers.length} villagers
STRUCTURES: ${structureContext}
WORLD SIZE: 64x64 tiles, village center is around (32, 32)

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
- Movement should be purposeful - if action is gathering, move towards resources
- If socializing, move towards the other villager
- If sleeping/eating/drinking, move towards a hut, fire, well, or water source
- Active villagers should be working or gathering
- Social villagers should seek out others
- Move coordinates should be integers between 0-63`;

    const result = await this.generate(prompt);

    if (result && result.actions && Array.isArray(result.actions)) {
      return result.actions;
    }

    // Fallback actions with movement
    return villagers.map((v, i) => {
      // Generate some random movement towards village center or nearby
      const targetX = 32 + Math.round(Math.sin(i * 1.5) * 5);
      const targetY = 32 + Math.round(Math.cos(i * 1.5) * 5);
      return {
        villagerId: v.id,
        action: 'working',
        moveTo: { x: targetX, y: targetY },
        duration: 5,
        speechEmoji: '💬',
        speechTheme: 'Heading out to work'
      };
    });
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
Relationship to target: ${sourceVillager.relationships?.[targetVillager.name] || 0}

The gossip should be slightly embellished but not complete fiction - rumors that have a grain of truth.`;

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

RESEARCHED TECHNOLOGIES (${researchedTechs.length}): ${researchedTechs.map(id => CONSTANTS.TECH[id]?.name || id).join(', ') || 'None yet'}

CURRENT RESEARCH: ${currentResearch ? CONSTANTS.TECH[currentResearch]?.name || currentResearch : 'None'}

AVAILABLE TECHNOLOGIES:
${allTechs.filter(t => t.isAvailable).map(t =>
  `- ${t.name} (Tier ${t.tier}) ${t.prerequisites.length > 0 ? `[Requires: ${t.prerequisites.map(p => CONSTANTS.TECH[p]?.name || p).join(', ')}]` : ''} - ${t.description} (${t.researchTime} days)`
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
      return {
        decision: result.decision,
        techId: result.techId || null,
        reason: result.reason || 'The village considers its options.'
      };
    }

    // Fallback: continue current research or pick first available
    return {
      decision: currentResearch ? 'continue' : 'start_new',
      techId: currentResearch || allTechs.find(t => t.isAvailable)?.id || null,
      reason: 'Using village wisdom to guide research.'
    };
  }
}

// Global instance
const llm = new LLMManager();
