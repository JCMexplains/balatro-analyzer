/**
 * Balatro Analyzer App
 * Two-phase: (1) Vision reads game state -> user verifies/corrects -> (2) Analysis runs.
 */

const App = (() => {
    let currentImage = null;
    let parsedState = null;
    let analysisHistory = [];

    const els = {};

    function init() {
        els.apiKey = document.getElementById('api-key');
        els.saveKey = document.getElementById('save-key');
        els.apiKeyDetails = document.getElementById('api-key-details');
        els.modelSelect = document.getElementById('model-select');
        els.dropZone = document.getElementById('drop-zone');
        els.dropZoneContent = document.getElementById('drop-zone-content');
        els.fileInput = document.getElementById('file-input');
        els.previewImage = document.getElementById('preview-image');
        els.uploadActions = document.getElementById('upload-actions');
        els.analyzeBtn = document.getElementById('analyze-btn');
        els.clearBtn = document.getElementById('clear-btn');
        els.loadingSection = document.getElementById('loading-section');
        els.loadingText = document.getElementById('loading-text');
        els.gameStateSection = document.getElementById('game-state-section');
        els.gameStateDisplay = document.getElementById('game-state-display');
        els.verifyActions = document.getElementById('verify-actions');
        els.runAnalysisBtn = document.getElementById('run-analysis-btn');
        els.recommendationSection = document.getElementById('recommendation-section');
        els.recommendationDisplay = document.getElementById('recommendation-display');
        els.historySection = document.getElementById('history-section');
        els.historyDisplay = document.getElementById('history-display');
        els.cardEditModal = document.getElementById('card-edit-modal');
        els.modalSave = document.getElementById('modal-save');
        els.modalCancel = document.getElementById('modal-cancel');

        var savedKey = localStorage.getItem('balatro_api_key');
        if (savedKey) {
            els.apiKey.value = savedKey;
            els.apiKeyDetails.removeAttribute('open');
        } else {
            els.apiKeyDetails.setAttribute('open', '');
        }
        var savedModel = localStorage.getItem('balatro_model');
        if (savedModel) els.modelSelect.value = savedModel;

        try {
            analysisHistory = JSON.parse(localStorage.getItem('balatro_history') || '[]');
            if (analysisHistory.length > 0) renderHistory();
        } catch (e) { analysisHistory = []; }

        els.saveKey.addEventListener('click', saveApiKey);
        els.modelSelect.addEventListener('change', function() {
            localStorage.setItem('balatro_model', els.modelSelect.value);
        });
        els.dropZone.addEventListener('click', function() { els.fileInput.click(); });
        els.dropZone.addEventListener('dragover', handleDragOver);
        els.dropZone.addEventListener('dragleave', handleDragLeave);
        els.dropZone.addEventListener('drop', handleDrop);
        els.fileInput.addEventListener('change', handleFileSelect);
        els.analyzeBtn.addEventListener('click', parseScreenshot);
        els.clearBtn.addEventListener('click', clearImage);
        els.runAnalysisBtn.addEventListener('click', runAnalysis);
        els.modalCancel.addEventListener('click', closeCardModal);
        document.addEventListener('paste', handlePaste);
    }

    function saveApiKey() {
        var key = els.apiKey.value.trim();
        if (key) {
            localStorage.setItem('balatro_api_key', key);
            els.apiKeyDetails.removeAttribute('open');
            showToast('API key saved');
        }
    }

    function getApiKey() {
        return (els.apiKey.value.trim() || localStorage.getItem('balatro_api_key') || '').trim();
    }

    function handleDragOver(e) { e.preventDefault(); els.dropZone.classList.add('drag-over'); }
    function handleDragLeave(e) { e.preventDefault(); els.dropZone.classList.remove('drag-over'); }

    function handleDrop(e) {
        e.preventDefault();
        els.dropZone.classList.remove('drag-over');
        var file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) loadImage(file);
    }

    function handleFileSelect(e) {
        var file = e.target.files[0];
        if (file) loadImage(file);
    }

    function handlePaste(e) {
        var items = e.clipboardData ? e.clipboardData.items : null;
        if (!items) return;
        for (var i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                var file = items[i].getAsFile();
                if (file) loadImage(file);
                break;
            }
        }
    }

    function loadImage(file) {
        var reader = new FileReader();
        reader.onload = function(e) {
            compressImage(e.target.result, function(compressed) {
                currentImage = compressed;
                els.previewImage.src = currentImage;
                els.previewImage.classList.remove('hidden');
                els.dropZoneContent.classList.add('hidden');
                els.uploadActions.classList.remove('hidden');
            });
        };
        reader.readAsDataURL(file);
    }

    function compressImage(dataUrl, callback) {
        var MAX_BYTES = 4.5 * 1024 * 1024;
        var img = new Image();
        img.onload = function() {
            var base64Part = dataUrl.split(',')[1] || '';
            if (base64Part.length * 0.75 <= MAX_BYTES) {
                callback(dataUrl);
                return;
            }

            var width = img.width, height = img.height;
            var maxDim = 2400;
            var quality = 0.88;

            function tryCompress() {
                var canvas = document.createElement('canvas');
                var ctx = canvas.getContext('2d');
                var scale = Math.min(1, maxDim / Math.max(width, height));
                canvas.width = Math.round(width * scale);
                canvas.height = Math.round(height * scale);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                var result = canvas.toDataURL('image/jpeg', quality);

                var b64 = result.split(',')[1] || '';
                if (b64.length * 0.75 <= MAX_BYTES || maxDim <= 1000) {
                    callback(result);
                } else {
                    maxDim -= 200;
                    quality = Math.max(0.65, quality - 0.04);
                    tryCompress();
                }
            }
            tryCompress();
        };
        img.src = dataUrl;
    }

    function clearImage() {
        currentImage = null;
        parsedState = null;
        els.previewImage.src = '';
        els.previewImage.classList.add('hidden');
        els.dropZoneContent.classList.remove('hidden');
        els.uploadActions.classList.add('hidden');
        els.fileInput.value = '';
        els.gameStateSection.classList.add('hidden');
        els.recommendationSection.classList.add('hidden');
        els.verifyActions.classList.add('hidden');
    }

    async function parseScreenshot() {
        var apiKey = getApiKey();
        if (!apiKey) {
            els.apiKeyDetails.setAttribute('open', '');
            showToast('Please enter your Claude API key first');
            return;
        }
        if (!currentImage) {
            showToast('Please upload a screenshot first');
            return;
        }

        showLoading('Reading your cards...');
        els.analyzeBtn.disabled = true;

        try {
            var result = await callParseAPI(apiKey, currentImage);
            if (result.parseError) {
                hideLoading();
                els.recommendationSection.classList.remove('hidden');
                els.recommendationDisplay.innerHTML =
                    '<div class="raw-analysis"><p>' + escapeHtml(result.raw || 'Could not parse the screenshot.') + '</p></div>';
                return;
            }
            parsedState = result;
            hideLoading();
            displayVerification(parsedState);
        } catch (err) {
            hideLoading();
            showToast('Error: ' + err.message);
        } finally {
            els.analyzeBtn.disabled = false;
        }
    }

    async function callParseAPI(apiKey, imageDataUrl) {
        var model = els.modelSelect.value;
        var match = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!match) throw new Error('Invalid image data');

        var systemPrompt = 'You are a Balatro screenshot reader. Your ONLY job is to accurately read the game state from the screenshot. Do NOT analyze or recommend plays.\n\nREADING CARDS — BE EXTREMELY CAREFUL:\n- Balatro is played in LANDSCAPE mode on mobile\n- Cards are in the hand area (bottom center of screen)\n- Each card shows its RANK in the top-left corner and bottom-right corner: 2,3,4,5,6,7,8,9,10,J,Q,K,A\n- Each card shows its SUIT: Hearts (red), Diamonds (red), Clubs (black), Spades (black)\n- Face cards have distinctive art: Jack (young face, no crown), Queen (feminine face, small crown), King (bearded face, large crown)\n- COMMON MISTAKES TO AVOID:\n  * Q vs K — Queens have a smaller/no crown and feminine features. Kings have beards and large crowns.\n  * 6 vs 9 — Check orientation carefully\n  * J vs Q — Jacks are younger looking, no crown at all\n  * 10 vs other numbers — 10 has two digits\n- Count every card. A standard hand is 8 cards but can vary.\n- Read left to right, one card at a time.\n\nREADING JOKERS:\n- Joker slots are typically in the top-left area in landscape\n- Read the NAME text on each joker card carefully\n- Note any edition glow (foil=rainbow shimmer, holographic=rainbow stripes, polychrome=rainbow swirl)\n\nREADING GAME INFO:\n- Blind name and target score (usually top-center or top-left)\n- Score so far this round\n- Hands remaining (blue number) and Discards remaining (red number)\n- Money amount ($)\n- Ante and round number if visible\n\nRespond with ONLY valid JSON:\n{\n  "gameState": {\n    "blind": { "name": "Small Blind", "target": 300, "current": 0 },\n    "handsLeft": 4,\n    "discardsLeft": 3,\n    "money": 5,\n    "ante": 1,\n    "round": 1,\n    "handCards": [\n      { "rank": "A", "suit": "Spades", "enhancement": null, "edition": null, "seal": null }\n    ],\n    "jokers": [\n      { "name": "Joker Name", "edition": null, "description": "short effect" }\n    ],\n    "consumables": [],\n    "deckRemaining": null\n  },\n  "confidence": {\n    "cards": "high/medium/low",\n    "uncertainCards": [0],\n    "notes": "any cards I\'m unsure about"\n  }\n}\n\nUse standard rank values: 2,3,4,5,6,7,8,9,10,J,Q,K,A\nUse full suit names: Hearts, Diamonds, Clubs, Spades\nIf unsure about a card, include your best guess but list its index (0-based) in uncertainCards.';

        var response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 2048,
                system: systemPrompt,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } },
                        { type: 'text', text: 'Read every card and game element in this Balatro screenshot. Return JSON only.' }
                    ]
                }]
            })
        });

        if (!response.ok) {
            var errorBody = await response.text();
            if (response.status === 401) throw new Error('Invalid API key.');
            throw new Error('API error (' + response.status + '): ' + errorBody);
        }

        var data = await response.json();
        var text = data.content[0] ? data.content[0].text : '';
        var jsonStr = text;
        var jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1];

        try {
            return JSON.parse(jsonStr.trim());
        } catch (e) {
            return { parseError: true, raw: text };
        }
    }

    function displayVerification(result) {
        var state = result.gameState;
        if (!state) return;

        els.gameStateSection.classList.remove('hidden');
        els.recommendationSection.classList.add('hidden');

        var uncertainSet = new Set(result.confidence ? (result.confidence.uncertainCards || []) : []);

        var html = '<div class="state-grid">';
        if (state.blind) {
            var progress = state.blind.target > 0
                ? Math.min(100, (state.blind.current / state.blind.target) * 100) : 0;
            html +=
                '<div class="state-item blind-info">' +
                    '<span class="state-label">Blind</span>' +
                    '<span class="state-value">' + escapeHtml(state.blind.name || 'Unknown') + '</span>' +
                    '<div class="progress-bar"><div class="progress-fill" style="width:' + progress + '%"></div></div>' +
                    '<span class="state-detail">' + BalatroAnalyzer.formatNumber(state.blind.current || 0) + ' / ' + BalatroAnalyzer.formatNumber(state.blind.target || 0) + '</span>' +
                '</div>';
        }
        html +=
            '<div class="state-item"><span class="state-label">Hands</span><span class="state-value big">' + (state.handsLeft != null ? state.handsLeft : '?') + '</span></div>' +
            '<div class="state-item"><span class="state-label">Discards</span><span class="state-value big">' + (state.discardsLeft != null ? state.discardsLeft : '?') + '</span></div>' +
            '<div class="state-item"><span class="state-label">Money</span><span class="state-value big">$' + (state.money != null ? state.money : '?') + '</span></div>' +
        '</div>';

        if (state.handCards && state.handCards.length > 0) {
            html += '<div class="hand-cards"><h3>Your Hand <span class="edit-hint">(tap to fix)</span></h3><div class="cards-row">';
            state.handCards.forEach(function(card, i) {
                var f = BalatroAnalyzer.formatCard(card);
                var uncertain = uncertainSet.has(i) ? ' uncertain' : '';
                html +=
                    '<div class="card-display editable' + uncertain + '" style="border-color:' + f.color + '" data-card-index="' + i + '" onclick="App.editCard(' + i + ')">' +
                        '<span class="card-rank" style="color:' + f.color + '">' + escapeHtml(f.text) + '</span>' +
                    '</div>';
            });
            html += '</div></div>';
        }

        if (state.jokers && state.jokers.length > 0) {
            html += '<div class="jokers-display"><h3>Jokers</h3><div class="joker-row">';
            for (var j = 0; j < state.jokers.length; j++) {
                html += '<div class="joker-card"><span class="joker-name">' + escapeHtml(state.jokers[j].name || 'Unknown') + '</span></div>';
            }
            html += '</div></div>';
        }

        if (result.confidence && result.confidence.notes) {
            html += '<div class="confidence-note"><p>' + escapeHtml(result.confidence.notes) + '</p></div>';
        }

        els.gameStateDisplay.innerHTML = html;
        els.verifyActions.classList.remove('hidden');
        els.gameStateSection.scrollIntoView({ behavior: 'smooth' });
    }

    var editingCardIndex = null;
    var editRank = null;
    var editSuit = null;

    function editCard(index) {
        var card = parsedState && parsedState.gameState && parsedState.gameState.handCards ? parsedState.gameState.handCards[index] : null;
        if (!card) return;
        editingCardIndex = index;
        editRank = card.rank;
        editSuit = card.suit;

        updateModalSelection();
        els.cardEditModal.classList.remove('hidden');

        els.cardEditModal.querySelectorAll('[data-rank]').forEach(function(btn) {
            btn.onclick = function() {
                editRank = btn.dataset.rank;
                updateModalSelection();
            };
        });

        els.cardEditModal.querySelectorAll('[data-suit]').forEach(function(btn) {
            btn.onclick = function() {
                editSuit = btn.dataset.suit;
                updateModalSelection();
            };
        });

        els.modalSave.onclick = function() {
            parsedState.gameState.handCards[editingCardIndex].rank = editRank;
            parsedState.gameState.handCards[editingCardIndex].suit = editSuit;
            closeCardModal();
            displayVerification(parsedState);
        };
    }

    function updateModalSelection() {
        els.cardEditModal.querySelectorAll('[data-rank]').forEach(function(btn) {
            btn.classList.toggle('selected', btn.dataset.rank === editRank);
        });
        els.cardEditModal.querySelectorAll('[data-suit]').forEach(function(btn) {
            btn.classList.toggle('selected', btn.dataset.suit === editSuit);
        });
    }

    function closeCardModal() {
        els.cardEditModal.classList.add('hidden');
        editingCardIndex = null;
    }

    async function runAnalysis() {
        if (!parsedState || !parsedState.gameState) {
            showToast('No game state to analyze');
            return;
        }
        var apiKey = getApiKey();
        if (!apiKey) {
            showToast('Please enter your API key');
            return;
        }

        showLoading('Calculating optimal play...');
        els.runAnalysisBtn.disabled = true;

        try {
            var analysis = await callAnalyzeAPI(apiKey, parsedState.gameState);
            hideLoading();
            displayAnalysis(analysis, parsedState.gameState);
            saveToHistory(analysis);
        } catch (err) {
            hideLoading();
            showToast('Error: ' + err.message);
        } finally {
            els.runAnalysisBtn.disabled = false;
        }
    }

    async function callAnalyzeAPI(apiKey, gameState) {
        var model = els.modelSelect.value;

        var localPlays = BalatroAnalyzer.findAllPlays(
            gameState.handCards || [],
            gameState.handLevels || {},
            gameState.jokers || []
        );
        var topPlays = localPlays.slice(0, 10).map(function(p) {
            return {
                cards: p.cards.map(function(c) { return c.rank + c.suit[0]; }),
                handType: p.handType,
                localScore: p.totalScore
            };
        });

        var prompt = 'You are a Balatro strategy expert. Analyze this VERIFIED game state and recommend the optimal play.\n\nCORE BALATRO RULES — YOU MUST FOLLOW THESE:\n- You PLAY up to 5 cards from your hand to score a poker hand. You cannot play more than 5.\n- You DISCARD up to 5 cards from your hand to draw replacements. You cannot discard more than 5.\n- Standard poker hand rankings apply, plus: Five of a Kind, Flush House, Flush Five\n- Score = (base hand chips + played card chips) x (base hand mult), then jokers modify\n- Jokers trigger left to right in order\n- You must beat the blind\'s target score (cumulative across all hands played this round)\n\nGAME STATE (verified by player):\n' + JSON.stringify(gameState, null, 2) + '\n\nLOCAL HAND EVALUATION (top plays by base score, may not account for all joker effects):\n' + JSON.stringify(topPlays, null, 2) + '\n\nConsider:\n1. All joker effects and their interactions (order matters for some jokers)\n2. The blind target vs remaining hands — can we beat it? Do we need to be aggressive?\n3. Whether to discard first (if discards remain) to fish for a better hand\n4. Card enhancements, editions, and seals\n5. Overall strategic position (ante, money, etc.)\n6. NEVER recommend playing or discarding more than 5 cards\n\nRespond with ONLY valid JSON:\n{\n  "bestPlay": {\n    "cards": ["QS", "QH", "QD", "QC"],\n    "handType": "Four of a Kind",\n    "estimatedScore": 1500,\n    "beatsBlind": true\n  },\n  "alternativePlays": [\n    { "cards": ["QS", "QH"], "handType": "Pair", "estimatedScore": 50, "beatsBlind": false, "note": "reason" }\n  ],\n  "discardAdvice": {\n    "shouldDiscard": false,\n    "cardsToDiscard": [],\n    "reasoning": "explanation"\n  },\n  "reasoning": "Detailed explanation of the optimal play and why...",\n  "strategyNotes": "Broader strategic considerations..."\n}';

        var response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 2048,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        if (!response.ok) {
            var errorBody = await response.text();
            throw new Error('API error (' + response.status + '): ' + errorBody);
        }

        var data = await response.json();
        var text = data.content[0] ? data.content[0].text : '';
        var jsonStr = text;
        var jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1];

        try {
            return JSON.parse(jsonStr.trim());
        } catch (e) {
            return { reasoning: text, parseError: true };
        }
    }

    function displayAnalysis(analysis, gameState) {
        els.recommendationSection.classList.remove('hidden');

        if (analysis.parseError) {
            els.recommendationDisplay.innerHTML =
                '<div class="raw-analysis"><p>' + escapeHtml(analysis.reasoning || '') + '</p></div>';
            return;
        }

        var localPlays = BalatroAnalyzer.findAllPlays(
            gameState.handCards || [], gameState.handLevels || {}, gameState.jokers || []
        );

        var html = '';

        if (analysis.bestPlay) {
            var bp = analysis.bestPlay;
            html +=
                '<div class="best-play">' +
                    '<div class="play-header">' +
                        '<span class="play-label">PLAY THIS</span>' +
                        '<span class="beats-blind ' + (bp.beatsBlind ? 'yes' : 'no') + '">' +
                            (bp.beatsBlind ? 'Beats blind' : "Doesn't beat blind") +
                        '</span>' +
                    '</div>' +
                    '<div class="play-cards big">' +
                        (bp.cards || []).map(function(c) { return '<span class="card-chip-big">' + escapeHtml(c) + '</span>'; }).join(' ') +
                    '</div>' +
                    '<div class="play-type">' + escapeHtml(bp.handType || '') + '</div>' +
                    '<div class="play-est-score">~' + BalatroAnalyzer.formatNumber(bp.estimatedScore || 0) + ' chips</div>' +
                '</div>';
        }

        if (analysis.discardAdvice && analysis.discardAdvice.shouldDiscard) {
            html +=
                '<div class="discard-advice">' +
                    '<div class="play-header"><span class="play-label discard">DISCARD INSTEAD</span></div>' +
                    '<div class="play-cards">' +
                        (analysis.discardAdvice.cardsToDiscard || []).map(function(c) {
                            return '<span class="card-chip-big discard">' + escapeHtml(c) + '</span>';
                        }).join(' ') +
                    '</div>' +
                    '<p class="advice-reason">' + escapeHtml(analysis.discardAdvice.reasoning || '') + '</p>' +
                '</div>';
        }

        if (analysis.alternativePlays && analysis.alternativePlays.length > 0) {
            html += '<div class="alternatives"><h3>Alternatives</h3>';
            for (var a = 0; a < analysis.alternativePlays.length; a++) {
                var alt = analysis.alternativePlays[a];
                html +=
                    '<div class="alt-play">' +
                        '<div class="play-cards">' +
                            (alt.cards || []).map(function(c) { return '<span class="card-chip">' + escapeHtml(c) + '</span>'; }).join(' ') +
                        '</div>' +
                        '<span class="hand-type">' + escapeHtml(alt.handType || '') + '</span>' +
                        '<span class="play-score">~' + BalatroAnalyzer.formatNumber(alt.estimatedScore || 0) + '</span>' +
                        (alt.note ? '<p class="alt-note">' + escapeHtml(alt.note) + '</p>' : '') +
                    '</div>';
            }
            html += '</div>';
        }

        if (localPlays.length > 0) {
            var top5 = localPlays.slice(0, 5);
            html += '<div class="local-analysis"><h3>All Possible Hands (by score)</h3>';
            for (var p = 0; p < top5.length; p++) {
                var play = top5[p];
                var cardStrs = play.cards.map(function(c) {
                    var f = BalatroAnalyzer.formatCard(c);
                    return '<span class="card-chip" style="color:' + f.color + '">' + escapeHtml(f.text) + '</span>';
                }).join(' ');
                html +=
                    '<div class="play-option ' + (p === 0 ? 'best' : '') + '">' +
                        '<div class="play-cards">' + cardStrs + '</div>' +
                        '<div class="play-info">' +
                            '<span class="hand-type">' + play.handType + ' (Lvl ' + play.level + ')</span>' +
                            '<span class="play-score">' + BalatroAnalyzer.formatNumber(play.totalScore) + '</span>' +
                        '</div>' +
                        '<div class="play-breakdown">' +
                            play.totalChips + ' chips x ' + play.totalMult + ' mult' + (play.xMult > 1 ? ' x ' + play.xMult + 'x' : '') +
                        '</div>' +
                    '</div>';
            }
            html += '</div>';
        }

        if (analysis.reasoning) {
            html += '<div class="reasoning"><h3>Why?</h3><p>' + escapeHtml(analysis.reasoning) + '</p></div>';
        }
        if (analysis.strategyNotes) {
            html += '<div class="strategy-notes"><h3>Strategy</h3><p>' + escapeHtml(analysis.strategyNotes) + '</p></div>';
        }

        els.recommendationDisplay.innerHTML = html;
        els.recommendationSection.scrollIntoView({ behavior: 'smooth' });
    }

    function saveToHistory(result) {
        var entry = {
            timestamp: Date.now(),
            handType: result.bestPlay ? result.bestPlay.handType : null,
            score: result.bestPlay ? result.bestPlay.estimatedScore : null
        };
        analysisHistory.unshift(entry);
        if (analysisHistory.length > 20) analysisHistory = analysisHistory.slice(0, 20);
        localStorage.setItem('balatro_history', JSON.stringify(analysisHistory));
        renderHistory();
    }

    function renderHistory() {
        if (analysisHistory.length === 0) { els.historySection.classList.add('hidden'); return; }
        els.historySection.classList.remove('hidden');
        els.historyDisplay.innerHTML = analysisHistory.map(function(entry) {
            var time = new Date(entry.timestamp).toLocaleTimeString();
            return '<div class="history-entry">' +
                '<span class="history-time">' + time + '</span>' +
                '<span class="history-hand">' + escapeHtml(entry.handType || '?') + '</span>' +
                '<span class="history-score">~' + BalatroAnalyzer.formatNumber(entry.score || 0) + '</span>' +
            '</div>';
        }).join('');
    }

    function showLoading(text) {
        els.loadingText.textContent = text;
        els.loadingSection.classList.remove('hidden');
        els.recommendationSection.classList.add('hidden');
    }

    function hideLoading() { els.loadingSection.classList.add('hidden'); }

    function showToast(msg) {
        var toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = msg;
        document.body.appendChild(toast);
        requestAnimationFrame(function() { toast.classList.add('show'); });
        setTimeout(function() {
            toast.classList.remove('show');
            setTimeout(function() { toast.remove(); }, 300);
        }, 3000);
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { init: init, editCard: editCard };
})();
