import {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys'
import qrcode from 'qrcode'
import fs from 'fs'
import pino from 'pino'
import NodeCache from 'node-cache'
import { makeWASocket } from '../lib/simple.js'

if (!global.conns) global.conns = []

let handler = async (m, { conn, args }) => {
  // cartella base
  const baseFolder = './chatunitysub'
  if (!fs.existsSync(baseFolder)) fs.mkdirSync(baseFolder, { recursive: true })

  let userId = m.sender.split('@')[0] // nome cartella = numero user
  const userFolder = `${baseFolder}/${userId}`
  if (!fs.existsSync(userFolder)) fs.mkdirSync(userFolder, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(userFolder)
  const { version } = await fetchLatestBaileysVersion()
  const msgRetryCounterCache = new NodeCache()

  const connectionOptions = {
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['ChatUnity SubBot', 'Chrome', '1.0.0'],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    msgRetryCounterCache,
    version,
  }

  let subConn = makeWASocket(connectionOptions)

  // genera QR
  subConn.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update
    if (qr) {
      let qrImage = await qrcode.toDataURL(qr, { scale: 8 })
      await conn.sendMessage(m.chat, {
        image: Buffer.from(qrImage.split(',')[1], 'base64'),
        caption: `📲 Scansiona il QR per collegare il tuo SubBot\n\n⏳ Scade in 120 secondi!`,
      }, { quoted: m })
    }

    if (connection === 'open') {
      global.conns.push(subConn)
      await conn.sendMessage(m.chat, {
        text: `✅ Sub-bot collegato con successo!\nNumero: ${subConn.user.id.split('@')[0]}`,
      }, { quoted: m })
    }

    if (connection === 'close') {
      let reason = lastDisconnect?.error?.output?.statusCode
      await conn.sendMessage(m.chat, {
        text: `❌ Sub-bot disconnesso. Codice: ${reason || 'sconosciuto'}`,
      }, { quoted: m })
    }
  })

  subConn.ev.on('creds.update', saveCreds)
}

handler.command = ['serbot', 'qr']
handler.help = ['serbot']
handler.tags = ['tools']
export default handler