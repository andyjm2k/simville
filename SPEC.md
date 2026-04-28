# SIMVILLE - Village Life Simulation Game

## 1. Project Overview

**Project Name:** Simville
**Project Type:** Real-time life simulation game (Electron desktop app)
**Core Feature Summary:** An LLM-driven village simulation where tribal villagers with distinct personalities live, work, love, build, and expand in a procedurally generated continent with diverse biomes and resources.
**Target Users:** Fans of life simulation games (The Sims, Stardew Valley), AI-driven simulations, and interactive storytelling enthusiasts.

---

## 2. Technical Specification

### 2.1 Technology Stack

| Component | Technology |
|-----------|------------|
| **Framework** | Electron 28.x |
| **Frontend** | HTML5 Canvas (pixel rendering), vanilla JavaScript |
| **Backend** | Node.js 20.x |
| **AI Engine** | OpenAI-compatible API (configurable endpoint, model, API key) |
| **Build Tool** | electron-builder |
| **Configuration** | JSON config files + in-app settings |

### 2.2 LLM Integration

- **API Type:** OpenAI-compatible REST API
- **Configurable Parameters:**
  - Endpoint URL (default: `https://api.openai.com/v1`)
  - Model name (default: `gpt-4o-mini`)
  - API Key (stored securely in app config)
  - Max tokens per response (default: 500)
  - Temperature (default: 0.8)
- **Simulation Tick Rate:** LLM generates villager actions every 5-10 game seconds
- **Batching:** Multiple villager actions generated in a single API call to reduce latency
- **Fallback:** If API fails, villagers continue with queued/default behaviors

### 2.3 Installation

- Windows installer (.exe) via electron-builder
- Config file stored in `%APPDATA%/Simville/config.json`
- Saves stored in `%APPDATA%/Simville/saves/`

---

## 3. World Generation

### 3.1 Continent Structure

- **Map Size:** 64x64 tiles (configurable 32x32 to 128x128)
- **Tile Size:** 16x16 pixels (rendered at 2x = 32x32 on screen)
- **Camera:** Pan and zoom (scroll wheel), centered on village at start
- **Boundaries:** Impassable ocean/river tiles surround the continent

### 3.2 Biome Types

| Biome | Color Palette | Resources | Spawns |
|-------|--------------|-----------|--------|
| **Tropical Rainforest** | Deep greens, browns | Fruits, Medicinal Plants, Wood, Clay | Wildlife, Insects |
| **Savanna** | Yellows, oranges, sparse green | Grains, Herbs, Stone | Large wildlife |
| **River Delta** | Blues, muddy browns | Fish, Clay, Fresh Water | Fish, Waterfowl |
| **Dense Jungle** | Very dark greens | Rare Plants, Hardwood, Vines | Dangerous wildlife |
| **Cleared Land** | Browns, light greens | Farmable soil | Domesticatable animals |
| **Village Center** | Beige, brown | N/A | Starting point |

### 3.3 Resource Nodes

- **Wood:** Dense trees in rainforest/jungle
- **Stone:** Rocky outcrops in savanna
- **Clay:** River delta banks
- **Fruits:** Banana, mango, cacao trees
- **Herbs:** Medicinal and cooking varieties
- **Fish:** In river tiles
- **Water:** Fresh water sources (wells placed by villagers)

---

## 4. Villager System

### 4.1 Starting Population

- **1 Chieftan:** The village leader, slightly taller sprite, distinct crown/feathers
- **5 Tribespeople:** Randomly generated personalities

### 4.2 Villager Attributes

Each villager has these core attributes:

| Attribute | Description | Range |
|-----------|-------------|-------|
| **Name** | Generated from cultural name pools | Unique |
| **Age** | Years since birth | 16-70 |
| **Gender** | Male, Female, Non-binary | - |
| **Personality** | Big Five traits (O/C/E/A/N simplified) | - |
| **Backstory** | 2-3 paragraph generated history | - |
| **Skills** | Gathering, Crafting, Farming, Fishing, Hunting, Social, Leadership | 1-10 |
| **Health** | Physical condition | 0-100 |
| **Hunger** | Satiation level | 0-100 |
| **Energy** | Stamina/fatigue | 0-100 |
| **Mood** | Current emotional state | -100 to +100 |
| **Relationships** | Map of other villagers to relationship scores | -100 to +100 |
| **Status** | Idle, Working, Sleeping, Eating, Socializing, Building | - |

