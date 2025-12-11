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
let navigationHistory = ['homePage'];
let currentPage = 'homePage';
let isModalOpen = false;
let modalHistory = [];

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
    const pageNames = { 'homePage': '#home', 'scoutPage': '#scout', 'dataPage': '#data' };
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
                showNotification(`Imported ${result.added} new, skipped ${result.skipped}. Total: ${result.total}`, 'success');
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
        mobility: formData.get('mobility') || 'No',
        autoCoralL1: parseInt(document.getElementById('autoCoralL1').value || 0),
        autoCoralL2: parseInt(document.getElementById('autoCoralL2').value || 0),
        autoCoralL3: parseInt(document.getElementById('autoCoralL3').value || 0),
        autoCoralL4: parseInt(document.getElementById('autoCoralL4').value || 0),
        autoAlgaeNetted: parseInt(document.getElementById('autoAlgaeNetted').value || 0),
        autoAlgaeProcessor: parseInt(document.getElementById('autoAlgaeProcessor').value || 0),
        teleopCoralL1: parseInt(document.getElementById('teleopCoralL1').value || 0),
        teleopCoralL2: parseInt(document.getElementById('teleopCoralL2').value || 0),
        teleopCoralL3: parseInt(document.getElementById('teleopCoralL3').value || 0),
        teleopCoralL4: parseInt(document.getElementById('teleopCoralL4').value || 0),
        teleopAlgaeNetted: parseInt(document.getElementById('teleopAlgaeNetted').value || 0),
        teleopAlgaeProcessor: parseInt(document.getElementById('teleopAlgaeProcessor').value || 0),
        park: formData.get('park') || 'No',
        climb: formData.get('climb') || 'Yes, Shallow',
        notes: formData.get('notes') || '',
        timestamp: new Date().toISOString(),
        id: Date.now()
    };
    const matches = getLocalMatches();
    matches.push(matchData);
    localStorage.setItem(MATCHES_KEY, JSON.stringify(matches));
    showNotification(`Match ${matchData.matchNumber} saved successfully!`, 'success');
    form.reset();
    resetCounters();
    setTimeout(() => navigateToPage('homePage'), 2000);
}

function incCounter(name) {
    const input = document.getElementById(name);
    const valueEl = document.getElementById(name + 'Value');
    const next = Math.max(0, (parseInt(input.value || '0') + 1));
    input.value = String(next);
    if (valueEl) valueEl.textContent = String(next);
}

function decCounter(name) {
    const input = document.getElementById(name);
    const valueEl = document.getElementById(name + 'Value');
    const next = Math.max(0, (parseInt(input.value || '0') - 1));
    input.value = String(next);
    if (valueEl) valueEl.textContent = String(next);
}

function resetCounters() {
    const names = [
        'autoCoralL1','autoCoralL2','autoCoralL3','autoCoralL4',
        'autoAlgaeNetted','autoAlgaeProcessor',
        'teleopCoralL1','teleopCoralL2','teleopCoralL3','teleopCoralL4',
        'teleopAlgaeNetted','teleopAlgaeProcessor'
    ];
    names.forEach(name => {
        const input = document.getElementById(name);
        const valueEl = document.getElementById(name + 'Value');
        if (input) input.value = '0';
        if (valueEl) valueEl.textContent = '0';
    });
}

