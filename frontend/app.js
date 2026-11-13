// ChainTicket Anti-Scalping NFT Ticketing Frontend
const API_BASE = window.location.origin.includes('http') && !window.location.origin.startsWith('file:')
  ? window.location.origin
  : 'http://localhost:4025';

let simulatedWallet = '0x2222222222222222222222222222222222222222';
let allEvents = [];
let myTickets = [];

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupModals();
  setupScanner();
  loadStats();
  loadEvents();
  loadMyTickets();
});

function setupNavigation() {
  const tabs = document.querySelectorAll('.view-tab');
  const sections = document.querySelectorAll('.view-section');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));

      tab.classList.add('active');
      const view = tab.dataset.view;
      if (view === 'events') {
        document.getElementById('viewEvents').classList.add('active');
        loadEvents();
      } else if (view === 'my-tickets') {
        document.getElementById('viewMyTickets').classList.add('active');
        loadMyTickets();
      } else if (view === 'gate') {
        document.getElementById('viewGate').classList.add('active');
      }
    });
  });
}

function setupModals() {
  const createModal = document.getElementById('createEventModal');
  const resellModal = document.getElementById('resellModal');

  document.getElementById('openCreateEventModal').addEventListener('click', () => {
    createModal.classList.add('active');
  });

  document.getElementById('closeCreateBtn').addEventListener('click', () => {
    createModal.classList.remove('active');
  });
  document.getElementById('cancelCreateBtn').addEventListener('click', () => {
    createModal.classList.remove('active');
  });

  document.getElementById('closeResellBtn').addEventListener('click', () => {
    resellModal.classList.remove('active');
  });
  document.getElementById('cancelResellBtn').addEventListener('click', () => {
    resellModal.classList.remove('active');
  });

  document.getElementById('createEventForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      organizer: simulatedWallet,
      name: document.getElementById('evName').value.trim(),
      venue: document.getElementById('evVenue').value.trim(),
      faceValue: parseFloat(document.getElementById('evFaceValue').value),
      maxResalePrice: parseFloat(document.getElementById('evMaxResale').value),
      royaltyBps: parseInt(document.getElementById('evRoyalty').value, 10) * 100,
      maxCapacity: parseInt(document.getElementById('evCapacity').value, 10)
    };

    try {
      const res = await fetch(`${API_BASE}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to deploy event');
        return;
      }
      createModal.classList.remove('active');
      document.getElementById('createEventForm').reset();
      loadEvents();
      loadStats();
    } catch (err) {
      alert('Error creating event: ' + err.message);
    }
  });

  document.getElementById('resellForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tokenId = document.getElementById('resellTokenId').value;
    const toAddress = document.getElementById('resellRecipient').value.trim();
    const toName = document.getElementById('resellName').value.trim();
    const resalePrice = parseFloat(document.getElementById('resellPrice').value);

    try {
      const res = await fetch(`${API_BASE}/api/tickets/${tokenId}/resell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAddress: simulatedWallet,
          toAddress,
          toName,
          resalePrice
        })
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Resale rejected');
        return;
      }
      const data = await res.json();
      alert(`Pass #${tokenId} resold to ${toName}! Royalty paid: ${data.royaltyPaidToOrganizer} ETH. Proceeds: ${data.sellerProceeds} ETH.`);
      resellModal.classList.remove('active');
      loadMyTickets();
      loadStats();
    } catch (err) {
      alert('Error processing resale: ' + err.message);
    }
  });
}