### 4.3 Personality System

**Trait Dimensions:**
- **Sociable ↔ Solitary:** How much they seek others
- **Active ↔ Lazy:** Work drive and energy expenditure
- **Curious ↔ Traditional:** Openness to new things
- **Empathetic ↔ Stoic:** Emotional response intensity
- **Confident ↔ Anxious:** Stress handling and decision making

**Personality influences:**
- Action selection probability
- Social interaction preferences
- Skill learning rates
- Conflict likelihood
- Romance compatibility

### 4.4 Relationship System

- **Relationship Score:** -100 (enemies) to +100 (soulmates/best friends)
- **Types:** Romantic partner, friend, acquaintance, rival, family
- **Trust:** Builds through positive interactions
- **Jealousy:** Can trigger conflicts in romantic triangles
- **Family Bonds:** Parent-child relationships auto-set, improve over time

### 4.5 Life Stages

| Stage | Age Range | Abilities |
|-------|-----------|-----------|
| **Child** | 0-12 | Cannot work, learns through observation |
| **Youth** | 13-17 | Can assist, simple tasks only |
| **Adult** | 18-50 | Full capabilities |
| **Elder** | 51+ | Reduced work speed, increased wisdom (skill bonus) |

---

## 5. Village Mechanics

### 5.1 Needs & Survival

Villagers must manage these needs:

| Need | Decay Rate | Consequences when Low |
|------|------------|----------------------|
| **Hunger** | -5/hour | Health drops, mood declines, eventually death |
| **Rest** | -3/hour | Energy drops, efficiency drops |
| **Social** | -2/hour | Mood declines, isolation depression |
| **Safety** | Environmental | Danger events trigger fear, flee behavior |
| **Purpose** | Slow decay | Triggers existential wandering if neglected |

### 5.2 Activities & Actions

**Gathering:**
- Walk to resource nodes
- Harvest resources (takes time based on skill)
- Return resources to communal storage

**Crafting:**
- Use gathered materials
- Create tools, shelter, clothing
- Skill level affects quality

**Building:**
- Clear land (remove trees/vegetation)
- Construct: Huts, storage barns, communal fire, defensive structures
- Expand village boundaries

**Farming:**
- Clear and till soil
- Plant seeds
- Water and harvest

**Hunting:**
- Track wildlife
- Kill for meat and materials
- Risk of injury

**Fishing:**
- Catch fish from water sources
- Safer than hunting

**Social:**
- Conversate with others
- Form relationships
- Share food/resources
- Gossip and information spread

**Resting:**
- Sleep in huts
- Eat food
- Recover energy

### 5.3 Construction Menu

| Structure | Materials | Function |
|-----------|-----------|----------|
| **Hut** | 20 Wood, 10 Clay, 10 Thatch | Sleep space for 2 villagers |
| **Storage Barn** | 30 Wood, 15 Clay | Store 100 units of each resource |
| **Communal Fire** | 10 Stone, 5 Wood | Social hub, cooking, warmth |
| **Watchtower** | 25 Wood, 15 Stone | Increases safety radius |
| **Well** | 15 Stone, 5 Clay | Fresh water access |
| **Farm Plot** | 5 Wood (fencing) | Grow crops |
| **Workshop** | 35 Wood, 20 Stone | Crafting efficiency +25% |
| **Temple/Shrine** | 40 Wood, 30 Stone, 10 Rare Materials | Community mood boost |

### 5.4 Population Growth

- **Marriage:** Two adult villagers can form romantic bond (LLM-driven relationship progression)
- **Pregnancy:** After marriage, chance each cycle to conceive
- **Birth:** 9 in-game days gestation, child appears as new villager
- **Naming:** LLM generates name based on cultural pool

---

## 6. Day/Night Cycle & Time System

### 6.1 Time Configuration

