'use strict';

// Initial logo loading and cleanup
window.addEventListener('DOMContentLoaded', function () {
    const versionedSrc = './team7712_logo_reefscape.png?v=20251205';
    const networkLogo = new Image();
    networkLogo.onload = function () {
        if (networkLogo.naturalWidth > 0) {
            const logoEl = document.getElementById('teamLogo');
            if (logoEl) logoEl.src = versionedSrc;
        }
    };
    networkLogo.src = versionedSrc;

    try {
        const header = document.querySelector('.header');
        if (header) {
            Array.from(header.childNodes).forEach(function (node) {
                if (node.nodeType === Node.TEXT_NODE) {
                    const txt = node.textContent.trim();
                    if (txt.length > 100 && /^[A-Za-z0-9+/=\s]+$/.test(txt)) {
                        node.parentNode.removeChild(node);
                    }
                }
            });

            const logoEl = document.getElementById('teamLogo');
            if (logoEl) logoEl.src = './team7712_logo_reefscape.png';
        }
    } catch (e) {
        // best-effort cleanup
    }
});

// Core app logic
const MATCHES_KEY = 'team7712_matches';
const PIT_SCOUTS_KEY = 'team7712_pitscouts';
let navigationHistory = ['homePage'];
let currentPage = 'homePage';
let isModalOpen = false;
let modalHistory = [];
let currentQRChunks = [];
let currentQRChunkIndex = 0;
let currentQRImages = [];
const QR_MAX_PAYLOAD_CHARS = 2800;

window.addEventListener('load', function() {
    history.replaceState({page: 'homePage', modal: null}, '', '#home');
    window.addEventListener('popstate', function(event) {
        event.preventDefault();
        if (event.state) {
            if (event.state.modal) {
                if (isModalOpen) { closeModal(); }
            } else if (event.state.page) {
                if (isModalOpen) { closeModal(); } else { showPage(event.state.page, false); }
            }
        } else {
            if (isModalOpen) { closeModal(); }
            else if (currentPage !== 'homePage') { showPage('homePage', false); }
        }
        history.pushState({page: currentPage, modal: isModalOpen ? 'open' : null}, '', getPageHash(currentPage));
    });
});

function getPageHash(pageId) {
    const pageNames = { 'homePage': '#home', 'scoutPage': '#scout', 'pitScoutPage': '#pitscout', 'dataPage': '#data' };
    return pageNames[pageId] || '#home';
}

function navigateToPage(pageId) {
    if (isModalOpen) { closeModal(); return; }
    if (navigationHistory[navigationHistory.length - 1] !== pageId) {
        navigationHistory.push(pageId);
    }
    currentPage = pageId;
    history.pushState({page: pageId, modal: null}, '', getPageHash(pageId));
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    if (pageId === 'homePage') document.body.classList.add('home-active'); else document.body.classList.remove('home-active');
    if (pageId === 'dataPage') loadData();
    if (pageId === 'collectorPage') initCollector();
}

function navigateBack() {
    if (isModalOpen) { closeModal(); return; }
    if (navigationHistory.length > 1) {
        navigationHistory.pop();
        const previousPage = navigationHistory[navigationHistory.length - 1];
        if (currentPage === 'collectorPage' && previousPage !== 'collectorPage') { stopQRScan(); }
        currentPage = previousPage;
        if (previousPage === 'homePage') document.body.classList.add('home-active'); else document.body.classList.remove('home-active');
        history.pushState({page: previousPage, modal: null}, '', getPageHash(previousPage));
        showPage(previousPage, false);
    } else {
        navigateToPage('homePage');
    }
}

function showPage(pageId, addToHistory = true) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    if (currentPage === 'collectorPage' && pageId !== 'collectorPage') { stopQRScan(); }
    if (pageId === 'homePage') document.body.classList.add('home-active'); else document.body.classList.remove('home-active');
    if (pageId === 'dataPage') loadData();
    if (pageId === 'collectorPage') initCollector();
}

// Temporary debug helper to programmatically test whether the defense UI reacts correctly.
// Remove temporary debug helper runDefenseHealthCheck

// Programmatic QR-chunk testing helper (call from console):
// window.testQRChunking(50) -> returns number of chunks and logs example payload sizes
window.testQRChunking = function (numMatches = 50) {
    const now = new Date().toISOString();
    const categories = ['High', 'Medium', 'Low', 'None'];
    const makeMatch = (i) => ({
        matchNumber: i + 1,
        teamNumber: 7712 + (i % 6),
        alliance: i % 2 === 0 ? 'red' : 'blue',
        scoutName: `Test${i}`,
        autoFuelCategory: categories[i % 4],
        autoTower: i % 2 === 0 ? 'Level 1' : 'None',
        teleopFuelCategory: categories[(i + 1) % 4],
        teleopTower: i % 3 === 0 ? 'Level 2' : 'None',
        playedDefense: i % 4 === 0 ? 'Yes' : 'No',
        defenseEffectiveness: i % 4 === 0 ? ['High', 'Medium', 'Low'][i % 3] : 'Not applicable',
        foulsObserved: ['None', 'Minor', 'Major'][i % 3],
        robotStatus: ['Worked full match', 'Partial breakdown', 'Disabled'][i % 3],
        consistencyRating: ['Reliable', 'Average', 'Unreliable'][i % 3],
        notes: 'Auto-generated for QR chunk test',
        timestamp: now,
        id: Date.now() + i
    });

    const matches = Array.from({ length: numMatches }, (_, i) => makeMatch(i));
    const chunks = encodeMatchesForQRChunks(matches, QR_MAX_PAYLOAD_CHARS);
    console.log(`testQRChunking: ${numMatches} matches -> ${chunks.length} chunk(s) (QR_MAX_PAYLOAD_CHARS=${QR_MAX_PAYLOAD_CHARS})`);
    chunks.forEach((c, idx) => console.log(`chunk ${idx + 1} length=${c.length}`));
    return { numMatches, chunkCount: chunks.length, chunkLengths: chunks.map(c => c.length) };
};

// Show a quick QR for any text (useful for testing). Usage: window.quickShowQR('hello world', 300)
window.quickShowQR = async function (text = 'Test', size = 300) {
    try {
        const qrUrl = await generateQR(text, size);
        // Reuse modal pattern
        closeModal();
        setTimeout(() => {
            isModalOpen = true;
            const modal = document.createElement('div');
            modal.className = 'share-modal';
            modal.innerHTML = `
                <div class="share-content">
                    <h2 style="color: #DAA520; font-size: 28px;">Quick QR</h2>
                    <p style="font-size: 18px;">Testing QR content</p>
                    <div class="qr-container">
                        <div id="qrcode" style="min-height: 220px; display:flex; align-items:center; justify-content:center;"></div>
                    </div>
                    <div class="share-buttons">
                        <button class="share-btn download" onclick="downloadQR()">Save QR</button>
                        <button class="share-btn close" onclick="closeModal()">Close</button>
                    </div>
                </div>`;
            // Attach image load/error handlers (network fallback may be used)
            setTimeout(() => {
                const qrc = modal.querySelector('#qrcode');
                if (!qrc) return;
                qrc.innerHTML = '';
                const img = new Image();
                img.alt = 'Quick QR';
                img.style.maxWidth = '220px';
                img.style.borderRadius = '12px';
                img.onload = () => qrc.appendChild(img);
                img.onerror = (err) => {
                    console.warn('quickShowQR image failed to load', err, qrUrl);
                    qrc.innerHTML = `<p style="color:#ff9800; padding:20px; text-align:center;">Could not load QR image.<br><a href="${qrUrl}" target="_blank" rel="noopener">Open QR in new tab</a></p>`;
                };
                img.src = qrUrl;
            }, 60);
            document.body.appendChild(modal);
            window.currentModal = modal;
            window.currentQR = qrUrl;
            modal.onclick = (e) => { if (e.target === modal) closeModal(); };
        }, 80);
    } catch (err) {
        console.error('quickShowQR error:', err);
        showNotification('Quick QR generation failed: ' + err.message, 'error');
    }
};

