(function initializeNotentischRenderApi() {
	const MAX_STACK_CARDS = 12;
	const STACK_COUNT_KEY = 'notentischStackCount';
	const QUADRANT_IDS = ['Q1', 'Q2', 'Q3', 'Q4'];
	const cardElementCache = new Map();
	let cardNodeCache = null;
	let prefetchTimer = null;
	let quadrantOffsets = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
	let lastRenderedShowAudioBadge = null;
	const pdfPathAttemptCache = new Map();
	const CARD_PREVIEW_MAX_CONCURRENT = 4;
	const cardPreviewQueue = [];
	let activeCardPreviewLoads = 0;

	function enqueueCardPreviewLoad(task) {
		if (typeof task !== 'function') return;
		cardPreviewQueue.push(task);
		drainCardPreviewQueue();
	}

	function drainCardPreviewQueue() {
		while (activeCardPreviewLoads < CARD_PREVIEW_MAX_CONCURRENT && cardPreviewQueue.length > 0) {
			const nextTask = cardPreviewQueue.shift();
			if (typeof nextTask !== 'function') continue;
			activeCardPreviewLoads++;
			let finished = false;
			const done = () => {
				if (finished) return;
				finished = true;
				activeCardPreviewLoads = Math.max(0, activeCardPreviewLoads - 1);
				drainCardPreviewQueue();
			};
			try {
				nextTask(done);
			} catch (err) {
				done();
			}
		}
	}

	function resetCardRenderCache() {
		cardElementCache.clear();
		cardNodeCache = null;
		if (prefetchTimer) {
			clearTimeout(prefetchTimer);
			prefetchTimer = null;
		}
		cardPreviewQueue.length = 0;
		activeCardPreviewLoads = 0;
	}

	function getCardNodes() {
		if (!xmlData) return [];
		if (!cardNodeCache) {
			const rawNodes = Array.from(xmlData.querySelectorAll('NotenTisch, Notentisch'));
			const isActiveInBoard = (node) => {
				const rawFlag = String(node?.querySelector('ImBoard')?.textContent || '').trim().toLowerCase();
				if (!rawFlag) return true;
				if (rawFlag === '0' || rawFlag === 'false' || rawFlag === 'nein' || rawFlag === 'no') return false;
				return true;
			};
			const filteredNodes = rawNodes.filter((node) => {
				const directChildren = Array.from(node?.children || []);
				if (!directChildren.length) return false;
				// Nur echte Karten-Eintraege behalten (direkte Felder), Containerknoten ausfiltern.
				const isCardNode = directChildren.some((child) => {
					const tag = String(child.tagName || '').toLowerCase();
					return tag === 'titel' || tag === 'speicherort' || tag === 'arbeitsstatus';
				});
				if (!isCardNode) return false;
				return isActiveInBoard(node);
			});
			cardNodeCache = filteredNodes;
			const filteredOutCount = rawNodes.length - filteredNodes.length;
			if (filteredOutCount > 0) {
				console.warn('Render: ' + filteredOutCount + ' Nicht-Kartenknoten aus XML-Cache gefiltert.');
			}
		}
		return cardNodeCache;
	}

	function getCardNodeById(cardId) {
		if (!xmlData) return null;
		const index = parseInt(cardId, 10);
		if (!Number.isFinite(index)) return null;
		return getCardNodes()[index] || null;
	}

	function buildCardInfoById(cardId) {
		const idx = parseInt(cardId, 10);
		if (!Number.isFinite(idx)) return null;
		const node = getCardNodeById(idx);
		if (!node) return null;

		const titel = node.querySelector('Titel')?.textContent || 'Unbekannt';
		const speicherort = node.querySelector('Speicherort')?.textContent || '';
		const storageKey = normalizeStorageKey(speicherort);
		const hasOwnAudioReference = cardHasAudioReference(node);
		const ownAudioBadgeTone = getCardAudioBadgeTone(node);

		let hasAudioReference = hasOwnAudioReference;
		let audioBadgeTone = ownAudioBadgeTone;
		if (!hasAudioReference) {
			const allNodes = getCardNodes();
			for (let i = 0; i < allNodes.length; i++) {
				const candidate = allNodes[i];
				if (!cardHasAudioReference(candidate)) continue;
				const cTitel = candidate.querySelector('Titel')?.textContent || '';
				const cStorage = candidate.querySelector('Speicherort')?.textContent || '';
				const cStorageKey = normalizeStorageKey(cStorage);
				if (cTitel === titel || (storageKey && cStorageKey === storageKey)) {
					hasAudioReference = true;
					audioBadgeTone = getCardAudioBadgeTone(candidate) || 'weak';
					break;
				}
			}
		}

		return {
			idx,
			titel,
			speicherort,
			hasAudioReference,
			audioBadgeTone: audioBadgeTone || (hasAudioReference ? 'weak' : null),
			showAudioBadge: isAudioBadgeEnabled()
		};
	}

	function ensureCardElementById(cardId) {
		const idStr = String(cardId);
		const existing = document.querySelector('.card-container[data-cardid="' + idStr + '"]');
		if (existing) return existing;
		const cardInfo = buildCardInfoById(idStr);
		if (!cardInfo) return null;
		return getOrCreateCardElement(cardInfo);
	}

	function cardHasAudioReference(cardNode) {
		if (!cardNode) return false;
		const refNode = cardNode.querySelector('AudioReferenz');
		if (!refNode) return false;
		const filePath = refNode.querySelector('Datei')?.textContent || '';
		return String(filePath).trim().length > 0;
	}

	function getAudioBadgeToneFromAudioNodes(audioNodes) {
		if (!Array.isArray(audioNodes) || !audioNodes.length) return null;

		let bestQuality = 0;
		for (const audioNode of audioNodes) {
			const filePath = audioNode.querySelector('Datei')?.textContent || '';
			if (!String(filePath).trim()) continue;
			const fingerprint = (audioNode.querySelector('Fingerprint')?.textContent || '').trim();
			const frameCount = Number(audioNode.querySelector('FrameCount')?.textContent || 0) || 0;
			const targetFrameCount = Number(audioNode.querySelector('TargetFrameCount')?.textContent || 0) || 0;
			let quality = fingerprint ? 1.0 : 0.55;
			if (frameCount > 0) {
				const normalizedTarget = Math.max(targetFrameCount || frameCount, 6);
				quality = Math.min(1, Math.max(0.55, frameCount / normalizedTarget));
			}
			if (!fingerprint) quality = Math.min(quality, 0.55);
			if (quality > bestQuality) bestQuality = quality;
		}

		if (bestQuality <= 0) return null;
		return bestQuality >= 0.85 ? 'good' : 'weak';
	}

	function getCardAudioBadgeTone(cardNode) {
		return getAudioBadgeToneFromAudioNodes(Array.from(cardNode?.querySelectorAll('AudioReferenz') || []));
	}

	function normalizeStorageKey(rawPath) {
		const value = String(rawPath || '').trim().replace(/\\/g, '/').toLowerCase();
		if (!value) return '';
		return value.split('#')[0].trim();
	}

	function isAudioBadgeEnabled() {
		if (typeof settings !== 'undefined' && typeof settings?.showAudioBadge === 'boolean') {
			return settings.showAudioBadge;
		}
		if (typeof loadUserConfig !== 'function') return true;
		try {
			const cfg = loadUserConfig();
			return cfg?.showAudioBadge !== false;
		} catch (err) {
			return true;
		}
	}

	function getCardVisualTuning() {
		const fallback = { sharpness: 'normal' };
		if (typeof loadUserConfig !== 'function') return fallback;
		try {
			const cfg = loadUserConfig() || {};
			const sharpnessInput = String(cfg.cardSharpness || 'normal').toLowerCase();
			const sharpness = (sharpnessInput === 'scharf1' || sharpnessInput === 'scharf2') ? sharpnessInput : 'normal';
			return { sharpness };
		} catch (err) {
			return fallback;
		}
	}

	function buildCardFilterStyle() {
		const tuning = getCardVisualTuning();
		const parts = [];
		if (tuning.sharpness === 'scharf1') {
			parts.push('saturate(1.60)');
			parts.push('drop-shadow(0 0 1.60px rgba(0,0,0,0.80))');
		}
		if (tuning.sharpness === 'scharf2') {
			parts.push('saturate(1.66)');
			parts.push('brightness(1.06)');
			parts.push('drop-shadow(0 0 2.40px rgba(0,0,0,0.90))');
		}
		return parts.join(' ');
	}

	function resetQuadrantOffsets() {
		quadrantOffsets = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
	}

	function getQuadrantOffsets() {
		return { ...quadrantOffsets };
	}

	function setQuadrantOffsets(nextOffsets) {
		quadrantOffsets = {
			Q1: Number.isFinite(Number(nextOffsets?.Q1)) ? Number(nextOffsets.Q1) : 0,
			Q2: Number.isFinite(Number(nextOffsets?.Q2)) ? Number(nextOffsets.Q2) : 0,
			Q3: Number.isFinite(Number(nextOffsets?.Q3)) ? Number(nextOffsets.Q3) : 0,
			Q4: Number.isFinite(Number(nextOffsets?.Q4)) ? Number(nextOffsets.Q4) : 0
		};
	}

	function setQuadrantOffset(quadrantId, offset) {
		if (!QUADRANT_IDS.includes(quadrantId)) return;
		quadrantOffsets[quadrantId] = Number.isFinite(Number(offset)) ? Number(offset) : 0;
	}

	function createCardElement(cardInfo) {
		const div = document.createElement('div');
		div.className = 'card-container visible';
		div.id = 'card-' + cardInfo.idx;
		div.dataset.cardid = cardInfo.idx;
		div.dataset.pdf = cardInfo.speicherort;
		div.draggable = true;

		const img = document.createElement('div');
		img.className = 'card';
		img.style.backgroundSize = 'cover';
		img.style.backgroundPosition = 'top';
		img.style.backgroundColor = '#ccc';
		img.style.filter = buildCardFilterStyle();

		enqueueCardPreviewLoad((done) => {
			loadCardImage(img, cardInfo.titel, cardInfo.speicherort, done);
		});

		if (cardInfo.showAudioBadge && cardInfo.hasAudioReference) {
			const badge = document.createElement('span');
			const badgeTone = cardInfo.audioBadgeTone === 'good' ? 'good' : 'weak';
			badge.className = 'card-audio-badge ' + badgeTone;
			badge.title = badgeTone === 'good' ? 'Tonprint gut' : 'Tonprint prüfen';
			div.appendChild(badge);
		}

		const titleDiv = document.createElement('div');
		titleDiv.className = 'card-title';
		titleDiv.textContent = cardInfo.titel;

		div.appendChild(img);
		div.appendChild(titleDiv);

		div.addEventListener('dragstart', drag);
		div.addEventListener('dblclick', handleCardDoubleClick);

		return div;
	}

	function getCardCacheSignature(cardInfo) {
		const visual = getCardVisualTuning();
		return String(cardInfo.titel || '')
			+ '|' + String(cardInfo.speicherort || '')
			+ '|' + (cardInfo.hasAudioReference ? 'a1' : 'a0')
			+ '|' + String(cardInfo.audioBadgeTone || 'none')
			+ '|' + (cardInfo.showAudioBadge ? 'b1' : 'b0')
			+ '|' + visual.sharpness;
	}

	function getOrCreateCardElement(cardInfo) {
		const cardId = Number(cardInfo.idx);
		const signature = getCardCacheSignature(cardInfo);
		const cached = cardElementCache.get(cardId);

		if (cached && cached.signature === signature && cached.element) {
			return cached.element;
		}

		const element = createCardElement(cardInfo);
		cardElementCache.set(cardId, { signature, element });
		return element;
	}

	function syncVisibleCardAudioBadges() {
		const showAudioBadge = isAudioBadgeEnabled();
		const visibleCards = document.querySelectorAll('.card-container[data-cardid]');

		visibleCards.forEach((cardElement) => {
			const cardId = cardElement.dataset.cardid;
			if (!cardId) return;

			const cardNode = getCardNodeById(cardId);
			const hasAudioReference = cardHasAudioReference(cardNode);
			const audioBadgeTone = getCardAudioBadgeTone(cardNode) || (hasAudioReference ? 'weak' : null);
			const shouldShow = showAudioBadge && hasAudioReference;
			const existingBadge = cardElement.querySelector('.card-audio-badge');

			if (shouldShow) {
				if (!existingBadge) {
					const badge = document.createElement('span');
					badge.className = 'card-audio-badge ' + audioBadgeTone;
					badge.title = audioBadgeTone === 'good' ? 'Tonprint gut' : 'Tonprint prüfen';
					cardElement.appendChild(badge);
				} else {
					existingBadge.className = 'card-audio-badge ' + audioBadgeTone;
					existingBadge.title = audioBadgeTone === 'good' ? 'Tonprint gut' : 'Tonprint prüfen';
				}
			} else if (existingBadge) {
				existingBadge.remove();
			}
		});

		lastRenderedShowAudioBadge = showAudioBadge;
	}

	function getConfiguredBatchOverlap(limit) {
		const safeLimit = Math.max(1, Number(limit) || 1);
		let overlap = 2;

		if (typeof loadUserConfig === 'function') {
			try {
				const cfg = loadUserConfig();
				overlap = Number(cfg?.stackBatchOverlapCount);
			} catch (err) {
			}
		}

		if (!Number.isFinite(overlap)) overlap = 2;
		return Math.max(0, Math.min(safeLimit - 1, Math.floor(overlap)));
	}

	function scheduleCardPrefetch(groupedByQuadrant, limit, overlapCount) {
		if (document.body?.classList.contains('overview-mode')) return;
		if (prefetchTimer) clearTimeout(prefetchTimer);

		prefetchTimer = setTimeout(() => {
			prefetchTimer = null;
			const queue = [];

			QUADRANT_IDS.forEach((quadrantId) => {
				const cards = groupedByQuadrant[quadrantId] || [];
				if (!cards.length) return;

				const maxOffset = Math.max(0, cards.length - limit);
				const offset = Math.max(0, Math.min(quadrantOffsets[quadrantId] || 0, maxOffset));
				const offsetStep = Math.max(1, limit - overlapCount);
				const start = Math.min(cards.length, offset + offsetStep);
				const end = Math.min(cards.length, start + limit);

				for (let i = start; i < end; i++) {
					queue.push(cards[i]);
				}
			});

			if (!queue.length) return;

			let index = 0;
			const batchSize = 6;
			const runBatch = () => {
				const stop = Math.min(index + batchSize, queue.length);
				for (; index < stop; index++) {
					getOrCreateCardElement(queue[index]);
				}

				if (index < queue.length) {
					if (typeof requestAnimationFrame === 'function') {
						requestAnimationFrame(runBatch);
					} else {
						setTimeout(runBatch, 16);
					}
				}
			};

			if (typeof requestAnimationFrame === 'function') {
				requestAnimationFrame(runBatch);
			} else {
				setTimeout(runBatch, 16);
			}
		}, 40);
	}

	function createQuadrantStackControls(quadrantId, limit, totalCount, overlapCount) {
		const quadrant = document.getElementById(quadrantId);
		if (!quadrant) return;
		if (document.body?.classList.contains('overview-mode')) return;

		const maxOffset = Math.max(0, totalCount - limit);
		const currentOffset = Math.max(0, Math.min(quadrantOffsets[quadrantId] || 0, maxOffset));
		const offsetStep = Math.max(1, limit - overlapCount);
		quadrantOffsets[quadrantId] = currentOffset;

		if (totalCount <= limit) return;

		const controls = document.createElement('div');
		const isLeft = quadrantId === 'Q1' || quadrantId === 'Q4';
		controls.className = 'quadrant-stack-controls ' + (isLeft ? 'left' : 'right');
		controls.style.display = 'flex';

		const upBtn = document.createElement('button');
		upBtn.type = 'button';
		upBtn.className = 'quadrant-stack-btn';
		upBtn.textContent = '\u25B2';
		upBtn.disabled = currentOffset <= 0;
		upBtn.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (quadrantOffsets[quadrantId] > 0) {
				quadrantOffsets[quadrantId] = Math.max(0, quadrantOffsets[quadrantId] - offsetStep);
				renderQuadrantOnly(quadrantId);
			}
		});

		const downBtn = document.createElement('button');
		downBtn.type = 'button';
		downBtn.className = 'quadrant-stack-btn';
		downBtn.textContent = '\u25BC';
		downBtn.disabled = currentOffset >= maxOffset;
		downBtn.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (quadrantOffsets[quadrantId] < maxOffset) {
				quadrantOffsets[quadrantId] = Math.min(maxOffset, quadrantOffsets[quadrantId] + offsetStep);
				renderQuadrantOnly(quadrantId);
			}
		});

		controls.appendChild(upBtn);
		controls.appendChild(downBtn);
		quadrant.appendChild(controls);
	}

	function getStackCount() {
		const stored = parseInt(localStorage.getItem(STACK_COUNT_KEY) || '', 10);
		const raw = Number.isFinite(stored) ? stored : 6;
		const safe = Math.max(1, Math.min(MAX_STACK_CARDS, raw));
		return safe;
	}

	function updateStackLayout() {
		const root = document.documentElement;
		const quadrants = QUADRANT_IDS
			.map(id => document.getElementById(id))
			.filter(Boolean);

		if (!quadrants.length) return;

		const stackCount = getStackCount();
		const cardHeight = parseFloat(getComputedStyle(root).getPropertyValue('--card-height')) || 250;
		const firstStackItem = document.querySelector('.quadrant .card-container:not(.in-center)');
		const measuredStackItemHeight = firstStackItem?.offsetHeight || (cardHeight + 18);
		root.style.setProperty('--stack-item-height', Math.max(cardHeight, measuredStackItemHeight) + 'px');
		const usableHeights = quadrants.map((q) => {
			const style = getComputedStyle(q);
			const paddingTop = parseFloat(style.paddingTop) || 0;
			const paddingBottom = parseFloat(style.paddingBottom) || 0;
			return Math.max(1, q.clientHeight - paddingTop - paddingBottom);
		});
		const usableHeight = Math.min(...usableHeights);

		// Gleich große Staffelabschnitte: nutzbare Höhe in N Abschnitte teilen.
		let visibleZone = usableHeight / Math.max(1, stackCount);

		visibleZone = Math.max(1, Math.min(cardHeight, Math.floor(visibleZone)));
		root.style.setProperty('--visible-zone', visibleZone + 'px');
	}

	function initializeStackControls() {
		const input = document.getElementById('stackCount');
		if (!input || input.dataset.bound === 'true') return;

		const stored = parseInt(localStorage.getItem(STACK_COUNT_KEY) || '', 10);
		if (Number.isFinite(stored)) {
			input.value = String(Math.max(1, Math.min(MAX_STACK_CARDS, stored)));
		}

		let renderDebounceTimer = null;

		const persistAndLayout = (countOverride = null) => {
			const count = Number.isFinite(countOverride) ? countOverride : getStackCount();
			try { localStorage.setItem(STACK_COUNT_KEY, String(count)); } catch (err) {}
			updateStackLayout();
		};

		const renderNow = () => {
			if (renderDebounceTimer) {
				clearTimeout(renderDebounceTimer);
				renderDebounceTimer = null;
			}
			if (xmlData) renderBoard();
		};

		const onInput = () => {
			const raw = String(input.value || '').trim();
			if (raw === '') return;
			const parsed = parseInt(raw, 10);
			if (!Number.isFinite(parsed)) return;

			const clamped = Math.max(1, Math.min(MAX_STACK_CARDS, parsed));
			try { localStorage.setItem(STACK_COUNT_KEY, String(clamped)); } catch (err) {}
		};

		const onChange = () => {
			persistAndLayout();
			renderNow();
		};

		input.addEventListener('input', onInput);
		input.addEventListener('change', onChange);
		input.dataset.bound = 'true';
	}

	function buildGroupedCardData(showAudioBadge) {
		const grouped = { Q1: [], Q2: [], Q3: [], Q4: [] };
		const cards = getCardNodes();
		const isOverviewMode = !!document.body?.classList.contains('overview-mode');

		const cardMeta = cards.map((cardEl, idx) => {
			const titel = cardEl.querySelector('Titel')?.textContent || 'Unbekannt';
			const speicherort = cardEl.querySelector('Speicherort')?.textContent || '';
			const status = cardEl.querySelector('Arbeitsstatus')?.textContent || 'zurueckgestellt';
			const hasOwnAudioReference = cardHasAudioReference(cardEl);
			const audioBadgeTone = getCardAudioBadgeTone(cardEl);
			return { idx, titel, speicherort, status, hasOwnAudioReference, audioBadgeTone, storageKey: normalizeStorageKey(speicherort) };
		});

		const hasAudioByTitle = new Map();
		const hasAudioByStorage = new Map();
		cardMeta.forEach((entry) => {
			if (!entry.hasOwnAudioReference) return;
			hasAudioByTitle.set(String(entry.titel || ''), entry.audioBadgeTone || 'weak');
			if (entry.storageKey) hasAudioByStorage.set(entry.storageKey, entry.audioBadgeTone || 'weak');
		});

		cardMeta.forEach((entry) => {
			const { idx, titel, speicherort, status, hasOwnAudioReference, storageKey, audioBadgeTone: ownAudioBadgeTone } = entry;
			const hasAudioReference = hasOwnAudioReference
				|| hasAudioByTitle.has(String(titel || ''))
				|| (!!storageKey && hasAudioByStorage.has(storageKey));
			const audioBadgeTone = ownAudioBadgeTone
				|| hasAudioByTitle.get(String(titel || ''))
				|| (storageKey ? hasAudioByStorage.get(storageKey) : null)
				|| (hasAudioReference ? 'weak' : null);

			let quadrantId = 'Q1';
			if (status.includes('wiederholen')) quadrantId = 'Q2';
			if (status.includes('geübt')) quadrantId = 'Q3';
			if (status.includes('gelernt')) quadrantId = 'Q4';

			grouped[quadrantId].push({ idx, titel, speicherort, hasAudioReference, audioBadgeTone, showAudioBadge });
		});

		if (isOverviewMode) {
			const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
			QUADRANT_IDS.forEach((quadrantId) => {
				grouped[quadrantId].sort((a, b) => collator.compare(String(a.titel || ''), String(b.titel || '')));
			});
		}

		return grouped;
	}

	function renderQuadrantFromGrouped(quadrantId, grouped, limit, overlapCount) {
		const target = document.getElementById(quadrantId);
		if (!target) return;
		const isOverviewMode = !!document.body?.classList.contains('overview-mode');

		target.innerHTML = '';
		const total = (grouped[quadrantId] || []).length;
		const effectiveLimit = isOverviewMode ? Math.max(1, total) : limit;
		const maxOffset = Math.max(0, total - effectiveLimit);
		const safeOffset = isOverviewMode
			? 0
			: Math.max(0, Math.min(quadrantOffsets[quadrantId] || 0, maxOffset));
		quadrantOffsets[quadrantId] = safeOffset;

		const visibleCards = grouped[quadrantId].slice(safeOffset, safeOffset + effectiveLimit);
		visibleCards.forEach((cardInfo) => {
			target.appendChild(getOrCreateCardElement(cardInfo));
		});

		createQuadrantStackControls(quadrantId, effectiveLimit, total, overlapCount);
	}

	function renderQuadrantOnly(quadrantId) {
		if (!xmlData || !QUADRANT_IDS.includes(quadrantId)) return;

		try {
			const showAudioBadge = isAudioBadgeEnabled();
			if (lastRenderedShowAudioBadge !== null && lastRenderedShowAudioBadge !== showAudioBadge) {
				cardElementCache.clear();
			}
			lastRenderedShowAudioBadge = showAudioBadge;

			const grouped = buildGroupedCardData(showAudioBadge);
			const limit = getStackCount();
			const overlapCount = getConfiguredBatchOverlap(limit);
			renderQuadrantFromGrouped(quadrantId, grouped, limit, overlapCount);

			if (!document.body?.classList.contains('overview-mode')) {
				scheduleCardPrefetch(grouped, limit, overlapCount);
			}
			setupDropListeners();
			updateStackLayout();
		} catch (err) {
			console.error('renderQuadrantOnly fehlgeschlagen:', err);
		}
	}

	function renderBoard() {
		if (!xmlData) return;

		document.body.classList.add('board-rendering');

		try {
			const grouped = { Q1: [], Q2: [], Q3: [], Q4: [] };

			QUADRANT_IDS.forEach((quadrantId) => {
				const el = document.getElementById(quadrantId);
				if (el) el.innerHTML = '';
			});

			const showAudioBadge = isAudioBadgeEnabled();

			if (lastRenderedShowAudioBadge !== null && lastRenderedShowAudioBadge !== showAudioBadge) {
				cardElementCache.clear();
			}
			lastRenderedShowAudioBadge = showAudioBadge;

			const limit = getStackCount();
			const overlapCount = getConfiguredBatchOverlap(limit);
			const groupedBuilt = buildGroupedCardData(showAudioBadge);
			grouped.Q1 = groupedBuilt.Q1;
			grouped.Q2 = groupedBuilt.Q2;
			grouped.Q3 = groupedBuilt.Q3;
			grouped.Q4 = groupedBuilt.Q4;

			QUADRANT_IDS.forEach((quadrantId) => {
				renderQuadrantFromGrouped(quadrantId, grouped, limit, overlapCount);
			});

			if (!document.body?.classList.contains('overview-mode')) {
				scheduleCardPrefetch(grouped, limit, overlapCount);
			}
			setupDropListeners();
			updateStackLayout();
		} catch (err) {
			console.error('renderBoard fehlgeschlagen:', err);
		} finally {
			requestAnimationFrame(() => document.body.classList.remove('board-rendering'));
		}
	}

	function sanitizeTitle(titel) {
		let cleaned = titel.trim()
			.replace(/\.+$/, '')
			.replace(/,+$/, '')
			.replace(/\s+$/, '');

		return 'card_' +
			cleaned
				.replace(/ö/g, 'oe')
				.replace(/ä/g, 'ae')
				.replace(/ü/g, 'ue')
				.replace(/Ö/g, 'OE')
				.replace(/Ä/g, 'AE')
				.replace(/Ü/g, 'UE')
				.replace(/[,\.]/g, '')
				.replace(/ /g, '_')
				.replace(/_+$/, '')
				+ '.png';
	}

	function stripDiacritics(text) {
		return String(text || '')
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '');
	}

	function getPdfPathCandidates(pdfPath, titel = '') {
		const rawPath = String(pdfPath || '');
		const hashParts = rawPath.split('#').map(p => p.trim()).filter(Boolean);
		const pdfParts = hashParts.filter(p => p.toLowerCase().includes('.pdf'));

		const titleBase = String(titel || '').trim();
		const titleVariants = titleBase
			? [
				titleBase,
				titleBase.replace(/\s+$/, ''),
				titleBase.replace(/\s+/g, ' ').trim(),
				titleBase.replace(/[\\/:*?"<>|]/g, '').trim()
			]
			: [];

		titleVariants.forEach(v => {
			if (!v) return;
			const withPdf = v.toLowerCase().endsWith('.pdf') ? v : v + '.pdf';
			pdfParts.push(withPdf);
		});

		let actualPath = rawPath;
		if (pdfParts.length) {
			const relativeCandidate = pdfParts.find(p => !/^[a-zA-Z]:[\\/]/.test(p));
			actualPath = relativeCandidate || pdfParts[0];
		}

		const normalize = (input) => {
			if (!input) return '';
			if (typeof normalizePdfServerPathV2 === 'function') return normalizePdfServerPathV2(input);
			if (typeof normalizePdfServerPath === 'function') return normalizePdfServerPath(input);
			return input.replace(/\\/g, '/').replace(/^\.\.\//g, '');
		};

		const normalizedActual = normalize(actualPath);
		const baseCandidates = [normalizedActual, ...pdfParts.map(normalize)]
			.filter(Boolean)
			.map(p => p.split('/').pop())
			.filter(Boolean);

		const uniqueFileNames = [...new Set(baseCandidates)];

		return [
			normalizedActual,
			...uniqueFileNames.flatMap(name => [
				'Blätter/' + name,
				'Noten/Blätter/' + name,
				'Noten/' + name
			])
		].filter(Boolean);
	}

	function loadCardImageFromPdf(imgElement, pdfPath, titel = '', onComplete = null) {
		let completed = false;
		const finish = () => {
			if (completed) return;
			completed = true;
			if (typeof onComplete === 'function') onComplete();
		};

		if (!pdfPath || typeof pdfjsLib === 'undefined') {
			if (typeof pdfjsLib === 'undefined') {
				imgElement.style.backgroundColor = '#aaa';
				finish();
				return;
			}
		}

		const paths = getPdfPathCandidates(pdfPath, titel);
		let pathIndex = 0;

		// Dateinamen aus Pfad-Kandidaten für blaetterDirHandle-Lookup
		const uniqueNames = [...new Set(paths.map(p => p.split('/').pop()).filter(Boolean))];

		async function tryFromBlaetterHandle() {
			const handle = window.blaetterDirHandle;
			if (!handle || typeof pdfjsLib === 'undefined') return false;
			for (const fname of uniqueNames) {
				try {
					const fh = await handle.getFileHandle(fname);
					const file = await fh.getFile();
					const blobUrl = URL.createObjectURL(file);
					try {
						const pdf = await pdfjsLib.getDocument(blobUrl).promise;
						const page = await pdf.getPage(1);
						URL.revokeObjectURL(blobUrl);
						const viewport = page.getViewport({ scale: 0.35 });
						const canvas = document.createElement('canvas');
						canvas.width = viewport.width;
						canvas.height = viewport.height;
						await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
						imgElement.style.backgroundImage = 'url("' + canvas.toDataURL('image/png') + '")';
						imgElement.style.backgroundColor = '#fff';
						return true;
					} catch { URL.revokeObjectURL(blobUrl); }
				} catch { /* Datei nicht im Handle */ }
			}
			return false;
		}

		function encodePath(pathValue) {
			if (!pathValue) return '';
			const safeDecode = (segment) => {
				try {
					return decodeURIComponent(segment);
				} catch {
					return segment;
				}
			};

			return String(pathValue)
				.split('/')
				.filter(part => part !== '')
				.map(part => encodeURIComponent(safeDecode(part)))
				.join('/');
		}

		function tryNextPdf() {
			if (pathIndex >= paths.length) {
				imgElement.style.backgroundColor = '#aaa';
				finish();
				return;
			}

			const serverPath = encodePath(paths[pathIndex]);

			const cachedAttempt = pdfPathAttemptCache.get(serverPath);
			if (cachedAttempt === false) {
				pathIndex++;
				tryNextPdf();
				return;
			}
			if (
				cachedAttempt &&
				typeof cachedAttempt === 'object' &&
				cachedAttempt.ok === false &&
				Number.isFinite(cachedAttempt.failedAt) &&
				(Date.now() - cachedAttempt.failedAt) < 15000
			) {
				pathIndex++;
				tryNextPdf();
				return;
			}

			pdfjsLib.getDocument(serverPath).promise
				.then(pdf => pdf.getPage(1))
				.then(page => {
					pdfPathAttemptCache.set(serverPath, { ok: true, ts: Date.now() });
					const viewport = page.getViewport({ scale: 0.35 });
					const canvas = document.createElement('canvas');
					const context = canvas.getContext('2d');
					canvas.width = viewport.width;
					canvas.height = viewport.height;

					return page.render({ canvasContext: context, viewport }).promise.then(() => {
						imgElement.style.backgroundImage = 'url("' + canvas.toDataURL('image/png') + '")';
						imgElement.style.backgroundColor = '#fff';
						finish();
					});
				})
				.catch(() => {
					pdfPathAttemptCache.set(serverPath, { ok: false, failedAt: Date.now() });
					pathIndex++;
					tryNextPdf();
				});
		}

		tryFromBlaetterHandle().then(ok => {
			if (ok) { finish(); return; }
			tryNextPdf();
		});
	}

	function loadCardImage(imgElement, titel, pdfPath, onComplete = null) {
		let completed = false;
		const finish = () => {
			if (completed) return;
			completed = true;
			if (typeof onComplete === 'function') onComplete();
		};

		const variations = [
			sanitizeTitle(titel),
			'card_' + titel.trim().replace(/[,\.]$/g, '').replace(/ /g, '_') + '.png',
			'card_' + titel.toLowerCase().trim().replace(/[,\.]/g, '').replace(/ö/g, 'oe').replace(/ä/g, 'ae').replace(/ü/g, 'ue').replace(/ /g, '_').replace(/_+$/, '') + '.png',
			'card_' + stripDiacritics(titel).toLowerCase().trim().replace(/[,\.]/g, '').replace(/ /g, '_').replace(/_+$/, '') + '.png',
		];

		const uniqueVariations = [...new Set(variations.filter(Boolean))];
		let currentIdx = 0;

		function tryNextImage() {
			if (currentIdx >= uniqueVariations.length) {
				loadCardImageFromPdf(imgElement, pdfPath, titel, finish);
				return;
			}

			const filename = uniqueVariations[currentIdx];
			const img = new Image();

			img.onload = () => {
				imgElement.style.backgroundImage = 'url("./Cards_Export/' + filename + '")';
				finish();
			};

			img.onerror = () => {
				currentIdx++;
				tryNextImage();
			};

			img.src = './Cards_Export/' + filename;
		}

		tryNextImage();
	}

	window.NotentischRender = {
		renderBoard,
		resetCardRenderCache,
		syncVisibleCardAudioBadges,
		getCardNodes,
		getCardNodeById,
		ensureCardElementById,
		resetQuadrantOffsets,
		getQuadrantOffsets,
		setQuadrantOffsets,
		setQuadrantOffset,
		getStackCount,
		updateStackLayout,
		initializeStackControls,
		sanitizeTitle
	};
})();