function setupScanner() {
  document.getElementById('scannerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tokenId = parseInt(document.getElementById('scanTokenId').value, 10);
    const qrHash = document.getElementById('scanQrHash').value.trim();
    const resultBox = document.getElementById('scanResult');

    try {
      const res = await fetch(`${API_BASE}/api/tickets/${tokenId}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrHash: qrHash || null })
      });
      const data = await res.json();

      if (!res.ok) {
        resultBox.className = 'scan-result-box error';
        resultBox.innerHTML = `<strong>ACCESS DENIED:</strong> ${escapeHtml(data.error || 'Verification failed')}`;
        return;
      }

      resultBox.className = 'scan-result-box admitted';
      resultBox.innerHTML = `
        <strong>✅ ADMISSION GRANTED:</strong> Pass #${data.tokenId} Verified!<br>
        Attendee: <strong>${escapeHtml(data.attendee)}</strong><br>
        Event: ${escapeHtml(data.eventName)} (${escapeHtml(data.venue)})<br>
        Admitted At: ${new Date(data.timestamp).toLocaleTimeString()}
      `;
      loadStats();
      loadMyTickets();
    } catch (err) {
      resultBox.className = 'scan-result-box error';
      resultBox.innerHTML = `<strong>SYSTEM ERROR:</strong> ${escapeHtml(err.message)}`;
    }
  });
}

async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    if (!res.ok) throw new Error('API status ' + res.status);
    const data = await res.json();
    document.getElementById('gateAdmissions').textContent = `${data.gateAdmissions} Check-ins`;
    document.getElementById('royaltiesPaid').textContent = `${data.royaltiesDisbursedEth} ETH`;
  } catch (err) {
    // Keep defaults
  }
}

async function loadEvents() {
  const grid = document.getElementById('eventsGrid');
  try {
    const res = await fetch(`${API_BASE}/api/events`);
    if (!res.ok) throw new Error('API status ' + res.status);
    const data = await res.json();
    allEvents = data.events || [];
    renderEvents(allEvents);
  } catch (err) {
    allEvents = [
      {
        id: 1,
        name: 'ETHDenver Global Web3 Summit 2027',
        venue: 'National Western Complex, Denver CO',
        event_timestamp: '2027-02-28T18:00:00Z',
        face_value: 0.15,
        max_resale_price: 0.18,
        total_minted: 2,
        max_capacity: 5000
      },
      {
        id: 2,
        name: 'Zero-Knowledge Proofs Applied Research Symposium',
        venue: 'ETH Zurich Auditorium, Switzerland',
        event_timestamp: '2027-04-15T09:00:00Z',
        face_value: 0.08,
        max_resale_price: 0.09,
        total_minted: 1,
        max_capacity: 800
      }
    ];
    renderEvents(allEvents);
  }
}

function renderEvents(events) {
  const grid = document.getElementById('eventsGrid');
  if (events.length === 0) {
    grid.innerHTML = '<div class="loading-state">No scheduled events found.</div>';
    return;
  }

  grid.innerHTML = events.map(e => {
    const dateStr = new Date(e.event_timestamp).toLocaleDateString();

    return `
      <div class="event-card">
        <h3 class="event-title">${escapeHtml(e.name)}</h3>
        <p class="event-venue">📍 ${escapeHtml(e.venue)} &bull; ${dateStr}</p>

        <div class="pricing-box">
          <div class="price-item">
            <span>FACE VALUE</span>
            <span class="price-val">${e.face_value.toFixed(2)} ETH</span>
          </div>
          <div class="price-item">
            <span>MAX RESALE CAP</span>
            <span class="price-val price-cap">${e.max_resale_price.toFixed(2)} ETH</span>
          </div>
          <div class="price-item">
            <span>CAPACITY</span>
            <span style="font-weight: 700;">${e.total_minted} / ${e.max_capacity}</span>
          </div>
        </div>

        <button class="btn btn-primary" onclick="mintPassAction(${e.id})">Mint NFT Ticket Pass</button>
      </div>
    `;
  }).join('');
}

window.mintPassAction = async function(eventId) {
  const name = prompt('Enter attendee badge name:', 'Alex Vance');
  if (!name) return;

  try {
    const res = await fetch(`${API_BASE}/api/events/${eventId}/mint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: simulatedWallet,
        recipientName: name
      })
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Mint failed');
      return;
    }
    const data = await res.json();
    alert(`NFT Pass #${data.tokenId} successfully minted! Saved to wallet.`);
    loadEvents();
    loadMyTickets();
    loadStats();
  } catch (err) {
    alert('Error minting pass: ' + err.message);
  }
};

async function loadMyTickets() {
  const grid = document.getElementById('myTicketsGrid');
  try {
    const res = await fetch(`${API_BASE}/api/users/${simulatedWallet}/tickets`);
    if (!res.ok) throw new Error('API status ' + res.status);
    const data = await res.json();
    myTickets = data.tickets || [];
    renderMyTickets(myTickets);
  } catch (err) {
    myTickets = [
      {
        token_id: 101,
        event_id: 1,
        event_name: 'ETHDenver Global Web3 Summit 2027',
        venue: 'National Western Complex, Denver CO',
        purchase_price: 0.15,
        max_resale_price: 0.18,
        is_redeemed: 0,
        qr_hash: 'qr_proof_88a9c011e2f3a4b5'
      }
    ];
    renderMyTickets(myTickets);
  }
}

function renderMyTickets(tickets) {
  const grid = document.getElementById('myTicketsGrid');
  if (tickets.length === 0) {
    grid.innerHTML = '<div class="loading-state">No tickets in your connected wallet. Mint one from the events catalog!</div>';
    return;
  }

  grid.innerHTML = tickets.map(t => {
    const isUsed = Boolean(t.is_redeemed);
    const badge = isUsed
      ? '<span style="color: var(--text-muted); font-family: var(--font-mono); font-size: 0.75rem;">USED AT GATE</span>'
      : '<span style="color: var(--accent-emerald); font-family: var(--font-mono); font-size: 0.75rem;">ACTIVE & VALID</span>';

    return `
      <div class="ticket-pass-card">
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
          <span style="font-family: var(--font-mono); font-weight: 700; color: var(--primary);">TOKEN #${t.token_id}</span>
          ${badge}
        </div>
        <h4 style="font-size: 1.1rem; margin-bottom: 0.25rem;">${escapeHtml(t.event_name)}</h4>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">${escapeHtml(t.venue)}</p>

        <div style="background: var(--bg-surface); padding: 0.75rem; border-radius: 8px; margin-bottom: 1.25rem; font-family: var(--font-mono); font-size: 0.8rem;">
          <div style="color: var(--text-muted); font-size: 0.7rem;">VERIFIABLE GATE HASH:</div>
          <div style="color: var(--primary); word-break: break-all;">${escapeHtml(t.qr_hash)}</div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto;">
          <span style="font-family: var(--font-mono); font-size: 0.85rem;">Price: <strong>${t.purchase_price} ETH</strong></span>
          ${!isUsed ? `
            <button class="btn btn-secondary btn-sm" onclick="openResellModal(${t.token_id}, ${t.max_resale_price})">Resell Pass</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

window.openResellModal = function(tokenId, maxResalePrice) {
  document.getElementById('resellTokenId').value = tokenId;
  document.getElementById('resellCapHint').textContent = `Anti-scalping hard price ceiling: ${maxResalePrice} ETH`;
  document.getElementById('resellPrice').max = maxResalePrice;
  document.getElementById('resellPrice').value = maxResalePrice;
  document.getElementById('resellModal').classList.add('active');
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
