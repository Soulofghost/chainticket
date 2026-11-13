import { db } from '../db.js';
import crypto from 'node:crypto';

export class ChainTicketManager {
  listEvents() {
    return db.prepare('SELECT * FROM events ORDER BY event_timestamp ASC;').all();
  }

  getEventDetails(id) {
    const event = db.prepare('SELECT * FROM events WHERE id = ?;').get(id);
    if (!event) return null;

    const tickets = db.prepare('SELECT * FROM tickets WHERE event_id = ? ORDER BY token_id ASC;').all(id);
    return {
      ...event,
      tickets
    };
  }

  createEvent({ organizer, name, venue, eventTimestamp, faceValue, maxResalePrice, royaltyBps = 500, maxCapacity = 1000 }) {
    if (!name || !venue || faceValue <= 0 || maxCapacity <= 0) {
      throw new Error('Invalid event parameters: name, venue, faceValue > 0, maxCapacity > 0 required');
    }
    if (maxResalePrice < faceValue) {
      throw new Error('Anti-scalping ceiling cannot be lower than initial face value');
    }

    const cleanOrganizer = (organizer || '0x0000000000000000000000000000000000000000').toLowerCase();
    const maxIdRow = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 as nextId FROM events;').get();
    const eventId = maxIdRow.nextId;
    const timeIso = eventTimestamp ? new Date(eventTimestamp).toISOString() : new Date(Date.now() + 86400000 * 30).toISOString();

    db.prepare(`
      INSERT INTO events (id, organizer, name, venue, event_timestamp, face_value, max_resale_price, royalty_bps, total_minted, max_capacity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?);
    `).run(eventId, cleanOrganizer, name, venue, timeIso, faceValue, maxResalePrice, royaltyBps, maxCapacity);

    return this.getEventDetails(eventId);
  }

  mintTicket({ eventId, recipient, recipientName = 'Attendee' }) {
    const ev = db.prepare('SELECT * FROM events WHERE id = ?;').get(eventId);
    if (!ev) throw new Error(`Event #${eventId} not found`);
    if (ev.total_minted >= ev.max_capacity) {
      throw new Error('Event capacity reached: sold out');
    }

    const cleanRecipient = recipient.toLowerCase();
    const maxTokenRow = db.prepare('SELECT COALESCE(MAX(token_id), 100) + 1 as nextToken FROM tickets;').get();
    const tokenId = maxTokenRow.nextToken;
    const qrHash = 'qr_' + crypto.randomBytes(16).toString('hex');

    db.prepare(`
      INSERT INTO tickets (token_id, event_id, current_owner, owner_name, purchase_price, is_redeemed, qr_hash)
      VALUES (?, ?, ?, ?, ?, 0, ?);
    `).run(tokenId, eventId, cleanRecipient, recipientName, ev.face_value, qrHash);

    db.prepare('UPDATE events SET total_minted = total_minted + 1 WHERE id = ?;').run(eventId);

    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    return {
      tokenId,
      eventId,
      eventName: ev.name,
      owner: cleanRecipient,
      ownerName: recipientName,
      purchasePrice: ev.face_value,
      qrHash,
      txHash
    };
  }