function loadData() {
    const matches = getLocalMatches();
    const display = document.getElementById('dataDisplay');
    if (matches.length === 0) {
        display.innerHTML = `
            <div style="text-align: center; padding: 50px; color: #ccc;">
                <div style="font-size: 64px; margin-bottom: 25px;"></div>
                <h3 style="font-size: 24px; margin-bottom: 15px; color: #DAA520;">No matches recorded yet</h3>
                <p style="font-size: 18px; margin-bottom: 25px;">Start by scouting your first match!</p>
                <button class="btn success" onclick="navigateToPage('scoutPage')" style="width: auto; padding: 20px 40px;">Scout First Match</button>
            </div>
        `;
        return;
    }
    let html = `<div style="text-align: center; margin-bottom: 25px;">
        <h3 style="color: #DAA520; font-size: 28px;">${matches.length} Match${matches.length !== 1 ? 'es' : ''} Recorded</h3>
    </div>`;
    matches.sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0)).forEach(match => {
        const totalAutoCoral = (match.autoCoralL1 || 0) + (match.autoCoralL2 || 0) + (match.autoCoralL3 || 0) + (match.autoCoralL4 || 0);
        const totalTeleopCoral = (match.teleopCoralL1 || 0) + (match.teleopCoralL2 || 0) + (match.teleopCoralL3 || 0) + (match.teleopCoralL4 || 0);
        html += `
            <div class="match-card">
                <div class="match-header">Match ${match.matchNumber} - Team ${match.teamNumber}</div>
                <div style="margin: 12px 0; font-size: 16px;"><strong>Alliance:</strong> ${match.alliance} | <strong>Scout:</strong> ${match.scoutName}</div>
                ${match.location ? `<div style="margin: 12px 0; font-size: 16px;"><strong>Location:</strong> ${match.location}</div>` : ''}
                <div style="margin: 12px 0; font-size: 16px;"><strong>Auto:</strong> Mobility=${match.mobility}, ${totalAutoCoral} Coral, ${match.autoAlgaeNetted || 0} Algae Netted</div>
                <div style="margin: 12px 0; font-size: 16px;"><strong>Teleop:</strong> ${totalTeleopCoral} Coral, ${match.teleopAlgaeNetted || 0} Algae Netted</div>
                <div style="margin: 12px 0; font-size: 16px;"><strong>Endgame:</strong> Park=${match.park}, Climb=${match.climb}</div>
                ${match.notes ? `<div style="margin: 12px 0; font-size: 16px;"><strong>Notes:</strong> ${match.notes}</div>` : ''}
                <div style="margin-top: 15px; font-size: 14px; color: #aaa;">Recorded: ${new Date(match.timestamp).toLocaleString()}</div>
            </div>
        `;
    });
    display.innerHTML = html;
}