| Setting | Default | Range |
|---------|---------|-------|
| **Full Day Cycle** | 10 minutes | 5-30 minutes |
| **Sim Speed** | 1x | 0.5x, 1x, 2x, 4x, Pause |
| **Simulation Duration** | Unlimited | Set end date (e.g., "100 days") |

### 6.2 Time Periods

| Period | Hours | Effects |
|--------|-------|---------|
| **Dawn** | 6:00-8:00 | Soft orange light, villagers wake |
| **Morning** | 8:00-12:00 | Bright, productive work hours |
| **Afternoon** | 12:00-17:00 | Peak heat (tropics), siesta possible |
| **Evening** | 17:00-20:00 | Golden hour, social activities begin |
| **Night** | 20:00-6:00 | Dark, only fire-lit areas visible, sleepers only |

### 6.3 Visual Lighting

- Dynamic lighting overlay based on time
- Shadows rotate around sun/moon position
- Torches/fires provide local illumination at night
- Rain events darken the sky

---

## 7. Graphics & Rendering

### 7.1 Pixel Art Style

**Resolution:** Native 1280x720, pixel-perfect scaling (no anti-aliasing)
**Pixel Scale:** 2x (render at 640x360 logical pixels)
**Art Style:** 16-bit era pixel art with limited palette (32 colors max per sprite)

### 7.2 Villager Sprites

| Component | Details |
|-----------|---------|
| **Base Body** | 16x16 pixels, 4 directional (N/S/E/W) |
| **Animation Frames** | Idle (2 frames), Walk (4 frames), Work (4 frames), Sit (2 frames) |
| **Variations** | Body shape, skin tone (4 variations), hair (8 styles), clothing (tied to resources owned) |
| **Accessories** | Tools, bags, jewelry based on status |
| **Chieftan** | Taller (18px), feathered headdress, animal pelt |
| **Children** | Smaller sprites (12x12) |

### 7.3 Environment Sprites

- **Trees:** 16x32, multi-layer (trunk, canopy, shadow)
- **Water:** Animated (3 frames, tileable)
- **Structures:** 32x32 to 64x64 depending on structure
- **Terrain:** Seamless tile connections for natural look

### 7.4 UI Elements

| Element | Style |
|---------|-------|
| **Windows** | Dark semi-transparent backgrounds, pixel borders |
| **Buttons** | 16x16 icons, highlight on hover |
| **Font** | Pixel font (rendered via canvas, not system fonts) |
| **Icons** | 16x16 emoji-style pixel icons for resources |

---

## 8. User Interface

### 8.1 Main Game Screen

```
┌─────────────────────────────────────────────────────────┐
│ [☀️ Day 15, 14:32] [Speed: 1x ▼] [⚙️]              [❌] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                                                         │
│                    GAME WORLD CANVAS                    │
│                    (Pannable, Zoomable)                 │
│                                                         │
│    [Speech Bubbles appear above interacting villagers]  │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ Resources: 🪵 45 | 🍖 30 | 💧 20 | 🪨 15 | 🌿 8        │
└─────────────────────────────────────────────────────────┘
```

### 8.2 Villager Detail Pane (Click on villager)

```
┌──────────────────────────────────────┐
│ 👤 Kana (Female, 34)                 │
│ Chieftan                            │
├──────────────────────────────────────┤
│ Skills:  🌾 7  🪓 5  🎣 3  💬 8  👑 9 │
│                                      │
│ Status: Building Watchtower          │
│ Mood:   😊 +65 (Content)             │
│ Energy: ████████░░ 78%              │
│ Hunger: ██████░░░░ 58%              │
│                                      │
│ Current Activity:                    │
│ "Directing the construction crew     │
│  from the scaffolding..."            │
│                                      │
│ Latest Interactions:                 │
│ 💬→ Toma: Discussing harvest plans   │
│ 😤← Riku: Brief disagreement about... │
│ ❤️  Maro: Shared evening meal        │
│                                      │
│ Backstory:                           │
│ "Kana was born during the great     │
│  flood season, when the river...     │
│                                      │
├──────────────────────────────────────┤
│ [💬 Talk] [🤝 Assign Task] [📋 View] │
└──────────────────────────────────────┘
```

### 8.3 Build Menu (Press B or click toolbar)

