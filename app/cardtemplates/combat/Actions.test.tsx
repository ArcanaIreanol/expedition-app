import {initCombat, initCustomCombat, isSurgeNextRound, handleCombatTimerStop, handleCombatEnd, tierSumDelta, adventurerDelta, handleResolvePhase, midCombatChoice} from './Actions'
import {DifficultyType, FontSizeType} from '../../reducers/StateTypes'
import {ParserNode, defaultContext, renderCardTemplate} from '../Template'
import {newMockStore, Action} from '../../Testing'
import {RemotePlayClient} from '../../RemotePlay'

const cheerio: any = require('cheerio');

const TEST_SETTINGS = {
  audioEnabled: false,
  autoRoll: false,
  contentSets: {
    horror: false,
  },
  difficulty: 'NORMAL' as DifficultyType,
  fontSize: 'NORMAL' as FontSizeType,
  multitouch: true,
  numPlayers: 3,
  showHelp: true,
  timerSeconds: 10,
  vibration: true,
};

const TEST_NODE = new ParserNode(cheerio.load('<combat><e>Test</e><e>Lich</e><e>lich</e><event on="win"></event><event on="lose"></event></combat>')('combat'), defaultContext());

describe('Combat actions', () => {
  const baseNode = Action(initCombat as any).execute({node: TEST_NODE.clone(), settings: TEST_SETTINGS})[1].node;;

  const newCombatNode = () => {
    return baseNode.clone();
  }

  describe('initCombat', () => {
    const actions = Action(initCombat as any).execute({node: TEST_NODE.clone(), settings: TEST_SETTINGS});

    it('triggers nav to combat start', () => {
      expect(actions[2]).toEqual(jasmine.objectContaining({
        type: 'NAVIGATE',
        to: jasmine.objectContaining({
          name: 'QUEST_CARD',
          phase: 'DRAW_ENEMIES',
        })
      }));
    });

    it('parses initial state', () => {
      // "Unknown" enemies are given tier 1.
      // Known enemies' tier is parsed from constants.
      expect(actions[1].node.ctx.templates.combat).toEqual(jasmine.objectContaining({
        custom: false,
        roundCount: 0,
        tier: 9,
        numAliveAdventurers: 3,
        enemies: [
          {name: 'Test', tier: 1},
          {name: 'Lich', tier: 4, class: 'Undead'},
          {name: 'Lich', tier: 4, class: 'Undead'}
        ],
      }));
    });

  });

  describe('initCustomCombat', () => {
    const actions = Action(initCustomCombat as any).execute({settings: TEST_SETTINGS});

    it('has custom=true', () => {
      expect(actions[1].node.ctx.templates.combat).toEqual(jasmine.objectContaining({
        custom: true
      }));
    });

    it('identifies as a combat element', () => {
      expect(actions[1].node.getTag()).toEqual('combat');
    });
  });

  describe('isSurgeNextRound', () => {
    it('surges according to the period', () => {
      // "Play" until surge
      const store = newMockStore({});
      let node = newCombatNode();
      for(let i = 0; i < 10 && (!node || !isSurgeNextRound(node)); i++) {
        store.clearActions();
        store.dispatch(handleCombatTimerStop({node, settings: TEST_SETTINGS, elapsedMillis: 1000, seed: ''}));
        const actions = store.getActions();
        for (const a of actions) {
          if (a.type === 'QUEST_NODE') {
            node = a.node;
            break;
          }
        }
      }
      expect(isSurgeNextRound(node)).toEqual(true);

      // Count time till next surge
      let pd = 0;
      do {
        store.clearActions();
        store.dispatch(handleCombatTimerStop({node, settings: TEST_SETTINGS, elapsedMillis: 1000, seed: ''}));
        const actions = store.getActions();
        for (const a of actions) {
          if (a.type === 'QUEST_NODE') {
            node = a.node;
            break;
          }
        }
        pd++;
      } while (pd < 10 && !isSurgeNextRound(node));
      expect(pd).toEqual(3); // Default for normal difficulty
    });
  });

  describe('handleCombatTimerStop', () => {
    const store = newMockStore({});
    store.dispatch(handleCombatTimerStop({node: newCombatNode(), settings: TEST_SETTINGS, elapsedMillis: 1000, seed: ''}));
    const actions = store.getActions();

    it('randomly assigns damage', () => {
      expect(actions[2].node.ctx.templates.combat.mostRecentAttack.damage).toBeDefined();
    });
    it('generates rolls according to player count', () => {
      expect(actions[2].node.ctx.templates.combat.mostRecentRolls.length).toEqual(3);
    });
    it('increments the round counter', () => {
      expect(actions[2].node.ctx.templates.combat.roundCount).toEqual(1);
    });
  });

  describe('handleCombatEnd', () => {
    it('levels up if high maxTier on victory', () => {
      const store = newMockStore({});
      store.dispatch(handleCombatEnd({node: newCombatNode(), settings: TEST_SETTINGS, victory: true, maxTier: 9, seed: ''}));

      expect(store.getActions()[1].node.ctx.templates.combat.levelUp).toEqual(true);
    });

    it('does not level up if low maxTier on victory', () => {
      const store = newMockStore({});
      store.dispatch(handleCombatEnd({node: newCombatNode(), settings: TEST_SETTINGS, victory: true, maxTier: 1, seed: ''}));

      expect(store.getActions()[1].node.ctx.templates.combat.levelUp).toEqual(false);
    });

    it('assigns random loot on victory', () => {
      const store = newMockStore({});
      store.dispatch(handleCombatEnd({node: newCombatNode(), settings: TEST_SETTINGS, victory: true, maxTier: 9, seed: ''}));

      const loot = store.getActions()[1].node.ctx.templates.combat.loot;
      let lootCount = 0;
      for(const l of loot) {
        lootCount += l.count;
      }
      expect(lootCount).toBeGreaterThan(0);
    });

    it('never assigns loot or levels up on defeat', () => {
      const store = newMockStore({});
      store.dispatch(handleCombatEnd({node: newCombatNode(), settings: TEST_SETTINGS, victory: false, maxTier: 9, seed: ''}));
      expect(store.getActions()[1].node.ctx.templates.combat).toEqual(jasmine.objectContaining({
        levelUp: false,
        loot: [],
      }));
    });
  });

  describe('tierSumDelta', () => {
    it('increases', () => {
      const node = Action(tierSumDelta).execute({node: newCombatNode(), current: 9, delta: 1})[0].node;
      expect(node.ctx.templates.combat.tier).toEqual(10);
    });
    it('decreases', () => {
      const node = Action(tierSumDelta).execute({node: newCombatNode(), current: 9, delta: -1})[0].node;
      expect(node.ctx.templates.combat.tier).toEqual(8);
    });
    it('does not go below 0', () => {
      const node = Action(tierSumDelta).execute({node: newCombatNode(), current: 9, delta: -1000})[0].node;
      expect(node.ctx.templates.combat.tier).toEqual(0);
    });
  })

  describe('adventurerDelta', () => {
    it('increases', () => {
      const node = Action(adventurerDelta).execute({node: newCombatNode(), settings: TEST_SETTINGS, current: 1, delta: 2})[0].node;
      expect(node.ctx.templates.combat.numAliveAdventurers).toEqual(3);
    });
    it('decreases', () => {
      const node = Action(adventurerDelta).execute({node: newCombatNode(), settings: TEST_SETTINGS, current: 3, delta: -1})[0].node;
      expect(node.ctx.templates.combat.numAliveAdventurers).toEqual(2);
    });
    it('does not go above player count', () => {
      const node = Action(adventurerDelta).execute({node: newCombatNode(), settings: TEST_SETTINGS, current: TEST_SETTINGS.numPlayers, delta: 1})[0].node;
      expect(node.ctx.templates.combat.numAliveAdventurers).toEqual(TEST_SETTINGS.numPlayers);
    });
    it('does not go below 0', () => {
      const node = Action(adventurerDelta).execute({node: newCombatNode(), settings: TEST_SETTINGS, current: 1, delta: -2})[0].node;
      expect(node.ctx.templates.combat.numAliveAdventurers).toEqual(0);
    });
    it('does not go below 0', () => {
      const node = Action(adventurerDelta).execute({node: newCombatNode(), settings: TEST_SETTINGS, current: 3, delta: -1000})[0].node;
      expect(node.ctx.templates.combat.numAliveAdventurers).toEqual(0);
    });
    it('does not go above the player count', () => {
      const node = Action(adventurerDelta).execute({node: newCombatNode(), settings: TEST_SETTINGS, current: 2, delta: 1000})[0].node;
      expect(node.ctx.templates.combat.numAliveAdventurers).toEqual(3);
    });
  });

  describe('handleResolvePhase', () => {
    it('goes to resolve card if no round event handler', () => {
      const node = new ParserNode(cheerio.load(`<combat>
        <e>Test</e>
        <e>Lich</e>
        <e>lich</e>
        <event on="win"></event>
        <event on="lose"></event>
      </combat>`)('combat'), defaultContext());
      const actions = Action(handleResolvePhase).execute({node});
      expect(actions[1].to.phase).toEqual('RESOLVE_ABILITIES');
      expect(actions[2].type).toEqual('QUEST_NODE');
    });

    it('goes to resolve card if conditionally false round event handler', () => {
      const node = new ParserNode(cheerio.load(`<combat>
        <e>Test</e>
        <e>Lich</e>
        <e>lich</e>
        <event on="win"></event>
        <event on="lose"></event>
        <event if="false" on="round"><roleplay>bad</roleplay></event>
      </combat>`)('combat'), defaultContext());
      const actions = Action(handleResolvePhase).execute({node});
      expect(actions[1].to.phase).toEqual('RESOLVE_ABILITIES');
      expect(actions[2].type).toEqual('QUEST_NODE');
    });

    it('goes to roleplay card on round event handler', () => {
      let node = new ParserNode(cheerio.load(`<combat>
        <e>Test</e>
        <e>Lich</e>
        <e>lich</e>
        <event on="win"></event>
        <event on="round">
          <roleplay>expected</roleplay>
        </event>
        <event on="lose"></event>
      </combat>`)('combat'), defaultContext());
      node = Action(initCombat as any).execute({node: node.clone(), settings: TEST_SETTINGS})[1].node;
      const actions = Action(handleResolvePhase).execute({node});
      expect(actions[0].node.ctx.templates.combat.roleplay.elem.text()).toEqual('expected');
      expect(actions[2].to.phase).toEqual('ROLEPLAY');
    });
  });

  describe('midCombatChoice', () => {
    // Setup combat state where we've initialized combat and just finished a timed round.

    let baseNode = new ParserNode(cheerio.load(`<quest>
      <roleplay>Text</roleplay>
      <combat id="c1">
        <e>Test</e>
        <event on="win"><roleplay>win card</roleplay></event>
        <event on="lose"><roleplay>lose card</roleplay></event>
        <event on="round"><roleplay>
          <choice><trigger>win</trigger></choice>
          <choice><trigger>lose</trigger></choice>
          <choice><trigger>end</trigger></choice>
          <choice><roleplay id="rp2">rp2</roleplay></choice>
          <choice><trigger>goto outside</trigger></choice>
          <choice><trigger>goto rp2</trigger></choice>
        </roleplay></event>
      </combat>
      <roleplay id="outside">Outside Roleplay</roleplay>
    </quest>`)('#c1'), defaultContext());
    {
      baseNode = Action(initCombat as any).execute({node: baseNode, settings: TEST_SETTINGS})[1].node;
      baseNode = Action(handleResolvePhase).execute({node: baseNode})[0].node;
    }

    const newCombatNode = () => {
      return baseNode.clone();
    }

    it('goes to win screen on **win**', () => {
      const actions = Action(midCombatChoice).execute({settings: TEST_SETTINGS, parent: newCombatNode(), index: 0});
      expect(actions[1].node.elem.text()).toEqual('win card');
    });

    it('goes to lose screen on **lose**', () => {
      const actions = Action(midCombatChoice).execute({settings: TEST_SETTINGS, parent: newCombatNode(), index: 1});
      expect(actions[1].node.elem.text()).toEqual('lose card');
    });

    it('ends quest on **end**', () => {
      const actions = Action(midCombatChoice).execute({settings: TEST_SETTINGS, parent: newCombatNode(), index: 2});
      expect(actions[1].to.name).toEqual('QUEST_END');
    });

    it('goes to next round when pnode.getNext() falls outside of combat scope', () => {
      const node = newCombatNode();
      const rp2 = Action(midCombatChoice).execute({settings: TEST_SETTINGS, parent: node, index: 3})[2].node;
      const actions = Action(midCombatChoice).execute({settings: TEST_SETTINGS, parent: rp2, index: 0});
      expect(actions[1].to.phase).toEqual('RESOLVE_ABILITIES');
    });

    it('handles gotos that point to outside of combat', () => {
      const actions = Action(midCombatChoice).execute({settings: TEST_SETTINGS, parent: newCombatNode(), index: 4});
      expect(actions[1].node.getTag()).toEqual('roleplay');
      expect(actions[1].node.elem.text()).toEqual('Outside Roleplay');
    });

    it('handles GOTOs that point to other roleplaying inside of the same combat', () => {
      const actions = Action(midCombatChoice).execute({settings: TEST_SETTINGS, parent: newCombatNode(), index: 5});
      expect(actions[2].node.getTag()).toEqual('combat');
      expect(actions[2].node.ctx.templates.combat.roleplay.elem.text()).toEqual('rp2');
    });

    it('renders as combat for RPs inside of same combat', () => {
      const actions = Action(midCombatChoice).execute({settings: TEST_SETTINGS, parent: newCombatNode(), index: 3});
      expect(actions[2].node.getTag()).toEqual('combat');
    });
  });

  it('handles global player count change');

  it('clears combat state on completion');

});