function generateCSV() {
    const matches = getLocalMatches();
    const headers = ['Match','Team','Alliance','Scout','Mobility','AutoCoralL1','AutoCoralL2','AutoCoralL3','AutoCoralL4','AutoAlgaeNetted','AutoAlgaeProcessor','TeleopCoralL1','TeleopCoralL2','TeleopCoralL3','TeleopCoralL4','TeleopAlgaeNetted','TeleopAlgaeProcessor','Park','Climb','Notes','Timestamp'];
    const rows = matches.map(m => {
        const safeNotes = (m.notes || '').replace(/"/g, '""');
        return [
            m.matchNumber,
            m.teamNumber,
            m.alliance,
            m.scoutName,
            m.mobility,
            m.autoCoralL1,
            m.autoCoralL2,
            m.autoCoralL3,
            m.autoCoralL4,
            m.autoAlgaeNetted,
            m.autoAlgaeProcessor,
            m.teleopCoralL1,
            m.teleopCoralL2,
            m.teleopCoralL3,
            m.teleopCoralL4,
            m.teleopAlgaeNetted,
            m.teleopAlgaeProcessor,
            m.park,
            m.climb,
            `"${safeNotes}"`,
            m.timestamp
        ].join(',');
    });
    return [headers.join(','), ...rows].join('\n');
}

async function generateQR(text, size = 300) {
    return new Promise((resolve, reject) => {
        try {
            if (typeof QRCode === 'undefined') {
                reject(new Error('QRCode library not loaded'));
                return;
            }
            
            // Local, offline QR generation using vendored QRCode library
            const container = document.createElement('div');
            container.style.display = 'none';
            document.body.appendChild(container);
            
            try {
                const qr = new QRCode(container, {
                    text,
                    width: size,
                    height: size,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.L,  // Low error correction for max data
                });
                
                // Wait for QR to render
                setTimeout(() => {
                    try {
                        const canvas = container.querySelector('canvas');
                        if (canvas && canvas.toDataURL) {
                            const dataUrl = canvas.toDataURL('image/png');
                            if (document.body.contains(container)) {
                                document.body.removeChild(container);
                            }
                            resolve(dataUrl);
                            return;
                        }
                        const imgEl = container.querySelector('img');
                        if (imgEl && imgEl.src) {
                            const src = imgEl.src;
                            if (document.body.contains(container)) {
                                document.body.removeChild(container);
                            }
                            resolve(src);
                            return;
                        }
                        if (document.body.contains(container)) {
                            document.body.removeChild(container);
                        }
                        reject(new Error('QR generation failed - no canvas or img element found'));
                    } catch (e) {
                        if (document.body.contains(container)) {
                            document.body.removeChild(container);
                        }
                        reject(e);
                    }
                }, 300);
            } catch (e) {
                if (document.body.contains(container)) {
                    document.body.removeChild(container);
                }
                reject(e);
            }
        } catch (e) {
            reject(e);
        }
    });
}

function prefixForQR(csvText) { return `TEAM7712CSV\n${csvText}`; }

function encodeMatchesForQR(matches) {
    // Compact format: T7712| followed by pipe-delimited match data
    // Format per match: matchNum|teamNum|alliance|scout|mobility|autoL1|autoL2|autoL3|autoL4|autoNetted|autoProc|teleopL1|teleopL2|teleopL3|teleopL4|teleopNetted|teleopProc|park|climb|notes
    const encoded = matches.map(m => {
        return [
            m.matchNumber || 0,
            m.teamNumber || 0,
            (m.alliance || 'red')[0], // r or b
            m.scoutName || '',
            (m.mobility === 'Yes' ? 'Y' : 'N'),
            m.autoCoralL1 || 0,
            m.autoCoralL2 || 0,
            m.autoCoralL3 || 0,
            m.autoCoralL4 || 0,
            m.autoAlgaeNetted || 0,
            m.autoAlgaeProcessor || 0,
            m.teleopCoralL1 || 0,
            m.teleopCoralL2 || 0,
            m.teleopCoralL3 || 0,
            m.teleopCoralL4 || 0,
            m.teleopAlgaeNetted || 0,
            m.teleopAlgaeProcessor || 0,
            (m.park === 'Yes' ? 'Y' : 'N'),
            (m.climb || 'No')[0] === 'Y' ? (m.climb.includes('Deep') ? 'D' : 'S') : 'N',
            (m.notes || '').replace(/\|/g, ';').substring(0, 100) // limit notes, replace pipes
        ].join('|');
    }).join('\n');
    return 'T7712|' + encoded;
}

function decodeMatchesFromQR(qrText) {
    if (!qrText.startsWith('T7712|')) return null;
    const lines = qrText.substring(6).split('\n');
    return lines.map(line => {
        const parts = line.split('|');
        if (parts.length < 19) return null;
        return {
            matchNumber: parseInt(parts[0]) || 0,
            teamNumber: parseInt(parts[1]) || 0,
            alliance: parts[2] === 'r' ? 'red' : 'blue',
            scoutName: parts[3] || '',
            mobility: parts[4] === 'Y' ? 'Yes' : 'No',
            autoCoralL1: parseInt(parts[5]) || 0,
            autoCoralL2: parseInt(parts[6]) || 0,
            autoCoralL3: parseInt(parts[7]) || 0,
            autoCoralL4: parseInt(parts[8]) || 0,
            autoAlgaeNetted: parseInt(parts[9]) || 0,
            autoAlgaeProcessor: parseInt(parts[10]) || 0,
            teleopCoralL1: parseInt(parts[11]) || 0,
            teleopCoralL2: parseInt(parts[12]) || 0,
            teleopCoralL3: parseInt(parts[13]) || 0,
            teleopCoralL4: parseInt(parts[14]) || 0,
            teleopAlgaeNetted: parseInt(parts[15]) || 0,
            teleopAlgaeProcessor: parseInt(parts[16]) || 0,
            park: parts[17] === 'Y' ? 'Yes' : 'No',
            climb: parts[18] === 'D' ? 'Yes, Deep' : (parts[18] === 'S' ? 'Yes, Shallow' : 'No'),
            notes: parts[19] || '',
            timestamp: new Date().toISOString(),
            id: Date.now() + Math.random()
        };
    }).filter(m => m !== null);
}

function buildImportUrl(csvText) {
    const base = window.location.origin;
    return `${base}/#import?csv=${encodeURIComponent(csvText)}`;
}

function clearAllData() {
    localStorage.removeItem(MATCHES_KEY);
    showNotification('All scouting data has been cleared', 'success');
    closeModal();
    if (currentPage === 'dataPage') { loadData(); }
}

function openExportModal() {
    const matches = getLocalMatches();
    if (matches.length === 0) { showNotification('No data to export yet', 'warning'); return; }
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
    const existingKeys = new Set(currentMatches.map(match => `${match.matchNumber}-${match.teamNumber}-${(match.scoutName || '').toLowerCase()}`));
    let added = 0; let skipped = 0;
    importedMatches.forEach(match => {
        const key = `${match.matchNumber}-${match.teamNumber}-${(match.scoutName || '').toLowerCase()}`;
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
    const compactData = encodeMatchesForQR(matches);
    
    closeModal();
    
    setTimeout(async () => {
        isModalOpen = true;
        const modal = document.createElement('div');
        modal.className = 'share-modal';
        modal.innerHTML = `
            <div class="share-content">
                <h2 style="color: #DAA520; font-size: 28px;">Offline QR Code</h2>
                <p style="font-size: 18px;"><strong>${matches.length} match${matches.length !== 1 ? 'es' : ''}</strong> (${compactData.length} characters)</p>
                <div class="qr-container">
                    <h3 style="color: #DAA520; font-size: 22px;">Generating QR Code...</h3>
                    <div id="qrcode" style="min-height: 300px; display: flex; align-items: center; justify-content: center;">
                        <div style="color: #DAA520; font-size: 18px;">⏳ Please wait...</div>
                    </div>
                    <p id="qrInstructions" style="margin-top: 20px; color: #ccc; font-size: 14px;"></p>
                </div>
                <div class="share-buttons">
                    <button class="share-btn download" onclick="downloadQR()" disabled>Save QR Code</button>
                    <button class="share-btn close" onclick="closeModal()">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        window.currentModal = modal;
        modal.onclick = (e) => { if (e.target === modal) closeModal(); };
        
        try {
            console.log('Generating QR for', compactData.length, 'characters');
            // Generate QR with compact encoded data - use larger size for more capacity
            const qrUrl = await generateQR(compactData, 500);
            window.currentQR = qrUrl;
            
            const qrContainer = modal.querySelector('#qrcode');
            const titleEl = modal.querySelector('.qr-container h3');
            const instructionsEl = modal.querySelector('#qrInstructions');
            
            if (qrContainer && titleEl) {
                titleEl.textContent = 'Scan to Import Data (Offline)';
                qrContainer.innerHTML = `<img src="${qrUrl}" alt="QR Code" style="max-width: 100%; max-height: 500px; border-radius: 12px;">`;
                instructionsEl.textContent = 'Scan this QR code with another device using the "Collect (QR)" → "Scan QR From Image" button. No internet needed!';
                const downloadBtn = modal.querySelector('.share-btn.download');
                if (downloadBtn) downloadBtn.disabled = false;
            }
            console.log('QR generated successfully');
        } catch (error) {
            console.error('QR generation error:', error);
            const qrContainer = modal.querySelector('#qrcode');
            const titleEl = modal.querySelector('.qr-container h3');
            const instructionsEl = modal.querySelector('#qrInstructions');
            
            if (qrContainer && titleEl) {
                const qrStatus = typeof QRCode !== 'undefined' ? 'Library loaded' : 'Library NOT loaded';
                titleEl.textContent = 'Cannot Generate QR Code';
                qrContainer.innerHTML = `<p style="color: #ff9800; padding: 20px; text-align: center;">
                    <strong>Status:</strong> ${error.message}<br>
                    <strong>Library:</strong> ${qrStatus}<br>
                    <strong>Data size:</strong> ${compactData.length} chars (limit: 2,900)<br><br>
                    <strong>Offline Sharing Options:</strong><br>
                    ✓ Download CSV and transfer via USB/SD card<br>
                    ✓ Use "Copy CSV" and paste into another device<br>
                    ✓ Use "Native Share" to send via Bluetooth/AirDrop
                </p>`;
                instructionsEl.textContent = '';
            }
            showNotification('Data too large for QR - use Download CSV or Copy CSV', 'warning');
        }
    }, 100);
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
    const a = document.createElement('a');
    a.href = window.currentQR; a.download = `team7712_qr_${new Date().toISOString().split('T')[0]}.png`; a.click();
    showNotification('QR Code saved!', 'success');
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