```
┌─────────────────────────────┐
│ BUILD MENU              [X] │
├─────────────────────────────┤
│ 🏠 Hut          20W 10C 10T │
│ 📦 Storage     30W 15C      │
│ 🔥 Fire        10S 5W        │
│ 🗼 Watchtower  25W 15S       │
│ 💧 Well        15S 5C        │
│ 🌾 Farm Plot   5W            │
│ 🔨 Workshop   35W 20S        │
│ ⛩️ Shrine      40W 30S 10R   │
├─────────────────────────────┤
│ Resources: 🪵45 💧20 🪨15    │
│ W=Wood C=Clay T=Thatch S=Stone R=Rare │
└─────────────────────────────┘
```

### 8.4 Settings Panel

```
┌──────────────────────────────────────┐
│ SETTINGS                       [X]  │
├──────────────────────────────────────┤
│ LLM Configuration                     │
│ ┌────────────────────────────────┐   │
│ │ Endpoint: https://api.openai  │   │
│ │ Model: gpt-4o-mini             │   │
│ │ API Key: ●●●●●●●●●●●●●●        │   │
│ │ Max Tokens: 500                │   │
│ │ Temperature: 0.8                │   │
│ └────────────────────────────────┘   │
│                                      │
│ Simulation                            │
│ ├─ Day Length: [10] minutes         │
│ ├─ Start Date: Day 1, Year 1         │
│ ├─ End Date: [Unlimited ▼]           │
│ └─ Initial Population: [6 ▼]         │
│                                      │
│ Graphics                              │
│ ├─ Show Speech Bubbles: [✓]         │
│ ├─ Show Name Labels: [✓]            │
│ ├─ Lighting Effects: [✓]            │
│ └─ Particle Effects: [✓]            │
│                                      │
│ Audio                                 │
│ └─ Master Volume: [██░░░] 40%       │
│                                      │
│ [Test Connection] [Save] [Cancel]    │
└──────────────────────────────────────┘
```

### 8.5 Minimap

- Top-right corner, 150x150 pixels
- Shows entire continent overview
- Blinking dot for each villager
- Color-coded resource density
- Click to quick-pan camera

---

## 9. Speech Bubble & Interaction System

### 9.1 Speech Bubble Display

- Appears above villager when interacting with others or自言自语
- Contains single emoji representing interaction theme
- Duration: 3-8 seconds based on interaction length
- Stacks if multiple interactions occur

### 9.2 Emoji Vocabulary

| Emoji | Meaning | Context |
|-------|---------|---------|
| 💬 | Talking | General conversation |
| 😂 | Laughing | Jokes, funny stories |
| 😢 | Crying | Sad news, grief |
| 😠 | Angry | Conflict, disputes |
| 😍 | Love | Romantic, affectionate |
| 🤝 | Agreement | Making plans, deals |
| 😮 | Surprised | Unexpected events |
| 🤔 | Pondering | Deep discussion |
| 🍖 | Food | Eating, sharing food |
| 😴 | Tired | Sleepy, resting |
| 💪 | Working | Constructing, gathering |
| 🎣 | Fishing | Fishing activity |
| 🏠 | Home | Household topics |
| 👶 | Child | Baby/child matters |
| 🙏 | Religious | Spiritual activities |
| 🎉 | Celebration | Festivals, achievements |

### 9.3 LLM-Generated Interaction Content

The LLM generates:
1. What the interaction is about
2. The emotional tone
3. Which emoji best represents it
4. Key dialogue snippets (stored in villager log)

---

## 10. LLM Simulation Engine

### 10.1 Simulation Loop

```
Every simulation tick (every 5-10 game seconds):

1. Collect villager states (position, needs, relationships, current activity)
2. Group villagers by proximity for potential interactions
3. Build prompt with:
   - World state summary
   - Each villager's current status
   - Recent events
   - Time/date context
4. Send to LLM API
5. Parse response for each villager:
   - Intended action
   - Target (if any)
   - Duration
   - Interaction partner (if any)
6. Execute actions, update world state
7. Queue speech bubbles and interaction logs
```

### 10.2 Prompt Structure