// Inject synthetic matches into localStorage for manual/manual UI testing.
// Call from Console: window.injectTestMatches(100)
window.injectTestMatches = function (numMatches = 50) {
    const existing = getLocalMatches();
    const now = new Date().toISOString();
    for (let i = 0; i < numMatches; i++) {
        existing.push({
            matchNumber: existing.length + 1,
            teamNumber: 7712 + (i % 6),
            alliance: i % 2 === 0 ? 'red' : 'blue',
            scoutName: `Auto${i}`,
            mobility: 'Yes',
            autoCoralL1: i % 3,
            autoCoralL2: i % 2,
            autoCoralL3: 0,
            autoCoralL4: 0,
            autoAlgaeNetted: 0,
            autoAlgaeProcessor: 0,
            teleopCoralL1: 1,
            teleopCoralL2: 0,
            teleopCoralL3: 0,
            teleopCoralL4: 0,
            teleopAlgaeNetted: 0,
            teleopAlgaeProcessor: 0,
            playedDefense: i % 4 === 0 ? 'Yes' : 'No',
            defenseZone: i % 4 === 0 ? 'Near Reef' : 'None',
            park: 'No',
            climb: 'No',
            notes: 'Injected test match',
            timestamp: now,
            id: Date.now() + Math.random()
        });
    }
    localStorage.setItem(MATCHES_KEY, JSON.stringify(existing));
    showNotification(`${numMatches} test matches injected`, 'success');
    return existing.length;
};

// Collector helpers
let qrStream = null;
let qrScanTimer = null;
let barcodeDetector = ('BarcodeDetector' in window) ? new BarcodeDetector({ formats: ['qr_code'] }) : null;

function initCollector() {
    stopQRScan();
    const vid = document.getElementById('qrVideo');
    if (vid) vid.srcObject = null;
    updateCollectorNotice();
}

function updateCollectorNotice() {
    const el = document.getElementById('collectorNotice');
    if (!el) return;
    const isHttps = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    const hasBarcode = !!('BarcodeDetector' in window);
    let msg = '';
    if (!isHttps) { msg += 'Tip: Live camera scanning needs HTTPS. Use the deployed site (https://7712-scouting.vercel.app) or install the app.\n'; }
    if (!hasBarcode) {
        msg += 'Note: QR scanning via camera is not supported on this browser. Use “Scan From Image” or “Paste Import Link.”\n';
    } else {
        msg += 'If the camera prompt does not appear, allow camera permissions in your browser site settings.\n';
    }
    msg += 'Fallbacks: Scan From Image (upload photo of QR) or Paste Import Link/CSV.';
    el.textContent = msg;
}

async function startQRScan() {
    try {
        const video = document.getElementById('qrVideo');
        const scanner = document.getElementById('qrScanner');
        scanner.style.display = 'block';
        qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = qrStream;
        await video.play();
        showNotification('Camera started. Point at the QR.', 'info');
        if (barcodeDetector) {
            qrScanTimer = setInterval(async () => {
                try {
                    const detections = await barcodeDetector.detect(video);
                    if (detections && detections.length) {
                        const raw = detections[0].rawValue || '';
                        const ok = handleScannedContent(raw);
                        if (ok === true) { stopQRScan(); }
                    }
                } catch {}
            }, 400);
        } else if (window.jsQR) {
            const canvas = document.getElementById('qrCanvas');
            const ctx = canvas.getContext('2d');
            qrScanTimer = setInterval(() => {
                try {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, canvas.width, canvas.height);
                    if (code && code.data) {
                        const ok = handleScannedContent(code.data);
                        if (ok === true) { stopQRScan(); }
                    }
                } catch {}
            }, 500);
            showNotification('Using jsQR fallback for camera scanning.', 'info');
        } else {
            showNotification('QR scanning not supported. Use image scan or paste link.', 'warning');
        }
    } catch (e) {
        showNotification('Camera access failed. Use image scan or paste link.', 'error');
    }
}

function stopQRScan() {
    if (qrScanTimer) { clearInterval(qrScanTimer); qrScanTimer = null; }
    if (qrStream) { qrStream.getTracks().forEach(t => t.stop()); qrStream = null; }
    const scanner = document.getElementById('qrScanner');
    if (scanner) scanner.style.display = 'none';
}

function openImageQR() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const img = new Image();
        img.onload = async () => {
            const canvas = document.getElementById('qrCanvas');
            canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            try {
                if (window.jsQR) {
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, canvas.width, canvas.height);
                    if (code && code.data) { handleScannedContent(code.data); return; }
                }
                if (barcodeDetector) {
                    const detections = await barcodeDetector.detect(canvas);
                    if (detections && detections.length) { const raw = detections[0].rawValue || ''; handleScannedContent(raw); return; }
                }
                showNotification('No QR found in image', 'warning');
            } catch {
                showNotification('QR decode error', 'error');
            }
        };
        img.src = URL.createObjectURL(file);
    };
    input.click();
}

