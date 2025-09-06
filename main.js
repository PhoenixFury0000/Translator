import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  makeWASocket
} from 'baileys';
import P from 'pino';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import translate from '@vitalets/google-translate-api';
import { Boom } from '@hapi/boom';
import { fileURLToPath } from 'url';
import { SessionCode } from './session.js';
import config from './config.js';
import http from 'http';
import moment from 'moment-timezone';
import fetch from 'node-fetch';
import { Command } from './commands/index.js';
import qrcode from 'qrcode-terminal';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function serialize(sock, m) {
  const type = Object.keys(m.message || {})[0] || 'conversation';
  const body =
    m.message?.conversation ||
    m.message?.extendedTextMessage?.text ||
    m.message?.[type]?.text ||
    m.message?.[type]?.caption ||
    '';
  const from = m.key?.remoteJid;
  const sender = m.key?.participant || from;
  const isGroup = typeof from === 'string' && from.endsWith('@g.us');
  return {
    id: m.key?.id,
    from,
    sender,
    body,
    isGroup,
    reply: (text) => sock.sendMessage(from, { text }, { quoted: m })
  };
}

async function tr_txt(text, to = 'en') {
  try {
    const res = await axios.get(
      `https://api.naxordeve.qzz.io/tools/translate`,
      { params: { text, to } }
    );
    if (res.data?.ok) return res.data.result || res.data.text;
  } catch {}
  const result = await translate(text, { to });
  return result.text;
}

function getClosestTimezone(input) {
  const zones = moment.tz.names();
  let closest = null;
  let minDistance = Infinity;
  function levenshtein(a, b) {
    const m = [];
    for (let i = 0; i <= b.length; i++) m[i] = [i];
    for (let j = 0; j <= a.length; j++) m[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        m[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
          ? m[i - 1][j - 1]
          : Math.min(m[i - 1][j - 1] + 1, Math.min(m[i][j - 1] + 1, m[i - 1][j] + 1));
      }
    }
    return m[b.length][a.length];
  }
  for (const zone of zones) {
    const dist = levenshtein(String(input).toLowerCase(), zone.toLowerCase());
    if (dist < minDistance) {
      minDistance = dist;
      closest = zone;
    }
  }
  return closest;
}

async function Phoenix() {
  const sessionDir = path.join(__dirname, 'Session');
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir);
  const useQR = !config.SESSION_ID;
  if (!useQR) {
    await SessionCode(config.SESSION_ID, sessionDir);
  }
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();
  const game = new Map(); // quiz sessions

  const sock = makeWASocket({
    logger: P({ level: 'silent' }),
    // Baileys deprecates built-in QR printing; handle in connection.update
    printQRInTerminal: false,
    auth: state,
    version
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages?.[0];
    if (!m?.message || m.key?.remoteJid === 'status@broadcast') return;
    const msg = serialize(sock, m);

    // Quiz game progression if active
    if (game.has(msg.from)) {
      try {
        const session = game.get(msg.from);
        if (msg.sender !== session.starter) return;

        const body = (msg.body || '').trim();
        const options = session.current.options;
        const correct = session.current.answer;
        let isCorrect = false;
        if (/^[1-4]$/.test(body)) {
          const index = parseInt(body) - 1;
          if (index >= 0 && index < options.length &&
              options[index].toLowerCase() === correct.toLowerCase()) {
            isCorrect = true;
          }
        } else if (body.toLowerCase() === correct.toLowerCase()) {
          isCorrect = true;
        }

        let feedback;
        if (isCorrect) {
          session.score++;
          feedback = '✅ *Correct*';
        } else {
          session.lives--;
          feedback = `❌ *Wrong*\n✅ *Answer:* ${correct}`;
        }
        if (session.lives === 0 || session.total + 1 >= session.max) {
          game.delete(msg.from);
          await msg.reply(`🏁 *Game Over*\n\n📊 *Final Score:* ${session.score} / ${session.total + 1}`);
          return;
        }

        session.total++;
        session.current = session.questions[session.total];
        const nextOptions = session.current.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
        const q = `${feedback}\n\n🧠 *Question:*\n${session.current.question}\n\n📚 *Options:*\n${nextOptions}\n\n❤️ *Lives:* ${session.lives}\n📈 *Score:* ${session.score}\n#️⃣ *Question:* ${session.total + 1}/${session.max}\n\n*➡️ Reply with the correct number (1-4) or type the answer*`;
        await msg.reply(q);
        return;
      } catch (error) {
        console.error(error);
        game.delete(msg.from);
        await msg.reply('An error occurred in the quiz. The game has been reset');
        return;
      }
    }

    // Commands
    const bodyText = msg.body || '';
    if (bodyText.startsWith(config.prefix)) {
      const args = bodyText.slice(config.prefix.length).trim().split(/\s+/);
      const cmd = (args.shift() || '').toLowerCase();
      const context = { sock, m, config, tr_txt, getClosestTimezone, axios, fetch, moment };
      const handled = await Command(cmd, msg, args, context);
      if (!handled) {
        await msg.reply(`unknown: ${cmd}. use ${config.prefix}menu cmds`);
      }
    }
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Render QR in terminal when provided
    if (qr && useQR) {
      console.log('\nScan this QR code with WhatsApp to log in:\n');
      try {
        qrcode.generate(qr, { small: true });
      } catch (e) {
        console.error('Failed to render QR:', e);
        console.log('Raw QR string:', qr);
      }
    }
    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error).output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        console.log('Disconnected, reconnecting in 5s...');
        setTimeout(Phoenix, 5000);
      } else {
        console.log('Logged out, remove auth_info and re-run SessionCode');
      }
    } else if (connection === 'open') {
      console.log('✅ Phoenix Connected');
      try {
        const id = sock.user?.id;
        if (id) await sock.sendMessage(id, { text: '*connected successfully*' });
      } catch (e) {
        console.error(e);
      }
    }
  });
}

Phoenix();

// Start HTTP server only once to avoid EADDRINUSE on reconnect
if (!globalThis.__phoenixHttpStarted) {
  const PORT = process.env.PORT || 8000;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Phoenix Bot is running\n');
  });
  server.listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT}`);
  });
  server.on('error', (e) => {
    if (e?.code === 'EADDRINUSE') {
      console.log(`Port ${PORT} in use, skipping HTTP server start`);
    } else {
      console.error('HTTP server error:', e);
    }
  });
  globalThis.__phoenixHttpStarted = true;
}