```
SYSTEM: You are the simulation engine for Simville, a tribal village life simulator.
Generate realistic actions for each villager based on their personalities,
needs, and relationships. Output valid JSON.

REALM: {continent_description}
VILLAGERS: {list_of_villagers_with_all_attributes}
TIME: Day {day}, {time_of_day}
RECENT_EVENTS: {last 5 significant events}
VILLAGE_STATE: {resources, structures, population}

Respond with JSON array of villager actions for the next tick.
```

### 10.3 Action Validation

- Actions validated against world state
- Invalid actions (e.g., gathering from empty node) are caught and re-routed
- Resource requirements checked before action execution

---

## 11. Save/Load System

### 11.1 Save Data Structure

```
Save File: save_{timestamp}.json
├── world: { tiles, biomes, resources }
├── villagers: [ { full villager object } ]
├── structures: [ { position, type, owner } ]
├── relationships: [ { villager1, villager2, score, type } ]
├── time: { day, hour, minute }
├── stats: { births, deaths, structures_built, ... }
└── config: { world_seed, simulation_settings }
```

### 11.2 Auto-save

- Auto-save every in-game day
- Keep last 5 auto-saves
- Manual save via Ctrl+S

---

## 12. Village Chronicle System

The Village Chronicle is an auto-generated historical record that captures the meaningful events and stories of the village as they unfold.

### 12.1 Chronicle Entries

| Entry Type | Trigger | Description |
|------------|---------|-------------|
| **Legendary Event** | Major happenings (floods, battles, births) | Full narrative paragraph |
| **Daily Summary** | End of each day | "Day 15: The village gathered to celebrate the harvest..." |
| **Time-of-Day Transition** | Dawn/Morning/Afternoon/Evening/Night | Atmospheric narrative about the time |
| **Periodic Status** | Every ~50 seconds of simulation | Village activity updates |
| **Social Interaction** | Arguments, sharing, romance, helping | Notable villager interactions |
| **Milestone** | Achievements unlocked | "First child born in the village!", "Village population reached 10" |
| **Relationship Milestone** | New romances, friendships, rivalries | "Toma and Kana have become close companions" |
| **Death Record** | Villager passes | Memorial entry with villager's legacy |
| **Legend** | Extraordinary events | "The Great Flood of Year One" - persists in memory |
| **Season Change** | New season begins | "The Wet Season has arrived..." |
| **Resource Status** | Every 3 days | Food scarcity or plenty reports |
| **Villager Highlight** | Every 5 days | Individual villager mood reports |

### 12.2 Chronicle UI

```
┌─────────────────────────────────────────────┐
│ VILLAGE CHRONICLE                      [X] │
├─────────────────────────────────────────────┤
│ ┌─ LEGENDS ──────────────────────────────┐ │
│ │ ★ The Day the River Flooded (Day 12)   │ │
│ │ ★ Kana's Great Hunt (Day 8)            │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─ RECENT ENTRIES ────────────────────────┐ │
│ │ Day 15 - The harvest moon rose over...  │ │
│ │ Day 14 - Riku and Toma had a...         │ │
│ │ Day 13 - A new hut was built...         │ │
│ │ Day 12 - The river swallowed the...     │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [Prev] [Page 2 of 12] [Next]               │
└─────────────────────────────────────────────┘
```

### 12.3 LLM Chronicle Generation

```
SYSTEM: Write a brief chronicle entry (2-3 sentences) for this event.
Use evocative, oral-tradition style language.

EVENT: {event_description}
VILLAGE_MOOD: {collective_mood}
DAY: {day_number}

Output only the chronicle text, no formatting.
```

---

## 13. Secrets & Intrigue System

Villagers can harbor hidden information, creating drama and mystery.

### 13.1 Secret Types

| Secret Type | Description | Potential Consequences |
|-------------|-------------|----------------------|
| **Hidden Talent** | Villager is skilled at something they hide | Can be revealed through events |
| **Past Betrayal** | Did something to another villager | Could emerge and cause conflict |
| **Forbidden Romance** | Secret relationship | Jealousy if discovered |
| **Hidden Stash** | Resources hoisted away | Discovery creates drama |
| **Illness** | Sick but hiding it | Can spread disease |
| **Aspiration** | Secret dream they haven't told anyone | Personal goal tracking |
| **Grudge** | Secret dislike of another villager | Passive-aggressive behavior |

