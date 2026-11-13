import test, { describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { db, initDb } from '../src/db.js';
import { chainTicketManager } from '../src/engine/ticketing.js';

describe('ChainTicket Anti-Scalping NFT Ticketing Tests', () => {
  before(() => {
    initDb();
    // Test isolation cleanup
    db.exec("DELETE FROM ticket_transfers WHERE token_id > 900;");
    db.exec("DELETE FROM tickets WHERE token_id > 900 OR event_id > 2;");
    db.exec("DELETE FROM events WHERE id > 2;");
  });

  const organizer = '0x1111222233334444555566667777888899990000';
  const fan1 = '0xaaaa1111bbbb2222cccc3333dddd4444eeee5555';
  const fan2 = '0xbbbb2222cccc3333dddd4444eeee5555ffff6666';

  test('Database seeds initial events and passes', () => {
    const events = chainTicketManager.listEvents();
    assert.ok(events.length >= 2, 'Should have at least 2 seeded events');

    const ev1 = chainTicketManager.getEventDetails(1);
    assert.ok(ev1);
    assert.equal(ev1.face_value, 0.15);
    assert.equal(ev1.max_resale_price, 0.18);
    assert.ok(ev1.tickets.length >= 2);
  });

  test('createEvent enforces anti-scalping constraints', () => {
    // Ceiling lower than face value throws
    assert.throws(() => {
      chainTicketManager.createEvent({
        organizer,
        name: 'Invalid Festival',
        venue: 'Stadium',
        faceValue: 0.20,
        maxResalePrice: 0.15,
        maxCapacity: 1000
      });
    }, (err) => err.message.includes('cannot be lower than initial face value'));

    // Valid event creation
    const ev = chainTicketManager.createEvent({
      organizer,
      name: 'CyberDef Global Conclave 2027',
      venue: 'Metropolis Convention Center, Tokyo',
      faceValue: 0.10,
      maxResalePrice: 0.12, // 20% max markup cap
      royaltyBps: 500,
      maxCapacity: 2500
    });

    assert.ok(ev.id);
    assert.equal(ev.name, 'CyberDef Global Conclave 2027');
    assert.equal(ev.face_value, 0.10);
    assert.equal(ev.max_resale_price, 0.12);
  });

  test('mintTicket issues NFT pass with unique gate QR hash', () => {
    const list = chainTicketManager.listEvents();
    const testEv = list.find(e => e.name === 'CyberDef Global Conclave 2027');
    assert.ok(testEv);

    const ticket = chainTicketManager.mintTicket({
      eventId: testEv.id,
      recipient: fan1,
      recipientName: 'Elena Rostova'
    });

    assert.ok(ticket.tokenId);
    assert.equal(ticket.owner, fan1.toLowerCase());
    assert.ok(ticket.qrHash.startsWith('qr_'));
    assert.ok(ticket.txHash.startsWith('0x'));

    const updatedEv = chainTicketManager.getEventDetails(testEv.id);
    assert.equal(updatedEv.total_minted, 1);
  });

  test('resellTicket enforces anti-scalping price ceiling and royalties', () => {
    const list = chainTicketManager.listEvents();
    const testEv = list.find(e => e.name === 'CyberDef Global Conclave 2027');
    const evDetails = chainTicketManager.getEventDetails(testEv.id);
    const mintedTicket = evDetails.tickets[0];

    // Attempting scalping price (0.50 ETH > 0.12 ETH cap) throws
    assert.throws(() => {
      chainTicketManager.resellTicket({
        tokenId: mintedTicket.token_id,
        fromAddress: fan1,
        toAddress: fan2,
        toName: 'Marcus Vance',
        resalePrice: 0.50
      });
    }, (err) => err.message.includes('Anti-scalping violation'));

    // Legitimate secondary sale under price ceiling (0.11 ETH <= 0.12 ETH)
    const resale = chainTicketManager.resellTicket({
      tokenId: mintedTicket.token_id,
      fromAddress: fan1,
      toAddress: fan2,
      toName: 'Marcus Vance',
      resalePrice: 0.11
    });

    assert.equal(resale.newOwner, fan2.toLowerCase());
    assert.equal(resale.resalePrice, 0.11);
    assert.ok(resale.royaltyPaidToOrganizer > 0);
    assert.ok(resale.sellerProceeds > 0);
    assert.ok(resale.newQrHash.startsWith('qr_'));
  });

  test('checkInTicket verifies pass and prevents double entry fraud', () => {
    const list = chainTicketManager.listEvents();
    const testEv = list.find(e => e.name === 'CyberDef Global Conclave 2027');
    const evDetails = chainTicketManager.getEventDetails(testEv.id);
    const ticket = evDetails.tickets[0];

    // Valid check in
    const checkin = chainTicketManager.checkInTicket({
      tokenId: ticket.token_id,
      qrHash: ticket.qr_hash
    });

    assert.equal(checkin.status, 'ADMITTED');
    assert.equal(checkin.tokenId, ticket.token_id);

    // Fraud check: second admission attempt throws
    assert.throws(() => {
      chainTicketManager.checkInTicket({
        tokenId: ticket.token_id,
        qrHash: ticket.qr_hash
      });
    }, (err) => err.message.includes('Fraud warning'));
  });
});