function handleScannedContent(text) {
    try {
        // Try compact QR format first
        if (text.startsWith('T7712|')) {
            const imported = decodeMatchesFromQR(text);
            if (imported && imported.length > 0) {
                const result = mergeImportedMatches(imported);
                showNotification(`✅ Added ${result.added} observation${result.added !== 1 ? 's' : ''}${result.skipped > 0 ? `, skipped ${result.skipped} duplicate${result.skipped !== 1 ? 's' : ''}` : ''}. Total: ${result.total}`, 'success');
                loadData();
                stopQRScan();
                if (currentPage === 'collectorPage') { setTimeout(() => navigateToPage('homePage'), 600); }
                return true;
            }
        }

        let maybeUrl = null;
        if (/^\/?\/?[\w.-]+\//.test(text)) {
            const normalized = /^https?:\/\//i.test(text) ? text : `https://${text.replace(/^\/+/, '')}`;
            try { maybeUrl = new URL(normalized); } catch {}
        } else if (/^https?:\/\//i.test(text)) {
            try { maybeUrl = new URL(text); } catch {}
        }

        // Legacy /import?csv=...
        if (maybeUrl && /\/import\?/.test(maybeUrl.pathname + '?' + maybeUrl.search)) {
            const csvText = maybeUrl.searchParams.get('csv') || '';
            const imported = parseCSVData(csvText);
            const result = mergeImportedMatches(imported);
            showNotification(`Imported ${result.added} new, skipped ${result.skipped}. Total: ${result.total}`, 'success');
            loadData();
            stopQRScan();
            if (currentPage === 'collectorPage') { setTimeout(() => navigateToPage('homePage'), 600); }
            return true;
        }

        // Hash-based #import?csv=...
        if (maybeUrl && typeof maybeUrl.hash === 'string' && maybeUrl.hash.startsWith('#import')) {
            const hashQuery = maybeUrl.hash.replace(/^#import\??/, '');
            const params = new URLSearchParams(hashQuery);
            const csvText = params.get('csv') || '';
            const imported = parseCSVData(csvText);
            const result = mergeImportedMatches(imported);
            showNotification(`Imported ${result.added} new, skipped ${result.skipped}. Total: ${result.total}`, 'success');
            loadData();
            stopQRScan();
            if (currentPage === 'collectorPage') { setTimeout(() => navigateToPage('homePage'), 600); }
            return true;
        }

        // Raw CSV
        const imported = parseCSVData(text);
        const result = mergeImportedMatches(imported);
        showNotification(`Imported ${result.added} new, skipped ${result.skipped}. Total: ${result.total}`, 'success');
        loadData();
        stopQRScan();
        if (currentPage === 'collectorPage') { setTimeout(() => navigateToPage('homePage'), 600); }
        return true;
    } catch (e) {
        showNotification('Import failed from scanned or pasted content', 'error');
        return false;
    }
}

function processImportLink() {
    const val = document.getElementById('importLinkInput').value.trim();
    if (!val) { showNotification('Paste an import link first', 'warning'); return; }
    handleScannedContent(val);
}

function processCSVText() {
    const text = document.getElementById('rawCSVInput').value.trim();
    if (!text) { showNotification('Paste CSV text first', 'warning'); return; }
    handleScannedContent(text);
}

function showNotification(message, type = 'info') {
    const colors = { success: '#4caf50', error: '#f44336', warning: '#ff9800', info: '#DAA520' };
    const notification = document.createElement('div');
    notification.style.cssText = `position: fixed; top: 20px; right: 20px; padding: 18px 25px; border-radius: 18px; color: white; z-index: 9999; background: ${colors[type]}; font-weight: 600; box-shadow: 0 8px 30px rgba(0,0,0,0.4); max-width: 350px; font-size: 16px;`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 4500);
}

function getLocalMatches() {
    try { return JSON.parse(localStorage.getItem(MATCHES_KEY) || '[]'); } catch { return []; }
}

function submitMatch(event) {
    event.preventDefault();
    const form = document.getElementById('matchForm');
    const formData = new FormData(form);
    const matchData = {
        matchNumber: parseInt(formData.get('matchNumber')),
        teamNumber: parseInt(formData.get('teamNumber')),
        location: (formData.get('location') || '').trim(),
        alliance: formData.get('alliance'),
        scoutName: formData.get('scoutName'),
        autoFuelCategory: formData.get('autoFuelCategory') || 'Not observed',
        autoTower: formData.get('autoTower') || 'None',
        teleopFuelCategory: formData.get('teleopFuelCategory') || 'Not observed',
        navigation: formData.get('navigation') || 'Not observed',
        teleopTower: formData.get('teleopTower') || 'None',
        playedDefense: formData.get('playedDefense') || 'No',
        defenseEffectiveness: formData.get('defenseEffectiveness') || 'Not applicable',
        foulsObserved: formData.get('foulsObserved') || 'None',
        robotStatus: formData.get('robotStatus') || 'Worked full match',
        consistencyRating: formData.get('consistencyRating') || 'Reliable',
        notes: formData.get('notes') || '',
        timestamp: new Date().toISOString(),
        id: Date.now()
    };
    const matches = getLocalMatches();
    matches.push(matchData);
    localStorage.setItem(MATCHES_KEY, JSON.stringify(matches));
    showNotification(`Match ${matchData.matchNumber} saved successfully!`, 'success');
    form.reset();
    setTimeout(() => navigateToPage('homePage'), 2000);
}

function getLocalPitScouts() {
    try { return JSON.parse(localStorage.getItem(PIT_SCOUTS_KEY) || '[]'); } catch { return []; }
}

function submitPitScout(event) {
    event.preventDefault();
    const form = document.getElementById('pitScoutForm');
    const formData = new FormData(form);
    const pitData = {
        teamNumber: parseInt(formData.get('pitTeamNumber')),
        scoutName: formData.get('pitScoutName'),
        robotDimension: formData.get('robotDimension') || '',
        robotWeight: formData.get('robotWeight') || '',
        drivetrainType: formData.get('drivetrainType') || 'Not specified',
        navigationCapability: formData.get('navigationCapability') || 'Not specified',
        autoScore: formData.get('autoScore') || '',
        fuelCapacity: formData.get('fuelCapacity') || '',
        climbCapability: formData.get('climbCapability') || 'Not specified',
        driverExperience: formData.get('driverExperience') || 'Not specified',
        pitNotes: formData.get('pitNotes') || '',
        timestamp: new Date().toISOString(),
        id: Date.now()
    };
    const pitScouts = getLocalPitScouts();
    // Check if team already scouted, update instead of duplicate
    const existingIndex = pitScouts.findIndex(p => p.teamNumber === pitData.teamNumber);
    if (existingIndex >= 0) {
        pitScouts[existingIndex] = pitData;
        showNotification(`Team ${pitData.teamNumber} pit data updated!`, 'success');
    } else {
        pitScouts.push(pitData);
        showNotification(`Team ${pitData.teamNumber} pit data saved!`, 'success');
    }
    localStorage.setItem(PIT_SCOUTS_KEY, JSON.stringify(pitScouts));
    form.reset();
    setTimeout(() => navigateToPage('homePage'), 2000);
}

