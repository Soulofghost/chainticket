import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '../data');
mkdirSync(DATA_DIR, { recursive: true });

const dbPath = process.env.CHAINTICKET_DB || join(DATA_DIR, 'chainticket.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY,
      organizer TEXT NOT NULL,
      name TEXT NOT NULL,
      venue TEXT NOT NULL,
      event_timestamp TEXT NOT NULL,
      face_value REAL NOT NULL,
      max_resale_price REAL NOT NULL,
      royalty_bps INTEGER NOT NULL DEFAULT 500,
      total_minted INTEGER NOT NULL DEFAULT 0,
      max_capacity INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tickets (
      token_id INTEGER PRIMARY KEY,
      event_id INTEGER NOT NULL,
      current_owner TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      purchase_price REAL NOT NULL,
      is_redeemed INTEGER NOT NULL DEFAULT 0,
      qr_hash TEXT NOT NULL,
      redemption_timestamp TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ticket_transfers (
      id TEXT PRIMARY KEY,
      token_id INTEGER NOT NULL,
      from_address TEXT NOT NULL,
      to_address TEXT NOT NULL,
      price REAL NOT NULL,
      royalty_paid REAL NOT NULL,
      tx_hash TEXT NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (token_id) REFERENCES tickets(token_id) ON DELETE CASCADE
    );
  `);

  const countRow = db.prepare('SELECT COUNT(*) as c FROM events;').get();
  if (countRow.c === 0) {
    seedInitialData();
  }
}

function seedInitialData() {
  const seedEvents = [
    {
      id: 1,
      organizer: '0x1111222233334444555566667777888899990000',
      name: 'ETHDenver Global Web3 Summit 2027',
      venue: 'National Western Complex, Denver CO',
      event_timestamp: new Date(Date.now() + 86400000 * 45).toISOString(),
      face_value: 0.15,
      max_resale_price: 0.18, // Max 120% of face value
      royalty_bps: 500,
      total_minted: 2,
      max_capacity: 5000
    },
    {
      id: 2,
      organizer: '0x9999888877776666555544443333222211110000',
      name: 'Zero-Knowledge Proofs Applied Research Symposium',
      venue: 'ETH Zurich Auditorium, Switzerland',
      event_timestamp: new Date(Date.now() + 86400000 * 20).toISOString(),
      face_value: 0.08,
      max_resale_price: 0.09,
      royalty_bps: 250,
      total_minted: 1,
      max_capacity: 800
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO events (id, organizer, name, venue, event_timestamp, face_value, max_resale_price, royalty_bps, total_minted, max_capacity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  for (const ev of seedEvents) {
    stmt.run(ev.id, ev.organizer, ev.name, ev.venue, ev.event_timestamp, ev.face_value, ev.max_resale_price, ev.royalty_bps, ev.total_minted, ev.max_capacity);
  }

  // Seed sample tickets
  const tStmt = db.prepare(`
    INSERT INTO tickets (token_id, event_id, current_owner, owner_name, purchase_price, is_redeemed, qr_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?);
  `);
  tStmt.run(101, 1, '0x2222222222222222222222222222222222222222', 'Alexander Wright', 0.15, 0, 'qr_proof_88a9c011e2f3a4b5');
  tStmt.run(102, 1, '0x3333333333333333333333333333333333333333', 'Ksenia Petrova', 0.15, 0, 'qr_proof_77d1b22e3f4a5c6d');
  tStmt.run(201, 2, '0x4444444444444444444444444444444444444444', 'Dr. Aris Thorne', 0.08, 1, 'qr_proof_55f2c33a4b5d6e7f');
}

initDb();