### 13.2 Secret Attributes

```javascript
villager.secrets = {
  type: "hidden_talent" | "past_betrayal" | "forbidden_romance" | "hidden_stash" | "illness" | "aspiration" | "grudge",
  target: villager_id,  // for betrayals, romances, grudges
  description: "Free-text LLM-generated description",
  secrecyLevel: 1-5,    // how hard to discover
  discoveryTriggers: ["high_relationship", "crisis_event", "other_secret_revealed"]
}
```

### 13.3 Secret Discovery

- Secrets can only be discovered through specific interactions/events
- LLM generates discovery moments naturally
- Once revealed, secret may become public knowledge or remain between parties
- Some secrets can be weaponized by gossips

### 13.4 Gossip System

```
Gossip spreads through the village:
1. Villager learns secret (through interaction or observation)
2. If sociable, they may share with others
3. Gossip travels 1-2 villagers per day cycle
4. Secrets spread until they become village knowledge or are suppressed
```

---

## 14. Seasonal Cycle System

### 14.1 Seasons

| Season | Duration | Effects |
|--------|----------|---------|
| **Wet Season** | 30 in-game days | Rainy, resources plentiful, disease risk higher, mood boost from rain |
| **Dry Season** | 30 in-game days | Hot, water scarce, fire risk, crops need irrigation |
| **Harvest Season** | 15 in-game days | Extra food gathering, festival opportunities, celebration mood |
| **Deep Dry** | 15 in-game days | Hottest period, food scarcity, conflicts over resources |

### 14.2 Seasonal Effects

**Wet Season:**
- Rain particle effects (toggleable)
- Rivers swell (more fish, but flood risk)
- Crops grow faster
- Villagers stay indoors more (socializing indoors)
- Mosquito swarms (disease vector - minor mechanic)

**Dry Season:**
- Drought conditions in some areas
- Water sources shrink
- Fire risk increases (wildfires can spawn)
- Villagers tire faster (heat exhaustion)
- Night is more pleasant (cool temperatures)

**Harvest Season:**
- +50% food from gathering
- Natural festival trigger available
- Villager mood +20 baseline
- Best time for hunting (animals emerge)

**Deep Dry:**
- -30% food from gathering
- Water sources critical
- Highest conflict rates
- Villager mood -10 baseline

### 14.3 Visual Indicators

```
Season Display in HUD:
🌧️ Wet Season (Day 12/30) [========--------] 40%
☀️ Dry Season - Day 8/30 [====--------------] 26%
🌾 Harvest - Day 5/15 [===========---------] 86%
🔥 Deep Dry - Day 12/15 [================--] 80%
```

### 14.4 Seasonal Planning

- Villagers (via LLM) should prepare for upcoming seasons
- Build water storage before dry season
- Stockpile food before deep dry
- Wet season good for construction (clay availability)

---

## 15. Ritual System

### 15.1 Ritual Types

| Ritual | Frequency | Participants | Effect |
|--------|-----------|--------------|--------|
| **Morning Blessing** | Daily at dawn | All awake villagers | Community mood +5, social bonds |
| **Harvest Dance** | End of harvest season | Entire village | Massive mood boost, relationship gains |
| **Coming of Age** | When youth turns 18 | Youth + family + chieftan | Youth gains adult status, skill boost |
| **Funeral Rite** | When villager dies | All villagers | Grief management, community healing |
| **Name Ceremony** | When baby is born | Family + witnesses | Child gets full identity |
| **Marriage Ceremony** | When couple decides to marry | Two villagers + witnesses | Romantic relationship formalized |
| **Prayer for Rain** | During drought | Volunteers | Small chance of weather change, major mood boost |
| **Spirit Communion** | Rare, elder-led | Elders + chieftan | LLM-generates ancestor message (guidance) |

### 15.2 Ritual Components