function loadData() {
    const matches = getLocalMatches();
    const pitScouts = getLocalPitScouts();
    const display = document.getElementById('dataDisplay');
    
    if (matches.length === 0 && pitScouts.length === 0) {
        display.innerHTML = `
            <div style="text-align: center; padding: 50px; color: #ccc;">
                <div style="font-size: 64px; margin-bottom: 25px;"></div>
                <h3 style="font-size: 24px; margin-bottom: 15px; color: #DAA520;">No data recorded yet</h3>
                <p style="font-size: 18px; margin-bottom: 25px;">Start scouting!</p>
                <button class="btn success" onclick="navigateToPage('scoutPage')" style="width: auto; padding: 20px 40px; margin: 10px;">Scout Match</button>
                <button class="btn success" onclick="navigateToPage('pitScoutPage')" style="width: auto; padding: 20px 40px; margin: 10px;">Pit Scout</button>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    // Pit Scout Data Section
    if (pitScouts.length > 0) {
        html += `<div style="margin-bottom: 40px;">
            <h3 style="color: #DAA520; font-size: 28px; text-align: center; margin-bottom: 20px;">📋 ${pitScouts.length} Pit Scout${pitScouts.length !== 1 ? 's' : ''}</h3>`;
        pitScouts.sort((a, b) => (a.teamNumber || 0) - (b.teamNumber || 0)).forEach(pit => {
            html += `
                <div class="match-card">
                    <div class="match-header">Team ${pit.teamNumber} - Pit Scout</div>
                    <div style="margin: 12px 0; font-size: 16px;"><strong>Scout:</strong> ${pit.scoutName}</div>
                    <div style="margin: 12px 0; font-size: 16px;"><strong>Dimensions:</strong> ${pit.robotDimension || 'Not specified'} ${pit.robotWeight ? `| ${pit.robotWeight} lbs` : ''}</div>
                    <div style="margin: 12px 0; font-size: 16px;"><strong>Drivetrain:</strong> ${pit.drivetrainType} | <strong>Navigation:</strong> ${pit.navigationCapability}</div>
                    <div style="margin: 12px 0; font-size: 16px;"><strong>FUEL Capacity:</strong> ${pit.fuelCapacity || 'Unknown'} | <strong>Climb:</strong> ${pit.climbCapability}</div>
                    ${pit.autoScore ? `<div style="margin: 12px 0; font-size: 16px;"><strong>Auto:</strong> ${pit.autoScore}</div>` : ''}
                    <div style="margin: 12px 0; font-size: 16px;"><strong>Driver:</strong> ${pit.driverExperience}</div>
                    ${pit.pitNotes ? `<div style="margin: 12px 0; font-size: 16px;"><strong>Notes:</strong> ${pit.pitNotes}</div>` : ''}
                    <div style="margin-top: 15px; font-size: 14px; color: #aaa;">Recorded: ${new Date(pit.timestamp).toLocaleString()}</div>
                </div>
            `;
        });
        html += `</div>`;
    }
    
    // Match Data Section
    if (matches.length > 0) {
        // Group matches by match number + team number
        const groupedMatches = {};
        matches.forEach(match => {
            const key = `${match.matchNumber}-${match.teamNumber}`;
            if (!groupedMatches[key]) groupedMatches[key] = [];
            groupedMatches[key].push(match);
        });
        
        const uniqueCount = Object.keys(groupedMatches).length;
        html += `<div style="margin-bottom: 20px;">
            <h3 style="color: #DAA520; font-size: 28px; text-align: center; margin-bottom: 20px;">🏆 ${matches.length} Observation${matches.length !== 1 ? 's' : ''} (${uniqueCount} unique matches)</h3>`;
        
        Object.keys(groupedMatches)
            .sort((a, b) => {
                const [matchA] = a.split('-').map(Number);
                const [matchB] = b.split('-').map(Number);
                return matchA - matchB;
            })
            .forEach(key => {
            const observations = groupedMatches[key];
            const multiScout = observations.length > 1;
            observations.forEach((match, idx) => {
        // Support both new (REBUILT) and old (REEFSCAPE) data formats
                const autoFuelCategory = match.autoFuelCategory || (match.autoFuel !== undefined ? `${match.autoFuel} FUEL` : 'Not observed');
                const teleopFuelCategory = match.teleopFuelCategory || (match.teleopFuel !== undefined ? `${match.teleopFuel} FUEL` : 'Not observed');
                const autoTower = match.autoTower || 'None';
                const teleopTower = match.teleopTower || 'None';
                const navigation = match.navigation || 'Not observed';
                
                const scoutIndicator = multiScout ? ` <span style="background: #ff9800; color: #000; padding: 2px 8px; border-radius: 8px; font-size: 14px; font-weight: 700;">👥 Scout ${idx + 1}/${observations.length}</span>` : '';
                
                html += `
                    <div class="match-card">
                        <div class="match-header">Match ${match.matchNumber} - Team ${match.teamNumber}${scoutIndicator}</div>
                        <div style="margin: 12px 0; font-size: 16px;"><strong>Alliance:</strong> ${match.alliance} | <strong>Scout:</strong> ${match.scoutName}</div>
                ${match.location ? `<div style="margin: 12px 0; font-size: 16px;"><strong>Location:</strong> ${match.location}</div>` : ''}
                <div style="margin: 12px 0; font-size: 16px;"><strong>Auto:</strong> FUEL: ${autoFuelCategory}, Tower=${autoTower}</div>
                <div style="margin: 12px 0; font-size: 16px;"><strong>Teleop:</strong> FUEL: ${teleopFuelCategory} | Nav: ${navigation}</div>
                <div style="margin: 12px 0; font-size: 16px;"><strong>Defense:</strong> ${match.playedDefense === 'Yes' ? 'Yes' : 'No'}${match.defenseEffectiveness && match.defenseEffectiveness !== 'Not applicable' ? ` (${match.defenseEffectiveness})` : ''}</div>
                <div style="margin: 12px 0; font-size: 16px;"><strong>Endgame:</strong> Tower=${teleopTower}</div>
                <div style="margin: 12px 0; font-size: 16px;"><strong>Performance:</strong> Fouls=${match.foulsObserved || 'None'}, Status=${match.robotStatus || 'Worked full match'}, Consistency=${match.consistencyRating || 'Reliable'}</div>
                ${match.notes ? `<div style="margin: 12px 0; font-size: 16px;"><strong>Notes:</strong> ${match.notes}</div>` : ''}
                    <div style="margin-top: 15px; font-size: 14px; color: #aaa;">Recorded: ${new Date(match.timestamp).toLocaleString()}</div>
                </div>
            `;
            });
        });
        html += `</div>`;
    }
    display.innerHTML = html;
}

function generateCSV() {
    const matches = getLocalMatches();
    const pitScouts = getLocalPitScouts();
    
    let csv = '';
    
    // Match Data CSV
    if (matches.length > 0) {
        const matchHeaders = ['Type','Match','Team','Alliance','Scout','Location','AutoFuelCategory','AutoTower','TeleopFuelCategory','Navigation','TeleopTower','PlayedDefense','DefenseEffectiveness','FoulsObserved','RobotStatus','ConsistencyRating','Notes','Timestamp'];
        const matchRows = matches.map(m => {
            const safeNotes = (m.notes || '').replace(/"/g, '""');
            return [
                'Match',
                m.matchNumber,
                m.teamNumber,
                m.alliance,
                m.scoutName,
                m.location || '',
                m.autoFuelCategory || (m.autoFuel !== undefined ? `${m.autoFuel} FUEL` : 'Not observed'),
                m.autoTower || 'None',
                m.teleopFuelCategory || (m.teleopFuel !== undefined ? `${m.teleopFuel} FUEL` : 'Not observed'),
                m.navigation || 'Not observed',
                m.teleopTower || 'None',
                m.playedDefense,
                m.defenseEffectiveness || 'Not applicable',
                m.foulsObserved || 'None',
                m.robotStatus || 'Worked full match',
                m.consistencyRating || 'Reliable',
                `"${safeNotes}"`,
                m.timestamp
            ].join(',');
        });
        csv = [matchHeaders.join(','), ...matchRows].join('\n');
    }
    
    // Pit Scout Data CSV
    if (pitScouts.length > 0) {
        const pitHeaders = ['Type','Team','Scout','Dimensions','Weight','Drivetrain','Navigation','AutoScore','FuelCapacity','ClimbCapability','DriverExperience','Notes','Timestamp'];
        const pitRows = pitScouts.map(p => {
            const safeAutoScore = (p.autoScore || '').replace(/"/g, '""');
            const safePitNotes = (p.pitNotes || '').replace(/"/g, '""');
            return [
                'PitScout',
                p.teamNumber,
                p.scoutName,
                p.robotDimension || '',
                p.robotWeight || '',
                p.drivetrainType,
                p.navigationCapability,
                `"${safeAutoScore}"`,
                p.fuelCapacity || '',
                p.climbCapability,
                p.driverExperience,
                `"${safePitNotes}"`,
                p.timestamp
            ].join(',');
        });
        if (csv) csv += '\n\n'; // Separate sections
        csv += [pitHeaders.join(','), ...pitRows].join('\n');
    }
    
    return csv;
}

async function generateQR(text, size = 300) {
    return new Promise((resolve, reject) => {
        const chartApiUrl = `https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chl=${encodeURIComponent(text)}`;
        if (typeof QRCode === 'undefined') {
            console.warn('QRCode library not loaded - falling back to Google Chart API');
            try { showNotification('QRCode library unavailable — using network fallback', 'warning'); } catch(e) {}
            resolve(chartApiUrl);
            return;
        }

        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-10000px';
        container.style.top = '-10000px';
        container.style.width = `${size}px`;
        container.style.height = `${size}px`;
        container.style.visibility = 'hidden';
        document.body.appendChild(container);

        const cleanup = () => {
            if (document.body.contains(container)) {
                document.body.removeChild(container);
            }
        };

        try {
            const qr = new QRCode(container, {
                text,
                width: size,
                height: size,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.L,
            });

            let attempts = 0;
            const maxAttempts = 20; // ~2 seconds total wait time

            const tryResolve = () => {
                attempts += 1;
                try {
                    const canvas = container.querySelector('canvas');
                    if (canvas && typeof canvas.toDataURL === 'function') {
                        const dataUrl = canvas.toDataURL('image/png');
                        cleanup();
                        resolve(dataUrl);
                        return;
                    }
                    const imgEl = container.querySelector('img');
                    if (imgEl && imgEl.src && !imgEl.src.startsWith('about:blank')) {
                        cleanup();
                        resolve(imgEl.src);
                        return;
                    }
                } catch (err) {
                    cleanup();
                    // Try network fallback
                    console.warn('QR rendering error, falling back to Google Chart API', err);
                    try { showNotification('Local QR rendering failed — using network fallback', 'warning'); } catch(e) {}
                    resolve(`https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chl=${encodeURIComponent(text)}`);
                    return;
                }

                if (attempts >= maxAttempts) {
                    cleanup();
                    // Try network fallback when rendering times out
                    console.warn('QR rendering timed out - using network fallback');
                    try { showNotification('Local QR rendering timed out — using network fallback', 'warning'); } catch(e) {}
                    resolve(`https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chl=${encodeURIComponent(text)}`);
                    return;
                }
                setTimeout(tryResolve, 100);
            };

            setTimeout(tryResolve, 120);
        } catch (err) {
            cleanup();
            reject(err);
        }
    });
}

function prefixForQR(csvText) { return `TEAM7712CSV\n${csvText}`; }

function encodeMatchRecord(match) {
    const note = (match.notes || '').replace(/\|/g, ';').replace(/\n/g, ' ').substring(0, 120);
    // REBUILT 2026 format: simplified fields with category-based FUEL scoring
    return [
        match.matchNumber || 0,
        match.teamNumber || 0,
        (match.alliance || 'red')[0],
        match.scoutName || '',
        match.location || '',
        match.autoFuelCategory || 'Not observed',
        match.autoTower || 'None',
        match.teleopFuelCategory || 'Not observed',
        match.navigation || 'Not observed',
        match.teleopTower || 'None',
        (match.playedDefense === 'Yes' ? 'Y' : 'N'),
        match.defenseEffectiveness || 'Not applicable',
        match.foulsObserved || 'None',
        match.robotStatus || 'Worked full match',
        match.consistencyRating || 'Reliable',
        note
    ].join('|');
}

function buildQRPayload(lines, chunkIndex, totalChunks) {
    return `T7712|v2|${chunkIndex}|${totalChunks}|${lines.join('\n')}`;
}

function encodeMatchesForQRChunks(matches, maxChars = QR_MAX_PAYLOAD_CHARS) {
    if (!matches.length) return [];
    const lines = matches.map(encodeMatchRecord);
    const chunks = [];
    let current = [];

    const pushCurrent = () => {
        if (current.length) {
            chunks.push(current);
            current = [];
        }
    };

    lines.forEach(line => {
        current.push(line);
        const tentative = buildQRPayload(current, chunks.length + 1, chunks.length + 1);
        if (tentative.length > maxChars) {
            current.pop();
            if (!current.length) {
                throw new Error('Single match exceeds QR payload limit');
            }
            pushCurrent();
            current.push(line);
        }
    });
    pushCurrent();

    const total = chunks.length || 1;
    return chunks.map((chunkLines, idx) => buildQRPayload(chunkLines, idx + 1, total));
}

function decodeMatchesFromQR(qrText) {
    if (!qrText.startsWith('T7712|')) return null;
    const payload = qrText.substring(6);

    const decodeLines = (encodedString) => encodedString.split('\n').filter(line => line.trim().length > 0).map(decodeMatchLine).filter(Boolean);

    if (payload.startsWith('v2|')) {
        const parts = payload.split('|');
        if (parts.length < 4) return null;
        const encodedBody = parts.slice(3).join('|');
        return decodeLines(encodedBody);
    }

    // Legacy format fallback (no chunk metadata, no defense fields)
    return decodeLines(payload);
}

function decodeMatchLine(line) {
    const parts = line.split('|');
    // REBUILT 2026 format: 16 fields (match, team, alliance, scout, location, autoFuel, autoTower, teleopFuel, nav, teleopTower, defense, defenseEff, fouls, status, consistency, notes)
    if (parts.length < 15) return null; // At least enough fields for core data
    
    return {
        matchNumber: parseInt(parts[0], 10) || 0,
        teamNumber: parseInt(parts[1], 10) || 0,
        alliance: parts[2] === 'r' ? 'red' : 'blue',
        scoutName: parts[3] || '',
        location: parts[4] || '',
        autoFuelCategory: parts[5] || 'Not observed',
        autoTower: parts[6] || 'None',
        teleopFuelCategory: parts[7] || 'Not observed',
        navigation: parts[8] || 'Not observed',
        teleopTower: parts[9] || 'None',
        playedDefense: parts[10] === 'Y' ? 'Yes' : 'No',
        defenseEffectiveness: parts[11] || 'Not applicable',
        foulsObserved: parts[12] || 'None',
        robotStatus: parts[13] || 'Worked full match',
        consistencyRating: parts[14] || 'Reliable',
        notes: parts.slice(15).join('|') || '',
        timestamp: new Date().toISOString(),
        id: Date.now() + Math.random()
    };
}

function buildImportUrl(csvText) {
    const base = window.location.origin;
    return `${base}/#import?csv=${encodeURIComponent(csvText)}`;
}

function clearAllData() {
    localStorage.removeItem(MATCHES_KEY);
    localStorage.removeItem(PIT_SCOUTS_KEY);
    showNotification('All scouting data has been cleared', 'success');
    closeModal();
    if (currentPage === 'dataPage') { loadData(); }
}

function openExportModal() {
    const matches = getLocalMatches();
    const pitScouts = getLocalPitScouts();
    if (matches.length === 0 && pitScouts.length === 0) { showNotification('No data to export yet', 'warning'); return; }
    isModalOpen = true;
    const csvData = generateCSV();
    const modal = document.createElement('div');
    modal.className = 'share-modal';
    modal.innerHTML = `
        <div class="share-content">
            <h2 style="color: #DAA520; font-size: 28px;">Export Scouting Data</h2>
            <p style="font-size: 18px;"><strong>${matches.length} matches</strong> ready to export</p>
            <div class="share-buttons">
                <button class="share-btn copy" onclick="copyCSV()">Copy CSV</button>
                <button class="share-btn download" onclick="downloadCSV()">Download CSV</button>
                <button class="share-btn qr" onclick="showQRForOffline()">QR Code (Offline)</button>
                <button class="share-btn native" onclick="shareNative()">Native Share</button>
                <button class="share-btn close" onclick="closeModal()">Close</button>
            </div>
            <h4 style="color: #DAA520; font-size: 20px;">CSV Preview:</h4>
            <textarea id="csvPreview" readonly style="width: 100%; height: 180px; font-family: monospace; font-size: 14px; border: 3px solid #DAA520; border-radius: 12px; padding: 20px; background: rgba(0,0,0,0.3); color: white;">${csvData}</textarea>
        </div>
    `;
    document.body.appendChild(modal);
    window.currentModal = modal;
    window.currentCSV = csvData;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };
}

