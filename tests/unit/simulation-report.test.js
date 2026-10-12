import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrapCoreModules, createHeadlessGame } from '../setup/load-scripts.js';

function makeVillage(id, name, displayIndex) {
  const village = new Village({
    id,
    name,
    displayIndex,
    center: { x: 4, y: 4 },
    villagerIds: [],
    originalPopulation: 5
  });
  village.chronicle.stats = { births: 1, deaths: 0, structuresBuilt: 2, marriages: 1 };
  village.techState.researched = ['tool_crafting'];
  village.chronicle.entries = [{ day: 2, text: `${name} lit the first fire.` }];
  village.chronicle.legendary = [{ title: 'Founding', text: 'We arrived.', day: 1 }];
  village.structureIds = ['hut-1'];
  village.resources = { food: 4, wood: 6, water: 3, stone: 1, herbs: 0, clay: 0, fish: 0, thatch: 0, rareMaterials: 0 };
  return village;
}

function makePerson(id, villageId, health = 100) {
  return new Villager({ id, name: id, villageId, health, age: 30 });
}

describe('SimulationReport', () => {
  beforeEach(() => {
    bootstrapCoreModules();
  });

  it('counts only living villagers and can drop below the starting five', () => {
    const village = makeVillage('tribe-a', 'Elderbrook', 0);
    const people = [
      makePerson('a1', village.id, 100),
      makePerson('a2', village.id, 40),
      makePerson('a3', village.id, 0),
      makePerson('a4', village.id, 0),
      makePerson('a5', village.id, 0)
    ];
    village.villagerIds = people.map((person) => person.id);
    const report = new SimulationReport({ villagers: people, villages: [village] });

    expect(report.livingVillagers(village.id)).toHaveLength(2);
    expect(report.livingCount(village.id)).toBe(2);
    expect(report.livingCount()).toBe(2);
    expect(report.livingCount(village.id)).toBeLessThan(5);
  });

  it('treats an empty roster and a fully dead roster as extinct', () => {
    const alive = new SimulationReport({ villagers: [{ health: 10, villageId: 'a' }] });
    const dead = new SimulationReport({ villagers: [{ health: 0 }, { health: 0 }] });
    const empty = new SimulationReport({ villagers: [] });

    expect(alive.isExtinct()).toBe(false);
    expect(dead.isExtinct()).toBe(true);
    expect(empty.isExtinct()).toBe(true);
  });

  it('remembers the peak when the living count falls below five', () => {
    const village = makeVillage('tribe-a', 'Elderbrook', 0);
    const people = [
      makePerson('a1', village.id, 100),
      makePerson('a2', village.id, 0),
      makePerson('a3', village.id, 0),
      makePerson('a4', village.id, 0),
      makePerson('a5', village.id, 0)
    ];
    const report = new SimulationReport({ villagers: people, villages: [village] });

    report.recordPeaks();
    expect(village.peakPopulation).toBe(5);

    people[0].health = 0;
    report.recordPeaks();
    expect(report.livingCount(village.id)).toBe(0);
    expect(village.peakPopulation).toBe(5);
  });

  it('drops stale villager ids so a roster cannot stay stuck at five', () => {
    const village = makeVillage('tribe-a', 'Elderbrook', 0);
    const people = [
      makePerson('a1', village.id, 100),
      makePerson('a2', village.id, 80),
      makePerson('a3', village.id, 0),
      makePerson('a4', village.id, 0),
      makePerson('a5', village.id, 0)
    ];
    village.villagerIds = ['ghost', 'a1', 'a2', 'a3', 'a4', 'a5'];
    const report = new SimulationReport({ villagers: people, villages: [village] });

    report.syncRosters();
    expect(village.villagerIds).toEqual(['a1', 'a2']);
  });

  it('builds a per-tribe summary and escaped dashboard markup', () => {
    const village = makeVillage('tribe-a', 'Elder<script>', 0);
    village.peakPopulation = 5;
    const people = [makePerson('a1', village.id, 0)];
    const report = new SimulationReport({
      villagers: people,
      villages: [village],
      timeState: { day: 9, hours: 14.5, season: { name: 'Dry Season' } }
    });

    const snapshot = report.tribeSnapshot(village);
    expect(snapshot.population).toBe(0);
    expect(snapshot.peakPopulation).toBe(5);
    expect(snapshot.births).toBe(1);
    expect(snapshot.technologies).toEqual(['tool_crafting']);

    const summary = report.buildSummary();
    expect(summary.extinct).toBe(true);
    expect(summary.day).toBe(9);
    expect(summary.totals.deaths).toBe(0);
    expect(summary.totals.technologies).toBe(1);
    expect(summary.totals.legends).toBe(1);

    expect(report.formatTechName('tool_crafting')).toBe('tool crafting');
    expect(report.escape('<b>')).toBe('&lt;b&gt;');
    expect(report.renderTotal('Births', 3)).toContain('Births');
    expect(report.renderTribeCard(snapshot)).toContain('peak 5');

    const html = report.toHtml(summary);
    expect(html).toContain('simulation has stopped');
    expect(html).toContain('Day 9');
    expect(html).toContain('Dry Season');
    expect(html).toContain('Elder&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('tool crafting');
    expect(html).toContain('peak 5');
  });
});

describe('Population HUD and extinction dashboard', () => {
  let game;

  beforeEach(() => {
    game = createHeadlessGame(5150);
    game.world = { size: 16, villageCenters: [{ x: 4, y: 4 }, { x: 20, y: 20 }] };
    game.economy = {
      getResourcesSnapshot() {
        return { wood: 1, food: 2, water: 3, stone: 4, herbs: 0, clay: 0, fish: 0, thatch: 0, rareMaterials: 0 };
      }
    };
    game.performRitual = () => {};

    const first = makeVillage('tribe-a', 'Elderbrook', 0);
    const second = makeVillage('tribe-b', 'Shadowglen', 1);
    const people = [];
    [first, second].forEach((village) => {
      for (let index = 0; index < 5; index += 1) {
        const person = makePerson(`${village.id}-${index}`, village.id, 100);
        people.push(person);
        village.villagerIds.push(person.id);
      }
      village.peakPopulation = 5;
    });

    game.villages = [first, second];
    game.villagers = people;
    game.hudVillageId = first.id;
    game.ui.updateTribeSelector(game.villages, first.id);
  });

  it('updates both tribe counts when population falls below the starting five', () => {
    const [first, second] = game.villages;
    // Leave stale ids at the original five while three people in each tribe are dead
    game.getVillagersForVillage(first.id).slice(0, 3).forEach((villager) => {
      villager.health = 0;
    });
    game.getVillagersForVillage(second.id).slice(0, 1).forEach((villager) => {
      villager.health = 0;
    });
    first.villagerIds = ['stale-1', 'stale-2', 'stale-3', 'stale-4', 'stale-5'];
    second.villagerIds = ['stale-6', 'stale-7', 'stale-8', 'stale-9', 'stale-10'];

    game.ui.updateHUD(game.timeState, game.getHudResources(), false, game.villages, first);

    expect(game.ui.elements.resPopulation.textContent).toBe('2');
    const labels = [...document.querySelectorAll('.tribe-pop')].map((node) => node.textContent);
    expect(labels).toEqual(['(2)', '(4)']);

    game.ui.updateHUD(game.timeState, game.getHudResources(), false, game.villages, second);
    expect(game.ui.elements.resPopulation.textContent).toBe('4');
    expect([...document.querySelectorAll('.tribe-pop')].map((node) => node.textContent)).toEqual(['(2)', '(4)']);
  });

  it('stops the simulation and shows both tribes on the statistics dashboard', () => {
    game.villagers.forEach((villager) => {
      villager.health = 0;
    });
    game.checkDeaths();
    game.processEventQueue();
    game.refreshLivingPopulation();
    game.ui.updateHUD(game.timeState, game.getHudResources(), game.paused, game.villages, game.getSelectedVillage());
    game.checkExtinction();

    expect(game.simulationOver).toBe(true);
    expect(game.paused).toBe(true);
    expect(game.ui.elements.resPopulation.textContent).toBe('0');
    expect([...document.querySelectorAll('.tribe-pop')].map((node) => node.textContent)).toEqual(['(0)', '(0)']);

    const dialog = document.getElementById('extinction-dialog');
    expect(dialog.classList.contains('hidden')).toBe(false);
    const body = document.getElementById('extinction-body').textContent;
    expect(body).toContain('simulation has stopped');
    expect(body).toContain('Elderbrook');
    expect(body).toContain('Shadowglen');
    expect(body).toContain('Births');
    expect(body).toContain('Deaths');
    expect(body).toMatch(/peak 5/);

    const deaths = game.villages.reduce((sum, village) => sum + village.chronicle.stats.deaths, 0);
    expect(deaths).toBe(10);

    game.togglePause();
    expect(game.paused).toBe(true);

    document.getElementById('btn-extinction-dismiss').click();
    expect(dialog.classList.contains('hidden')).toBe(true);
    expect(game.simulationOver).toBe(true);

    let restarted = false;
    game.newWorld = () => {
      restarted = true;
      game.simulationOver = false;
    };
    game.ui.showSimulationDashboard(game.simulationReport.buildSummary());
    document.getElementById('btn-extinction-new').click();
    expect(restarted).toBe(true);
    expect(dialog.classList.contains('hidden')).toBe(true);
  });

  it('does not end the run while anyone in either tribe is still alive', () => {
    game.villagers.slice(1).forEach((villager) => {
      villager.health = 0;
    });
    game.checkExtinction();
    expect(game.simulationOver).toBe(false);
    expect(document.getElementById('extinction-dialog')).toBeNull();
  });
});
