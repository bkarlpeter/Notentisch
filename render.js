(function initializeNotentischRenderApi() {
	const MAX_STACK_CARDS = 10;
	const STACK_COUNT_KEY = 'notentischStackCount';
	const QUADRANT_IDS = ['Q1', 'Q2', 'Q3', 'Q4'];
	const cardElementCache = new Map();
	let cardNodeCache = null;
	let prefetchTimer = null;
	let quadrantOffsets = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
	let lastRenderedShowAudioBadge = null;
	const pdfPathAttemptCache = new Map();

	function resetCardRenderCache() {
		cardElementCache.clear();
		cardNodeCache = null;
		if (prefetchTimer) {
			clearTimeout(prefetchTimer);
			prefetchTimer = null;
		}
	}

	function getCardNodes() {
		if (!xmlData) return [];
		if (!cardNodeCache) {
			cardNodeCache = Array.from(xmlData.querySelectorAll('NotenTisch, Notentisch'));
		}
		return cardNodeCache;
	}

	function getCardNodeById(cardId) {
		if (!xmlData) return null;
		const index = parseInt(cardId, 10);
		if (!Number.isFinite(index)) return null;
		return getCardNodes()[index] || null;
	}

	function cardHasAudioReference(cardNode) {
		if (!cardNode) return false;
		const refNode = cardNode.querySelector('AudioReferenz');
		if (!refNode) return false;
		const filePath = refNode.querySelector('Datei')?.textContent || '';
		return String(filePath).trim().length > 0;
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

		loadCardImage(img, cardInfo.titel, cardInfo.speicherort);

		if (cardInfo.showAudioBadge && cardInfo.hasAudioReference) {
			const badge = document.createElement('span');
			badge.className = 'card-audio-badge';
			badge.title = 'Spielton vorhanden';
			div.appendChild(badge);
		}

		const titleDiv = document.createElement('div');
		titleDiv.className = 'card-title';
		titleDiv.textContent = cardInfo.titel;

		div.appendChild(img);
		div.appendChild(titleDiv);

		div.addEventListener('dragstart', drag);
		div.addEventListener('dblclick', moveCardToQ2);

		return div;
	}

	function getCardCacheSignature(cardInfo) {
		return String(cardInfo.titel || '')
			+ '|' + String(cardInfo.speicherort || '')
			+ '|' + (cardInfo.hasAudioReference ? 'a1' : 'a0')
			+ '|' + (cardInfo.showAudioBadge ? 'b1' : 'b0');
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
				renderBoard();
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
				renderBoard();
			}
		});

		controls.appendChild(upBtn);
		controls.appendChild(downBtn);
		quadrant.appendChild(controls);
	}

	function getStackCount() {
		const input = document.getElementById('stackCount');
		const rawInput = String(input?.value || '').trim();
		const parsedInput = rawInput === '' ? NaN : parseInt(rawInput, 10);
		const stored = parseInt(localStorage.getItem(STACK_COUNT_KEY) || '', 10);
		const raw = Number.isFinite(parsedInput)
			? parsedInput
			: (Number.isFinite(stored) ? stored : 8);
		const safe = Math.max(1, Math.min(MAX_STACK_CARDS, raw));
		if (input) input.value = String(safe);
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

		const quadrantHeight = Math.min(...quadrants.map(q => q.clientHeight));
		let visibleZone = cardHeight;

		if (stackCount > 1) {
			visibleZone = (quadrantHeight - cardHeight) / (stackCount - 1);
		}

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

	function renderBoard() {
		if (!xmlData) return;

		document.body.classList.add('board-rendering');

		const grouped = { Q1: [], Q2: [], Q3: [], Q4: [] };

		QUADRANT_IDS.forEach((quadrantId) => {
			const el = document.getElementById(quadrantId);
			if (el) el.innerHTML = '';
		});

		const cards = getCardNodes();
		const showAudioBadge = isAudioBadgeEnabled();

		if (lastRenderedShowAudioBadge !== null && lastRenderedShowAudioBadge !== showAudioBadge) {
			cardElementCache.clear();
		}
		lastRenderedShowAudioBadge = showAudioBadge;

		const limit = getStackCount();
		const overlapCount = getConfiguredBatchOverlap(limit);

		cards.forEach((cardEl, idx) => {
			const titel = cardEl.querySelector('Titel')?.textContent || 'Unbekannt';
			const speicherort = cardEl.querySelector('Speicherort')?.textContent || '';
			const status = cardEl.querySelector('Arbeitsstatus')?.textContent || 'zurueckgestellt';
			const hasAudioReference = cardHasAudioReference(cardEl);

			let quadrantId = 'Q1';
			if (status.includes('wiederholen')) quadrantId = 'Q2';
			if (status.includes('geübt')) quadrantId = 'Q3';
			if (status.includes('gelernt')) quadrantId = 'Q4';

			grouped[quadrantId].push({ idx, titel, speicherort, hasAudioReference, showAudioBadge });
		});

		QUADRANT_IDS.forEach((quadrantId) => {
			const target = document.getElementById(quadrantId);
			if (!target) return;

			const total = grouped[quadrantId].length;
			const maxOffset = Math.max(0, total - limit);
			const safeOffset = Math.max(0, Math.min(quadrantOffsets[quadrantId] || 0, maxOffset));
			quadrantOffsets[quadrantId] = safeOffset;

			const visibleCards = grouped[quadrantId].slice(safeOffset, safeOffset + limit);
			visibleCards.forEach((cardInfo) => {
				target.appendChild(getOrCreateCardElement(cardInfo));
			});

			createQuadrantStackControls(quadrantId, limit, total, overlapCount);
		});

		scheduleCardPrefetch(grouped, limit, overlapCount);
		setupDropListeners();
		updateStackLayout();

		requestAnimationFrame(() => document.body.classList.remove('board-rendering'));
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

	function loadCardImageFromPdf(imgElement, pdfPath, titel = '') {
		if (!pdfPath || typeof pdfjsLib === 'undefined') {
			if (typeof pdfjsLib === 'undefined') {
				imgElement.style.backgroundColor = '#aaa';
				return;
			}
		}

		const paths = getPdfPathCandidates(pdfPath, titel);
		let pathIndex = 0;

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
				return;
			}

			const serverPath = encodePath(paths[pathIndex]);

			if (pdfPathAttemptCache.get(serverPath) === false) {
				pathIndex++;
				tryNextPdf();
				return;
			}

			pdfjsLib.getDocument(serverPath).promise
				.then(pdf => pdf.getPage(1))
				.then(page => {
					pdfPathAttemptCache.set(serverPath, true);
					const viewport = page.getViewport({ scale: 0.35 });
					const canvas = document.createElement('canvas');
					const context = canvas.getContext('2d');
					canvas.width = viewport.width;
					canvas.height = viewport.height;

					return page.render({ canvasContext: context, viewport }).promise.then(() => {
						imgElement.style.backgroundImage = 'url("' + canvas.toDataURL('image/png') + '")';
						imgElement.style.backgroundColor = '#fff';
					});
				})
				.catch(() => {
					pdfPathAttemptCache.set(serverPath, false);
					pathIndex++;
					tryNextPdf();
				});
		}

		tryNextPdf();
	}

	function loadCardImage(imgElement, titel, pdfPath) {
		const variations = [
			sanitizeTitle(titel),
			'card_' + titel.trim().replace(/[,\.]$/g, '').replace(/ /g, '_') + '.png',
			'card_' + titel.toLowerCase().trim().replace(/[,\.]/g, '').replace(/ö/g, 'oe').replace(/ä/g, 'ae').replace(/ü/g, 'ue').replace(/ /g, '_').replace(/_+$/, '') + '.png',
		];

		const uniqueVariations = [...new Set(variations.filter(Boolean))];
		let currentIdx = 0;

		function tryNextImage() {
			if (currentIdx >= uniqueVariations.length) {
				loadCardImageFromPdf(imgElement, pdfPath, titel);
				return;
			}

			const filename = uniqueVariations[currentIdx];
			const img = new Image();

			img.onload = () => {
				imgElement.style.backgroundImage = 'url("./Cards_Export/' + filename + '")';
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
		getCardNodes,
		getCardNodeById,
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