```
Ritual = {
  name: "Morning Blessing",
  time: "dawn",
  location: "communal_fire" | "shrine" | "village_center",
  duration: 5-15 minutes,
  participants: "all" | "adults" | "specific",
  moodBoost: 5,
  socialGain: 2,
  requiredResources: ["firewood"],
  llmGeneratedDialogue: true,
  emoji: 🙏
}
```

### 15.3 LLM Ritual Generation

```
SYSTEM: Describe this ritual scene in 2-3 sentences.
Include sensory details (sounds, smells) and the emotional tone.
Describe what the villager is saying or doing.

RITUAL: {ritual_name}
VILLAGER: {villager_name}
VILLAGE_CULTURE: {cultural_nuances_from_worldgen}

Output: 2-3 sentence description suitable for chronicle.
```

### 15.4 Ritual Mood Effects

- Attending rituals: Relationship +3 with all participants
- Skipping rituals: Relationship -5 with ritual leaders, mood -10 (shame)
- Leading rituals (chieftan/elder): Prestige increase
- First-time rituals (coming of age, first harvest dance): Special significance

---

## 16. Personal Goals System

### 16.1 Goal Types

| Goal Type | Description | Example |
|-----------|-------------|---------|
| **Aspiration** | Deep personal dreams | "Build the greatest hut in the village" |
| **Skill Goal** | Master a specific skill | "Become the best hunter" |
| **Relationship Goal** | Form specific bonds | "Win the heart of Kana" |
| **Legacy Goal** | Leave something behind | "Have a child who becomes chieftan" |
| **Social Goal** | Achieve status | "Become respected as an elder" |
| **Survival Goal** | Immediate needs | "Find enough food today" |

### 16.2 Goal Attributes

```javascript
villager.goals = [{
  type: "aspiration" | "skill" | "relationship" | "legacy" | "social",
  description: "LLM-generated goal text",
  target: villager_id | skill_name | null,
  progress: 0-100,
  difficulty: "easy" | "medium" | "hard" | "epic",
  milestones: ["step1", "step2", "step3"],
  completed: false,
  failed: false,
  failureCondition: "condition_that_fails_goal"
}]
```

### 16.3 Goal Generation

At world generation and when villagers reach life stages:

```
SYSTEM: Generate 1-2 personal goals for this villager based on their personality.
Use their traits to determine what they would naturally want.

VILLAGER: {name}, {age}, personality: {traits}
RELATIONSHIPS: {current_relationships}
SKILLS: {current_skills}
VILLAGE_NEEDS: {what_village_lacks}

Output JSON: { goals: [{ type, description, difficulty, milestones }] }
```

### 16.4 Goal Visibility

- **Hidden Goals:** Aspirations and some social goals (70%)
- **Shared Goals:** Skill and survival goals visible to player
- **Public Goals:** Relationship goals may be announced ("Toma seeks a mate")

### 16.5 Goal Fulfillment

- LLM determines when milestones are reached
- Major goals trigger special events when completed
- Failed goals affect mood significantly (-20 to -50)
- Goals can be abandoned (mood -10) or changed (rare)

---

## 17. Sound Design (Placeholder for Implementation)

| Sound Type | Description |
|------------|-------------|
| **Ambient** | Jungle sounds, birds, water |
| **Footsteps** | Soft grass, crunchy leaves, wood creaks |
| **Interactions** | Soft chit-chat sounds |
| **Construction** | Hammering, sawing |
| **Weather** | Rain, thunder |
| **Music** | Simple tribal percussion loop |

---

## 18. Configuration Files

### 13.1 config.json (App Settings)

```json
{
  "llm": {
    "endpoint": "https://api.openai.com/v1",
    "model": "gpt-4o-mini",
    "apiKey": "",
    "maxTokens": 500,
    "temperature": 0.8
  },
  "simulation": {
    "dayLengthMinutes": 10,
    "initialPopulation": 6,
    "worldSize": 64,
    "endCondition": "unlimited"
  },
  "graphics": {
    "pixelScale": 2,
    "showSpeechBubbles": true,
    "showLabels": true,
    "lighting": true,
    "particles": true
  },
  "audio": {
    "masterVolume": 0.5,
    "musicVolume": 0.3,
    "sfxVolume": 0.7
  }
}
```

---

## 19. File Structure

