import { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, jidNormalizedUser } from '@whiskeysockets/baileys'
import qrcode from 'qrcode'
import fs from 'fs'
import pino from 'pino'
import crypto from 'crypto'
import NodeCache from 'node-cache'
import ws from 'ws'
import { makeWASocket } from '../lib/simple.js'

if (!(global.conns instanceof Array)) global.conns = []

let handler = async (m, { conn, args }) => {
  const baseFolder = './chatunitysub'
  if (!fs.existsSync(baseFolder)) {
    fs.mkdirSync(baseFolder, { recursive: true })
  }

  async function serbot() {
    let serbotFolder = crypto.randomBytes(10).toString('hex').slice(0, 8)
    let folderSub = `${baseFolder}/${serbotFolder}`
    if (!fs.existsSync(folderSub)) fs.mkdirSync(folderSub, { recursive: true })

    if (args[0]) {
      fs.writeFileSync(`${folderSub}/creds.json`, Buffer.from(args[0], 'base64').toString('utf-8'))
    }

    const { state, saveCreds } = await useMultiFileAuthState(folderSub)
    const msgRetryCounterCache = new NodeCache()
    const { version } = await fetchLatestBaileysVersion()

    const connectionOptions = {
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: ['ChatUnity Sub-Bot', 'Edge', '2.0.0'],
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' }))
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

    let subConn = makeWASocket(connectionOptions)
    subConn.isInit = false
    let isInit = true

    async function connectionUpdate(update) {
      const { connection, lastDisconnect, qr } = update
      if (qr) {
        let qrText = '*S U B - B O T*\n\nScansiona questo QR per diventare un sub-bot.\n\n⚠️ Dura 120 secondi!'
        let qrImage = await qrcode.toDataURL(qr, { scale: 8 })
        let sent = await conn.sendFile(m.chat, qrImage, 'qrcode.png', qrText, m)
        setTimeout(() => {
          conn.sendMessage(m.chat, { delete: sent.key })
        }, 120000) // ⏳ 120 secondi
      }

      if (connection === 'open') {
        global.conns.push(subConn)
        await conn.sendMessage(m.chat, { text: '✅ Sub-bot creato con successo!' }, { quoted: m })
      }

      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode
        await conn.sendMessage(m.chat, { text: `❌ Sub-bot disconnesso: ${reason || 'Sconosciuto'}` }, { quoted: m })
      }
    }

    subConn.ev.on('connection.update', connectionUpdate)
    subConn.ev.on('creds.update', saveCreds)
  }

  serbot()
}

handler.command = ['serbot', 'jadibot', 'qr']
export default handler

// === DISATTIVA SUB-BOT ===
export const byebot = async (m, { conn }) => {
  if (global.conn.user.jid == conn.user.jid) {
    await conn.reply(m.chat, `⚠️ Il bot principale non può essere disattivato.`, m)
  } else {
    await conn.reply(m.chat, `😐 Sub-bot disattivato.`, m)
    conn.ws.close()
  }
}
byebot.command = ['byebot']

// === MOSTRA SUB-BOT ATTIVI ===
export const listBots = async (m, { conn }) => {
  let uniqueUsers = new Map()
  if (!global.conns || !Array.isArray(global.conns)) global.conns = []

  global.conns.forEach((c) => {
    if (c.user && c.ws?.socket?.readyState !== ws.CLOSED) {
      uniqueUsers.set(c.user.jid, c)
    }
  })

  let totalUsers = uniqueUsers.size
  let txt = '*🍭 Sub-bots attivi:* ' + ` ${totalUsers || 0}`
  await conn.reply(m.chat, txt, m)
}
listBots.command = ['bots']

// === ELIMINA SESSIONE SUB-BOT ===
export const delSession = async (m, { conn }) => {
  let who = m.mentionedJid && m.mentionedJid[0] ? m.mentionedJid[0] : m.sender
  let uniqid = `${who.split('@')[0]}`
  let folder = `./chatunitysub/${uniqid}`

  try {
    fs.rmSync(folder, { recursive: true, force: true })
    await conn.sendMessage(m.chat, { text: '✅ Sub-bot eliminato.' }, { quoted: m })
  } catch (err) {
    if (err.code === 'ENOENT') {
      await conn.sendMessage(m.chat, { text: '⚠️ Nessuna sessione trovata.' }, { quoted: m })
    } else {
      console.error(err)
      await conn.sendMessage(m.chat, { text: '❌ Errore durante l\'eliminazione.' }, { quoted: m })
    }
  }
}
delSession.command = ['delsession', 'logout', 'delserbot']