async function openShareModal() {
    const matches = getLocalMatches();
    if (matches.length === 0) { showNotification('No data to share yet', 'warning'); return; }
    
    const csvData = generateCSV();
    const importUrl = buildImportUrl(csvData);
    
    // Show loading modal first
    isModalOpen = true;
    const modal = document.createElement('div');
    modal.className = 'share-modal';
    modal.innerHTML = `
        <div class="share-content">
            <h2 style="color: #DAA520; font-size: 28px;">Share Scouting Data</h2>
            <p style="font-size: 18px;"><strong>${matches.length} matches</strong> ready to share via QR code</p>
            <div class="qr-container">
                <h3 style="color: #DAA520; font-size: 22px;">Generating QR Code...</h3>
                <div id="qrcode" style="min-height: 220px; display: flex; align-items: center; justify-content: center;">
                    <div style="color: #DAA520; font-size: 18px;">⏳ Please wait...</div>
                </div>
            </div>
            <div class="share-buttons">
                <button class="share-btn copy" onclick="copyCSV()">Copy Data</button>
                <button class="share-btn copy" onclick="copyImportLink()">Copy Import Link</button>
                <button class="share-btn download" onclick="downloadQR()" disabled>Save QR Code</button>
                <button class="share-btn danger" onclick="openClearDataModal()">Clear Data</button>
                <button class="share-btn close" onclick="closeModal()">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    window.currentModal = modal;
    window.currentCSV = csvData;
    window.currentImportUrl = importUrl;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };
    
    // Generate QR code asynchronously
    try {
        const qrUrl = await generateQR(importUrl, 300);
        window.currentQR = qrUrl;
        
        // Update modal with QR code
        const qrContainer = modal.querySelector('#qrcode');
        const titleEl = modal.querySelector('.qr-container h3');
        if (qrContainer && titleEl) {
            titleEl.textContent = 'Scan to Import Data';
            qrContainer.innerHTML = `<img src="${qrUrl}" alt="QR Code" style="max-width: 220px; border-radius: 12px;">`;
            const downloadBtn = modal.querySelector('.share-btn.download');
            if (downloadBtn) downloadBtn.disabled = false;
        }
    } catch (error) {
        console.error('QR generation error:', error);
        const qrContainer = modal.querySelector('#qrcode');
        const titleEl = modal.querySelector('.qr-container h3');
        if (qrContainer && titleEl) {
            titleEl.textContent = 'QR Generation Failed';
            qrContainer.innerHTML = `<p style="color: #ff9800; padding: 20px;">Too much data for QR code.<br>Use Copy Data or Copy Import Link instead.</p>`;
            // Offer to create offline multi-chunk QR codes automatically when data is too large
            const buttonsEl = modal.querySelector('.share-buttons');
            if (buttonsEl) {
                const offlineBtn = document.createElement('button');
                offlineBtn.className = 'share-btn qr';
                offlineBtn.textContent = 'Create Offline QR Codes';
                offlineBtn.onclick = () => { showQRForOffline(); };
                buttonsEl.insertBefore(offlineBtn, buttonsEl.querySelector('.share-btn.danger'));
            }
        }
        showNotification('QR generation failed - use Copy buttons instead', 'warning');
    }
}

function parseCSVData(csvText) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) { throw new Error('CSV must include a header row and at least one match'); }
    const headers = splitCSVLine(lines[0]);
    const required = ['Match','Team','Alliance','Scout','Mobility','AutoCoralL1','AutoCoralL2','AutoCoralL3','AutoCoralL4','AutoAlgaeNetted','AutoAlgaeProcessor','TeleopCoralL1','TeleopCoralL2','TeleopCoralL3','TeleopCoralL4','TeleopAlgaeNetted','TeleopAlgaeProcessor','Park','Climb'];
    required.forEach(header => { if (!headers.includes(header)) { throw new Error(`Missing required column: ${header}`); } });
    const index = {}; headers.forEach((header, idx) => { index[header] = idx; });
    const hasDefense = headers.includes('PlayedDefense');
    const hasDefenseZone = headers.includes('DefenseZone');
    return lines.slice(1).map((line, lineNumber) => {
        const cells = splitCSVLine(line);
        if (cells.length < headers.length) { throw new Error(`Row ${lineNumber + 2} is malformed or missing values`); }
        const getValue = (header) => { const value = cells[index[header]] ?? ''; return typeof value === 'string' ? value.trim() : value; };
        const toYesNo = (value) => (/^y(es)?$/i.test(value) ? 'Yes' : 'No');
        const toNumber = (value) => { const num = parseInt(value, 10); return Number.isFinite(num) ? num : 0; };
        const timestamp = getValue('Timestamp') || new Date().toISOString();
        const notes = getValue('Notes') || '';
        return {
            matchNumber: toNumber(getValue('Match')),
            teamNumber: toNumber(getValue('Team')),
            alliance: (getValue('Alliance') || '').toLowerCase(),
            scoutName: getValue('Scout') || '',
            mobility: toYesNo(getValue('Mobility')),
            autoCoralL1: toNumber(getValue('AutoCoralL1')),
            autoCoralL2: toNumber(getValue('AutoCoralL2')),
            autoCoralL3: toNumber(getValue('AutoCoralL3')),
            autoCoralL4: toNumber(getValue('AutoCoralL4')),
            autoAlgaeNetted: toNumber(getValue('AutoAlgaeNetted')),
            autoAlgaeProcessor: toNumber(getValue('AutoAlgaeProcessor')),
            teleopCoralL1: toNumber(getValue('TeleopCoralL1')),
            teleopCoralL2: toNumber(getValue('TeleopCoralL2')),
            teleopCoralL3: toNumber(getValue('TeleopCoralL3')),
            teleopCoralL4: toNumber(getValue('TeleopCoralL4')),
            teleopAlgaeNetted: toNumber(getValue('TeleopAlgaeNetted')),
            teleopAlgaeProcessor: toNumber(getValue('TeleopAlgaeProcessor')),
            playedDefense: hasDefense ? toYesNo(getValue('PlayedDefense')) : 'No',
            defenseZone: hasDefenseZone ? (getValue('DefenseZone') || 'None') : 'None',
            park: toYesNo(getValue('Park')),
            climb: getValue('Climb') || 'Yes, Shallow',
            notes: notes,
            timestamp,
            id: Date.now() + lineNumber
        };
    });
}

function splitCSVLine(line) {
    const pattern = /,(?=(?:[^"]*"[^"]*")*[^"]*$)/;
    return line.split(pattern).map(cell => {
        let value = cell.trim();
        if (value.startsWith('"') && value.endsWith('"')) { value = value.slice(1, -1).replace(/""/g, '"'); }
        return value;
    });
}

function mergeImportedMatches(importedMatches) {
    const currentMatches = getLocalMatches();
    // Only skip if exact duplicate (same ID/timestamp) from same scout
    const existingKeys = new Set(currentMatches.map(match => `${match.id}-${match.timestamp}`));
    let added = 0; let skipped = 0;
    importedMatches.forEach(match => {
        const key = `${match.id}-${match.timestamp}`;
        if (existingKeys.has(key)) { skipped += 1; return; }
        currentMatches.push(match); existingKeys.add(key); added += 1;
    });
    if (added > 0) { localStorage.setItem(MATCHES_KEY, JSON.stringify(currentMatches)); }
    return { added, skipped, total: currentMatches.length };
}

function openClearDataModal() {
    const matches = getLocalMatches();
    if (matches.length === 0) { showNotification('No data to clear', 'info'); return; }
    closeModal();
    setTimeout(() => {
        isModalOpen = true;
        const modal = document.createElement('div');
        modal.className = 'share-modal';
        modal.innerHTML = `
            <div class="share-content">
                <h2 style="color: #dc3545; font-size: 28px;"> Clear All Data</h2>
                <p style="font-size: 18px; margin: 25px 0;">You are about to delete <strong>${matches.length} match${matches.length !== 1 ? 'es' : ''}</strong> from your local storage.</p>
                <p style="font-size: 16px; color: #ff9800; margin: 25px 0;"><strong>Warning:</strong> This action cannot be undone. Make sure you have exported your data first if you need to keep it.</p>
                <div class="share-buttons">
                    <button class="share-btn" onclick="openExportModal()">Export First</button>
                    <button class="share-btn danger" onclick="clearAllData()">Delete All Data</button>
                    <button class="share-btn close" onclick="closeModal()">Cancel</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        window.currentModal = modal;
        modal.onclick = (e) => { if (e.target === modal) closeModal(); };
    }, 100);
}