```
simville/
├── package.json
├── electron-builder.json
├── src/
│   ├── main/
│   │   └── main.js              # Electron main process
│   ├── renderer/
│   │   ├── index.html            # Main window HTML
│   │   ├── css/
│   │   │   └── style.css         # UI styling
│   │   ├── js/
│   │   │   ├── game.js          # Main game loop
│   │   │   ├── world.js         # World generation & rendering
│   │   │   ├── villager.js      # Villager class & AI
│   │   │   ├── ui.js            # UI management
│   │   │   ├── llm.js           # LLM API integration
│   │   │   ├── audio.js        # Audio management
│   │   │   └── utils.js         # Utility functions
│   │   └── assets/
│   │       ├── sprites/         # Pixel art sprites
│   │       ├── fonts/            # Pixel font
│   │       └── sounds/           # Audio files
│   └── shared/
│       └── constants.js         # Shared constants
├── saves/                        # Save files directory
└── SPEC.md
```

---

## 20. Acceptance Criteria

### 20.1 Core Functionality

- [ ] Game launches without errors on Windows
- [ ] LLM connection can be configured and tested
- [ ] World generates with correct biomes and resources
- [ ] 6 villagers spawn with unique personalities and backstories
- [ ] Day/night cycle runs continuously
- [ ] Villagers move, work, and interact in real-time
- [ ] Speech bubbles appear with correct emojis

### 20.2 User Interaction

- [ ] Camera pans and zooms smoothly
- [ ] Clicking villager opens detail pane with live updates
- [ ] Build menu allows construction of structures
- [ ] Resources are consumed/produced correctly
- [ ] Settings can be modified and saved

### 20.3 Simulation Depth

- [ ] Villagers pursue goals based on needs
- [ ] Relationships change over time
- [ ] New villagers can be born (marriage → pregnancy → birth)
- [ ] Village expands with new structures
- [ ] Villager actions feel personality-consistent

### 20.4 Visual Polish

- [ ] Pixel art renders crisply at all zoom levels
- [ ] Lighting changes smoothly with time of day
- [ ] Animations play for walking, working, idle states
- [ ] UI is readable and consistent in style

### 20.5 Edge Cases

- [ ] API failure does not crash game (graceful fallback)
- [ ] Villager death removes from simulation properly
- [ ] Resource depletion handled correctly
- [ ] Save/load preserves all game state

### 20.6 Village Chronicle

- [ ] Chronicle records major events automatically
- [ ] Daily summaries generated at end of each day
- [ ] Legendary events get special "legendary" status
- [ ] Chronicle UI is scrollable and readable
- [ ] Chronicle entries persist in save files

### 20.7 Secrets System

- [ ] Villagers can have hidden secrets generated at creation
- [ ] Secrets can be discovered through interactions
- [ ] Gossip spreads revealed secrets through village
- [ ] Some secrets remain hidden; others become public
- [ ] Secret discovery creates dramatic moments

### 20.8 Seasonal Cycle

- [ ] Seasons cycle automatically (Wet → Dry → Harvest → Deep Dry)
- [ ] Each season has distinct visual and gameplay effects
- [ ] Resource availability changes with seasons
- [ ] Villager moods affected by seasons
- [ ] Village can prepare for seasons (strategic depth)

### 20.9 Ritual System

- [ ] Morning blessing occurs daily at dawn
- [ ] Harvest dance triggers at end of harvest season
- [ ] Coming-of-age ritual triggers when youth becomes adult
- [ ] Funeral rites occur when villagers die
- [ ] Marriage ceremonies when couples decide to marry
- [ ] Rituals provide mood and relationship benefits

### 20.10 Personal Goals

- [ ] Each villager has at least one personal goal
- [ ] Goals are visible in villager detail pane
- [ ] Progress updates as goals are pursued
- [ ] Goal completion triggers celebration
- [ ] Failed goals affect villager mood

---

## 21. Future Enhancements (Out of Scope for V1)

- Multi-village diplomacy and war
- Procedural storytelling with LLM-generated narratives
- Weather events (storms, floods, droughts)
- Disease and healing systems
- Technology tree progression
- Mobile companion app for remote monitoring
