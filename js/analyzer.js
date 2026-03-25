/**
 * Balatro Hand Analyzer Engine
 * Evaluates all possible poker hands from a set of cards and scores them.
 */

const BalatroAnalyzer = (() => {

    const CHIP_VALUES = {
        '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
        '9': 9, '10': 10, 'J': 10, 'Q': 10, 'K': 10, 'A': 11
    };

    const RANK_ORDER = {
        'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9,
        '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
    };

    const BASE_HANDS = {
        'Flush Five':      { chips: 160, mult: 16, rank: 12 },
        'Flush House':     { chips: 140, mult: 14, rank: 11 },
        'Five of a Kind':  { chips: 120, mult: 12, rank: 10 },
        'Straight Flush':  { chips: 100, mult: 8,  rank: 9 },
        'Four of a Kind':  { chips: 60,  mult: 7,  rank: 8 },
        'Full House':      { chips: 40,  mult: 4,  rank: 7 },
        'Flush':           { chips: 35,  mult: 4,  rank: 6 },
        'Straight':        { chips: 30,  mult: 4,  rank: 5 },
        'Three of a Kind': { chips: 30,  mult: 3,  rank: 4 },
        'Two Pair':        { chips: 20,  mult: 2,  rank: 3 },
        'Pair':            { chips: 10,  mult: 2,  rank: 2 },
        'High Card':       { chips: 5,   mult: 1,  rank: 1 },
    };

    const LEVEL_SCALING = {
        'Flush Five':      { chips: 50, mult: 3 },
        'Flush House':     { chips: 40, mult: 3 },
        'Five of a Kind':  { chips: 35, mult: 3 },
        'Straight Flush':  { chips: 40, mult: 4 },
        'Four of a Kind':  { chips: 30, mult: 3 },
        'Full House':      { chips: 25, mult: 2 },
        'Flush':           { chips: 15, mult: 2 },
        'Straight':        { chips: 30, mult: 3 },
        'Three of a Kind': { chips: 20, mult: 2 },
        'Two Pair':        { chips: 20, mult: 1 },
        'Pair':            { chips: 15, mult: 1 },
        'High Card':       { chips: 10, mult: 1 },
    };

    function getHandScore(handType, level = 1) {
        const base = BASE_HANDS[handType];
        const scale = LEVEL_SCALING[handType];
        if (!base || !scale) return { chips: 0, mult: 0 };
        const lvl = Math.max(1, level) - 1;
        return {
            chips: base.chips + scale.chips * lvl,
            mult: base.mult + scale.mult * lvl,
            rank: base.rank
        };
    }

    function combinations(arr, k) {
        if (k === 0) return [[]];
        if (arr.length < k) return [];
        const results = [];
        function combine(start, combo) {
            if (combo.length === k) {
                results.push([...combo]);
                return;
            }
            for (let i = start; i <= arr.length - (k - combo.length); i++) {
                combo.push(arr[i]);
                combine(i + 1, combo);
                combo.pop();
            }
        }
        combine(0, []);
        return results;
    }

    function identifyHand(cards) {
        if (cards.length === 0) return { type: 'High Card', scoringCards: [] };

        const ranks = cards.map(c => c.rank);
        const suits = cards.map(c => c.suit);

        const rankCounts = {};
        for (const r of ranks) {
            rankCounts[r] = (rankCounts[r] || 0) + 1;
        }
        const counts = Object.values(rankCounts).sort((a, b) => b - a);

        const isFlush = cards.length >= 5 && new Set(suits).size === 1;
        const isStraight = checkStraight(ranks);

        if (counts[0] >= 5) {
            if (isFlush) return { type: 'Flush Five', scoringCards: cards };
            return { type: 'Five of a Kind', scoringCards: cards };
        }

        if (counts[0] === 4) {
            if (isFlush && isStraight) return { type: 'Straight Flush', scoringCards: cards };
            if (isFlush && counts[1] === 1) return { type: 'Flush', scoringCards: cards };
            const fourRank = Object.keys(rankCounts).find(r => rankCounts[r] === 4);
            const scoringCards = cards.filter(c => c.rank === fourRank);
            return { type: 'Four of a Kind', scoringCards };
        }

        if (counts[0] === 3) {
            if (counts[1] >= 2) {
                if (isFlush) return { type: 'Flush House', scoringCards: cards };
                const threeRank = Object.keys(rankCounts).find(r => rankCounts[r] === 3);
                const pairRank = Object.keys(rankCounts).find(r => rankCounts[r] >= 2 && r !== threeRank);
                const scoringCards = cards.filter(c => c.rank === threeRank || c.rank === pairRank);
                return { type: 'Full House', scoringCards };
            }
            if (isFlush && isStraight) return { type: 'Straight Flush', scoringCards: cards };
            if (isFlush) return { type: 'Flush', scoringCards: cards };
            if (isStraight) return { type: 'Straight', scoringCards: cards };
            const threeRank = Object.keys(rankCounts).find(r => rankCounts[r] === 3);
            const scoringCards = cards.filter(c => c.rank === threeRank);
            return { type: 'Three of a Kind', scoringCards };
        }

        if (isFlush && isStraight) return { type: 'Straight Flush', scoringCards: cards };
        if (isFlush) return { type: 'Flush', scoringCards: cards };
        if (isStraight) return { type: 'Straight', scoringCards: cards };

        if (counts[0] === 2 && counts[1] === 2) {
            const pairRanks = Object.keys(rankCounts).filter(r => rankCounts[r] === 2);
            const scoringCards = cards.filter(c => pairRanks.includes(c.rank));
            return { type: 'Two Pair', scoringCards };
        }

        if (counts[0] === 2) {
            const pairRank = Object.keys(rankCounts).find(r => rankCounts[r] === 2);
            const scoringCards = cards.filter(c => c.rank === pairRank);
            return { type: 'Pair', scoringCards };
        }

        const sorted = [...cards].sort((a, b) => RANK_ORDER[b.rank] - RANK_ORDER[a.rank]);
        return { type: 'High Card', scoringCards: [sorted[0]] };
    }

    function checkStraight(ranks) {
        if (ranks.length < 5) return false;
        const values = [...new Set(ranks.map(r => RANK_ORDER[r]))].sort((a, b) => b - a);
        if (values.length < 5) return false;

        for (let i = 0; i <= values.length - 5; i++) {
            if (values[i] - values[i + 4] === 4) return true;
        }

        if (values.includes(14) && values.includes(2) && values.includes(3) &&
            values.includes(4) && values.includes(5)) {
            return true;
        }

        return false;
    }

    function calculateScore(cards, handType, handLevels = {}, jokers = []) {
        const level = handLevels[handType] || 1;
        const handScore = getHandScore(handType, level);
        const { scoringCards } = identifyHand(cards);

        let chips = handScore.chips;
        for (const card of scoringCards) {
            chips += CHIP_VALUES[card.rank] || 0;
            if (card.enhancement === 'Bonus') chips += 30;
        }

        let mult = handScore.mult;

        for (const joker of jokers) {
            const effect = getSimpleJokerEffect(joker, cards, handType, scoringCards);
            chips += effect.addChips || 0;
            mult += effect.addMult || 0;
        }

        let xMult = 1;
        for (const joker of jokers) {
            const effect = getSimpleJokerEffect(joker, cards, handType, scoringCards);
            xMult *= effect.xMult || 1;
        }

        const totalScore = Math.floor(chips * mult * xMult);

        return {
            handType, level,
            baseChips: handScore.chips,
            cardChips: chips - handScore.chips,
            totalChips: chips,
            baseMult: handScore.mult,
            totalMult: mult,
            xMult, totalScore, scoringCards,
            rank: handScore.rank
        };
    }

    function getSimpleJokerEffect(joker, cards, handType, scoringCards) {
        const name = (joker.name || '').toLowerCase();
        const effect = {};

        switch (name) {
            // --- Basic Joker ---
            case 'joker': effect.addMult = 4; break;

            // --- Suit Mult Jokers (+4 Mult per suited scoring card) ---
            case 'greedy joker': effect.addMult = 4 * scoringCards.filter(c => c.suit === 'Diamonds').length; break;
            case 'lusty joker': effect.addMult = 4 * scoringCards.filter(c => c.suit === 'Hearts').length; break;
            case 'wrathful joker': effect.addMult = 4 * scoringCards.filter(c => c.suit === 'Spades').length; break;
            case 'gluttonous joker': effect.addMult = 4 * scoringCards.filter(c => c.suit === 'Clubs').length; break;

            // --- Hand Type Mult Jokers ---
            case 'jolly joker': if (hasPair(scoringCards)) effect.addMult = 8; break;
            case 'zany joker': if (hasThreeOfAKind(scoringCards)) effect.addMult = 12; break;
            case 'mad joker': if (hasTwoPair(scoringCards)) effect.addMult = 10; break;
            case 'crazy joker': if (['Straight', 'Straight Flush'].includes(handType)) effect.addMult = 12; break;
            case 'droll joker': if (['Flush', 'Flush House', 'Flush Five', 'Straight Flush'].includes(handType)) effect.addMult = 10; break;

            // --- Hand Type Chips Jokers ---
            case 'sly joker': if (hasPair(scoringCards)) effect.addChips = 50; break;
            case 'wily joker': if (hasThreeOfAKind(scoringCards)) effect.addChips = 100; break;
            case 'clever joker': if (hasTwoPair(scoringCards)) effect.addChips = 80; break;
            case 'devious joker': if (['Straight', 'Straight Flush'].includes(handType)) effect.addChips = 100; break;
            case 'crafty joker': if (['Flush', 'Flush House', 'Flush Five', 'Straight Flush'].includes(handType)) effect.addChips = 80; break;

            // --- Card Count ---
            case 'half joker': if (cards.length <= 3) effect.addMult = 20; break;

            // --- Rank-based Chips/Mult ---
            case 'scary face': effect.addChips = 30 * scoringCards.filter(c => ['J', 'Q', 'K'].includes(c.rank)).length; break;
            case 'smiley face': effect.addMult = 5 * scoringCards.filter(c => ['J', 'Q', 'K'].includes(c.rank)).length; break;
            case 'even steven': effect.addMult = 4 * scoringCards.filter(c => ['10', '8', '6', '4', '2'].includes(c.rank)).length; break;
            case 'odd todd': effect.addChips = 31 * scoringCards.filter(c => ['A', '9', '7', '5', '3'].includes(c.rank)).length; break;
            case 'scholar': {
                const aces = scoringCards.filter(c => c.rank === 'A').length;
                effect.addChips = 20 * aces;
                effect.addMult = 4 * aces;
                break;
            }
            case 'walkie talkie': {
                const tens_and_fours = scoringCards.filter(c => c.rank === '10' || c.rank === '4').length;
                effect.addChips = 10 * tens_and_fours;
                effect.addMult = 4 * tens_and_fours;
                break;
            }
            case 'fibonacci': effect.addMult = 8 * scoringCards.filter(c => ['A', '2', '3', '5', '8'].includes(c.rank)).length; break;

            // --- Suit-based Chips/Mult (Uncommon gem jokers) ---
            case 'arrowhead': effect.addChips = 50 * scoringCards.filter(c => c.suit === 'Spades').length; break;
            case 'onyx agate': effect.addMult = 7 * scoringCards.filter(c => c.suit === 'Clubs').length; break;

            // --- Held-in-hand Jokers ---
            case 'shoot the moon': {
                const heldQueens = cards.filter(c => !scoringCards.includes(c) && c.rank === 'Q').length;
                effect.addMult = 13 * heldQueens;
                break;
            }
            case 'baron': {
                const heldKings = cards.filter(c => !scoringCards.includes(c) && c.rank === 'K').length;
                if (heldKings > 0) effect.xMult = Math.pow(1.5, heldKings);
                break;
            }
            case 'raised fist': {
                const held = cards.filter(c => !scoringCards.includes(c));
                if (held.length > 0) {
                    const lowest = held.reduce((min, c) => RANK_ORDER[c.rank] < RANK_ORDER[min.rank] ? c : min, held[0]);
                    effect.addMult = CHIP_VALUES[lowest.rank] * 2;
                }
                break;
            }

            // --- Joker Count ---
            case 'abstract joker': effect.addMult = 3 * (joker._jokerCount || 1); break;

            // --- Static Chips ---
            case 'stuntman': effect.addChips = 250; break;

            // --- Condition-based xMult ---
            case 'blackboard': if (cards.every(c => c.suit === 'Spades' || c.suit === 'Clubs')) effect.xMult = 3; break;
            case 'the duo': if (hasPair(scoringCards)) effect.xMult = 2; break;
            case 'the trio': if (hasThreeOfAKind(scoringCards)) effect.xMult = 3; break;
            case 'the family': if (hasFourOfAKind(scoringCards)) effect.xMult = 4; break;
            case 'the order': if (['Straight', 'Straight Flush'].includes(handType)) effect.xMult = 3; break;
            case 'the tribe': if (['Flush', 'Flush House', 'Flush Five', 'Straight Flush'].includes(handType)) effect.xMult = 2; break;
            case 'flower pot': {
                const scoringSuits = new Set(scoringCards.map(c => c.suit));
                if (scoringSuits.has('Hearts') && scoringSuits.has('Diamonds') && scoringSuits.has('Clubs') && scoringSuits.has('Spades')) {
                    effect.xMult = 3;
                }
                break;
            }
            case 'seeing double': {
                const hasClub = scoringCards.some(c => c.suit === 'Clubs');
                const hasOther = scoringCards.some(c => c.suit !== 'Clubs');
                if (hasClub && hasOther) effect.xMult = 2;
                break;
            }
        }

        return effect;
    }

    function hasPair(cards) { return Object.values(countOccurrences(cards.map(c => c.rank))).some(v => v >= 2); }
    function hasTwoPair(cards) { return Object.values(countOccurrences(cards.map(c => c.rank))).filter(v => v >= 2).length >= 2; }
    function hasThreeOfAKind(cards) { return Object.values(countOccurrences(cards.map(c => c.rank))).some(v => v >= 3); }
    function hasFourOfAKind(cards) { return Object.values(countOccurrences(cards.map(c => c.rank))).some(v => v >= 4); }

    function countOccurrences(arr) {
        const counts = {};
        for (const item of arr) counts[item] = (counts[item] || 0) + 1;
        return counts;
    }

    function findAllPlays(handCards, handLevels = {}, jokers = []) {
        const plays = [];
        for (let size = 1; size <= Math.min(5, handCards.length); size++) {
            const combos = combinations(handCards, size);
            for (const combo of combos) {
                const hand = identifyHand(combo);
                const score = calculateScore(combo, hand.type, handLevels, jokers);
                plays.push({ cards: combo, ...score });
            }
        }
        plays.sort((a, b) => b.totalScore - a.totalScore);
        return plays;
    }

    function formatCard(card) {
        const suitSymbols = { 'Hearts': '\u2665', 'Diamonds': '\u2666', 'Clubs': '\u2663', 'Spades': '\u2660' };
        const suitColors = { 'Hearts': '#fe5f55', 'Diamonds': '#fe5f55', 'Clubs': '#424e54', 'Spades': '#424e54' };
        return {
            text: card.rank + (suitSymbols[card.suit] || '?'),
            color: suitColors[card.suit] || '#ffffff'
        };
    }

    function formatNumber(n) { return n.toLocaleString(); }

    return {
        identifyHand, calculateScore, findAllPlays, formatCard, formatNumber,
        getHandScore, combinations, BASE_HANDS, CHIP_VALUES, RANK_ORDER
    };
})();

if (typeof module !== 'undefined') module.exports = BalatroAnalyzer;
