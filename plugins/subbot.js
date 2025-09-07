import {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  jidNormalizedUser
} from '@whiskeysockets/baileys'

import qrcode from 'qrcode'
import fs from 'fs'
import pino from 'pino'
import NodeCache from 'node-cache'
import crypto from 'crypto'
import { makeWASocket } from '../lib/simple.js'

if (!(global.conns instanceof Array)) global.conns = []

let handler = async (m, { conn, args, usedPrefix, command }) => {
  let parent = await global.conn

  async function serbot() {
    let serbotFolder = crypto.randomBytes(10).toString('hex').slice(0, 8)
    let folderSub = `./chatunitysub/${serbotFolder}`

    if (!fs.existsSync(folderSub)) {
      fs.mkdirSync(folderSub, { recursive: true })
    }

    const { state, saveCreds } = await useMultiFileAuthState(folderSub)
    const msgRetryCounterCache = new NodeCache()
    const { version } = await fetchLatestBaileysVersion()

    const connectionOptions = {
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: ['ChatUnity SubBot', 'Chrome', '2.0.0'],
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
      },
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
      getMessage: async (chiave) => {
        let jid = jidNormalizedUser(chiave.remoteJid)
        let msg = await store.loadMessage(jid, chiave.id)
        return msg?.message || ''
      },
      msgRetryCounterCache,
      version
    }

    let connSub = makeWASocket(connectionOptions)
    connSub.isInit = false

    async function connectionUpdate(update) {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        let qrImage = await qrcode.toDataURL(qr, { scale: 8 })
        await parent.sendMessage(m.chat, {
          image: Buffer.from(qrImage.split(',')[1], 'base64'),
          caption: `📌 Scansiona questo QR per collegare il Sub-Bot.\n\n⚠️ Rimane valido finché non lo usi!`
        }, { quoted: m })
      }

      if (connection === 'open') {
        global.conns.push(connSub)
        await parent.sendMessage(m.chat, { text: '✅ Sub-bot collegato con successo!' }, { quoted: m })
      }

      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode
        if (reason && reason !== DisconnectReason.loggedOut) {
          await parent.sendMessage(m.chat, { text: `⚠️ Sub-bot disconnesso (${reason}), riconnessione...` }, { quoted: m })
          serbot() // riavvia automaticamente
        } else {
          await parent.sendMessage(m.chat, { text: '❌ Sub-bot disconnesso definitivamente (logout).' }, { quoted: m })
        }
      }
    }

    connSub.ev.on('connection.update', connectionUpdate)
    connSub.ev.on('creds.update', saveCreds)

    // Ping ogni 30s per tenere vivo
    setInterval(() => {
      if (connSub.ws?.socket && connSub.ws.socket.readyState === 1) {
        connSub.sendPresenceUpdate('available')
      }
    }, 30_000)
  }

  serbot()
}

handler.command = ['serbot', 'subbot', 'qr']
export default handler