function showQRModal(type) { closeModal(); setTimeout(() => openShareModal(), 100); }

async function showQRForOffline() {
    const matches = getLocalMatches();
    if (matches.length === 0) {
        showNotification('No data to share yet', 'warning');
        return;
    }

    let qrChunks;
    try {
        qrChunks = encodeMatchesForQRChunks(matches, QR_MAX_PAYLOAD_CHARS);
    } catch (error) {
        showNotification(`QR prep failed: ${error.message}`, 'error');
        return;
    }

    closeModal();

    setTimeout(() => {
        isModalOpen = true;
        currentQRChunks = qrChunks;
        currentQRChunkIndex = 0;
        currentQRImages = new Array(qrChunks.length).fill(null);

        const modal = document.createElement('div');
        modal.className = 'share-modal';
        modal.innerHTML = `
            <div class="share-content">
                <h2 style="color: #DAA520; font-size: 28px;">Offline QR Code</h2>
                <p style="font-size: 18px;"><strong>${matches.length} match${matches.length !== 1 ? 'es' : ''}</strong> ready for offline sharing</p>
                <div class="qr-container">
                    <h3 style="color: #DAA520; font-size: 22px;">Preparing QR Code…</h3>
                    <div id="qrcode" style="min-height: 320px; display: flex; align-items: center; justify-content: center;">
                        <div style="color: #DAA520; font-size: 18px;">⏳ Rendering…</div>
                    </div>
                    <p id="qrPager" style="margin-top: 12px; color: #ccc; font-size: 14px;">QR 1 of ${qrChunks.length}</p>
                    <p id="qrInstructions" style="margin-top: 12px; color: #ccc; font-size: 14px;"></p>
                </div>
                <div class="share-buttons">
                    <button id="qrPrevBtn" class="share-btn" onclick="changeQRChunk(-1)" disabled>◀ Previous QR</button>
                    <button id="qrNextBtn" class="share-btn" onclick="changeQRChunk(1)" ${qrChunks.length > 1 ? '' : 'disabled'}>Next QR ▶</button>
                    <button class="share-btn download" onclick="downloadQR()" disabled>Save QR Image</button>
                    <button class="share-btn close" onclick="closeModal()">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        window.currentModal = modal;
        modal.onclick = (e) => { if (e.target === modal) closeModal(); };

        renderOfflineQRChunk();
    }, 80);
}

function changeQRChunk(direction) {
    if (!currentQRChunks.length) return;
    const nextIndex = currentQRChunkIndex + direction;
    if (nextIndex < 0 || nextIndex >= currentQRChunks.length) return;
    currentQRChunkIndex = nextIndex;
    renderOfflineQRChunk();
}

async function renderOfflineQRChunk() {
    const modal = window.currentModal;
    if (!modal || !currentQRChunks.length) return;

    const qrContainer = modal.querySelector('#qrcode');
    const titleEl = modal.querySelector('.qr-container h3');
    const instructionsEl = modal.querySelector('#qrInstructions');
    const pagerEl = modal.querySelector('#qrPager');
    const prevBtn = modal.querySelector('#qrPrevBtn');
    const nextBtn = modal.querySelector('#qrNextBtn');
    const downloadBtn = modal.querySelector('.share-btn.download');

    if (!qrContainer || !titleEl || !pagerEl || !downloadBtn) return;

    pagerEl.textContent = `QR ${currentQRChunkIndex + 1} of ${currentQRChunks.length}`;
    if (prevBtn) prevBtn.disabled = currentQRChunkIndex === 0;
    if (nextBtn) nextBtn.disabled = currentQRChunkIndex === currentQRChunks.length - 1;
    downloadBtn.disabled = true;
    titleEl.textContent = 'Rendering QR Code…';
    qrContainer.innerHTML = '<div style="color:#DAA520; font-size:18px;">⏳ Rendering…</div>';
    instructionsEl.textContent = '';

    try {
        if (!currentQRImages[currentQRChunkIndex]) {
            const dataUrl = await generateQR(currentQRChunks[currentQRChunkIndex], 500);
            currentQRImages[currentQRChunkIndex] = dataUrl;
        }
        const qrUrl = currentQRImages[currentQRChunkIndex];
        window.currentQR = qrUrl;
        // Create image element and handle load/error to detect network fallback failures
        qrContainer.innerHTML = '';
        const img = new Image();
        img.alt = 'QR Code';
        img.style.maxWidth = '100%';
        img.style.maxHeight = '520px';
        img.style.borderRadius = '12px';
        img.onload = () => {
            qrContainer.appendChild(img);
            titleEl.textContent = 'Scan to Import Data (Offline)';
        };
        img.onerror = (err) => {
            console.warn('QR image failed to load', err, qrUrl);
            qrContainer.innerHTML = `<p style="color:#ff9800; padding:20px; text-align:center;">Could not load QR image.<br>Try "Download QR Image" or use Copy CSV/Import Link instead.<br><a href="${qrUrl}" target="_blank" rel="noopener">Open QR URL</a></p>`;
            titleEl.textContent = 'QR Image Failed to Load';
        };
        img.src = qrUrl;
        titleEl.textContent = 'Scan to Import Data (Offline)';
        instructionsEl.textContent = currentQRChunks.length > 1
            ? 'Scan each QR code in order (1 → ' + currentQRChunks.length + '). After scanning, choose “Add Data”.'
            : 'Scan this QR with “Collect (QR)” → “Scan QR From Image” on another device.';
        downloadBtn.disabled = false;
    } catch (error) {
        console.error('QR generation error:', error);
        titleEl.textContent = 'QR Generation Failed';
        const libraryStatus = typeof QRCode !== 'undefined' ? 'loaded' : 'not loaded';
        qrContainer.innerHTML = `<p style="color:#ff9800; padding:20px; text-align:center;">
            Could not render QR chunk ${currentQRChunkIndex + 1}.<br>
            <strong>Error:</strong> ${error.message}<br>
            <strong>QRCode library:</strong> ${libraryStatus}<br><br>
            Please use Copy CSV, Download CSV, or Native Share instead.
        </p>`;
        instructionsEl.textContent = '';
        downloadBtn.disabled = true;
    }
}

function copyCSV() {
    navigator.clipboard.writeText(window.currentCSV).then(() => {
        showNotification('CSV data copied to clipboard!', 'success');
        closeModal();
    }).catch(() => {
        const textarea = document.getElementById('csvPreview');
        if (textarea) { textarea.select(); document.execCommand('copy'); }
        showNotification('CSV data copied!', 'success');
        closeModal();
    });
}

function downloadCSV() {
    const blob = new Blob([window.currentCSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `team7712_scouting_${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    showNotification('CSV file downloaded!', 'success');
    closeModal();
}

function downloadQR() {
    const hasChunks = Array.isArray(currentQRImages) && currentQRImages.length > 0;
    const qrUrl = hasChunks ? currentQRImages[currentQRChunkIndex] : window.currentQR;
    if (!qrUrl) {
        showNotification('QR not ready yet', 'warning');
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    const totalChunks = hasChunks ? currentQRChunks.length : 1;
    const chunkIndex = hasChunks ? currentQRChunkIndex + 1 : 1;
    const chunkSuffix = totalChunks > 1 ? `_part${String(chunkIndex).padStart(2, '0')}of${String(totalChunks).padStart(2, '0')}` : '';

    const a = document.createElement('a');
    a.href = qrUrl;
    a.download = `team7712_qr_${today}${chunkSuffix}.png`;
    a.click();

    showNotification('QR code image saved!', 'success');
}

function copyImportLink() {
    const url = window.currentImportUrl || buildImportUrl(generateCSV());
    navigator.clipboard.writeText(url).then(() => { showNotification('Import link copied to clipboard!', 'success'); })
        .catch(() => { showNotification('Failed to copy link', 'error'); });
}

function shareNative() {
    const matches = getLocalMatches();
    const shareText = `Team 7712 ACCN-Umoja Scouting Data\n${matches.length} matches\n\n${window.currentCSV}`;
    if (navigator.share) {
        navigator.share({ title: 'Team 7712 Scouting Data', text: shareText })
            .then(() => { showNotification('Data shared!', 'success'); closeModal(); })
            .catch(() => { copyCSV(); });
    } else {
        copyCSV();
    }
}

function closeModal() {
    if (window.currentModal) {
        window.currentModal.remove();
        window.currentModal = null;
        window.currentCSV = null;
        window.currentImportUrl = null;
        window.currentQR = null;
        currentQRChunks = [];
        currentQRImages = [];
        currentQRChunkIndex = 0;
        isModalOpen = false;
        history.replaceState({page: currentPage, modal: null}, '', getPageHash(currentPage));
    }
}

function showInstall() {
    showNotification('Tap Share  Add to Home Screen (iPhone) or Menu  Install App (Android)', 'info');
}

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        event.preventDefault();
        if (isModalOpen) { closeModal(); }
        else if (currentPage !== 'homePage') { navigateBack(); }
    } else if (event.key === 'Backspace' && event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
        event.preventDefault();
        if (isModalOpen) { closeModal(); }
        else if (currentPage !== 'homePage') { navigateBack(); }
    }
});

document.addEventListener('contextmenu', function(event) { event.preventDefault(); });

document.addEventListener('touchstart', function(event) { if (event.touches.length > 1) { event.preventDefault(); } });

document.addEventListener('touchmove', function(event) { if (event.scale !== 1) { event.preventDefault(); } });

// Import handler for /import?csv=... or #import?csv=...
(function handleImportFromUrl() {
    try {
        const path = window.location.pathname;
        const hash = window.location.hash || '';
        let csvText = null;
        if (path === '/import') {
            const params = new URLSearchParams(window.location.search);
            if (params.has('csv')) csvText = params.get('csv');
        } else if (hash.startsWith('#import')) {
            const hashQuery = hash.replace(/^#import\??/, '');
            const params = new URLSearchParams(hashQuery);
            if (params.has('csv')) csvText = params.get('csv');
        }
        if (csvText) {
            showNotification('Importing shared data…', 'info');
            const imported = parseCSVData(csvText);
            const result = mergeImportedMatches(imported);
            showNotification(`Imported ${result.added} new, skipped ${result.skipped}. Total: ${result.total}`, 'success');
            setTimeout(() => { navigateToPage('dataPage'); }, 800);
        }
    } catch (e) {
        console.error('Import handler error', e);
        showNotification('Import failed: invalid CSV in URL', 'error');
    }
})();

// Service worker registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').then(function(reg) {
            console.log('Service Worker registered:', reg.scope);
        }).catch(function(err) {
            console.log('Service Worker registration failed:', err);
        });
    });
}