  resellTicket({ tokenId, fromAddress, toAddress, toName = 'New Holder', resalePrice }) {
    const ticket = db.prepare('SELECT * FROM tickets WHERE token_id = ?;').get(tokenId);
    if (!ticket) throw new Error(`Ticket #${tokenId} not found`);

    if (ticket.current_owner.toLowerCase() !== fromAddress.toLowerCase()) {
      throw new Error('Unauthorized: only current ticket holder can transfer or resell ticket');
    }

    if (ticket.is_redeemed) {
      throw new Error('Cannot resell ticket: pass has already been redeemed at event admission');
    }

    const ev = db.prepare('SELECT * FROM events WHERE id = ?;').get(ticket.event_id);
    if (resalePrice > ev.max_resale_price) {
      throw new Error(`Anti-scalping violation: requested price ${resalePrice} ETH exceeds maximum allowed ceiling of ${ev.max_resale_price} ETH`);
    }

    const royalty = (resalePrice * ev.royalty_bps) / 10000;
    const sellerProceeds = resalePrice - royalty;
    const cleanTo = toAddress.toLowerCase();
    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    const transferId = 'txf-' + crypto.randomBytes(6).toString('hex');

    db.prepare(`
      INSERT INTO ticket_transfers (id, token_id, from_address, to_address, price, royalty_paid, tx_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `).run(transferId, tokenId, ticket.current_owner, cleanTo, resalePrice, royalty, txHash);

    // Update ticket owner and generate new gate QR hash for security
    const newQrHash = 'qr_' + crypto.randomBytes(16).toString('hex');
    db.prepare(`
      UPDATE tickets SET current_owner = ?, owner_name = ?, purchase_price = ?, qr_hash = ?
      WHERE token_id = ?;
    `).run(cleanTo, toName, resalePrice, newQrHash, tokenId);

    return {
      tokenId,
      eventId: ev.id,
      previousOwner: ticket.current_owner,
      newOwner: cleanTo,
      resalePrice,
      royaltyPaidToOrganizer: parseFloat(royalty.toFixed(4)),
      sellerProceeds: parseFloat(sellerProceeds.toFixed(4)),
      newQrHash,
      txHash
    };
  }

  checkInTicket({ tokenId, qrHash }) {
    const ticket = db.prepare('SELECT * FROM tickets WHERE token_id = ?;').get(tokenId);
    if (!ticket) throw new Error(`Ticket #${tokenId} does not exist`);

    if (ticket.is_redeemed) {
      throw new Error(`Fraud warning: Ticket #${tokenId} was already checked in on ${new Date(ticket.redemption_timestamp).toLocaleString()}`);
    }

    if (qrHash && ticket.qr_hash !== qrHash) {
      throw new Error('Gate verification rejected: invalid or forged QR security token');
    }

    const nowIso = new Date().toISOString();
    db.prepare('UPDATE tickets SET is_redeemed = 1, redemption_timestamp = ? WHERE token_id = ?;').run(nowIso, tokenId);

    const ev = db.prepare('SELECT name, venue FROM events WHERE id = ?;').get(ticket.event_id);

    return {
      tokenId,
      status: 'ADMITTED',
      eventName: ev ? ev.name : 'Event',
      venue: ev ? ev.venue : 'Main Gate',
      attendee: ticket.owner_name,
      holderAddress: ticket.current_owner,
      timestamp: nowIso
    };
  }

  listUserTickets(address) {
    const clean = address.toLowerCase();
    return db.prepare(`
      SELECT t.*, e.name as event_name, e.venue, e.event_timestamp, e.max_resale_price
      FROM tickets t
      JOIN events e ON t.event_id = e.id
      WHERE t.current_owner = ?
      ORDER BY t.created_at DESC;
    `).all(clean);
  }

  getPlatformStats() {
    const totalEvents = db.prepare('SELECT COUNT(*) as c FROM events;').get().c;
    const totalTickets = db.prepare('SELECT COUNT(*) as c FROM tickets;').get().c;
    const redeemedCount = db.prepare('SELECT COUNT(*) as c FROM tickets WHERE is_redeemed = 1;').get().c;
    const totalResales = db.prepare('SELECT COUNT(*) as c, COALESCE(SUM(royalty_paid), 0) as r FROM ticket_transfers;').get();

    return {
      totalEvents,
      totalTicketsMinted: totalTickets,
      gateAdmissions: redeemedCount,
      secondaryResales: totalResales.c,
      royaltiesDisbursedEth: parseFloat(totalResales.r.toFixed(4)),
      antiScalpingRules: 'Active (Hard Smart Contract Cap)'
    };
  }
}

export const chainTicketManager = new ChainTicketManager();
