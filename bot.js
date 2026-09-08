const { Telegraf, Markup } = require('telegraf')
const fs = require('fs')
const path = require('path')
require('dotenv').config()

const BOT_TOKEN = process.env.BOT_TOKEN
const ADMIN_ID = Number(process.env.ADMIN_ID || 0)
const CHANNEL_URL = process.env.CHANNEL_URL || 'https://t.me/YOUR_CHANNEL'
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'YOUR_ADMIN_USERNAME'
const GCASH_NAME = process.env.GCASH_NAME || 'GCash Account'
const GCASH_NUMBER = process.env.GCASH_NUMBER || '09XXXXXXXXX'
if (!BOT_TOKEN) throw new Error('Missing BOT_TOKEN in .env')
if (!ADMIN_ID) console.warn('⚠️ ADMIN_ID is not set. Admin commands will not work.')

const bot = new Telegraf(BOT_TOKEN)

const DB_FILE = path.join(__dirname, 'db.json')
const WELCOME_IMAGE = path.join(__dirname, 'hyuna-welcome.png')
const PRODUCTS = {
  gemini: {
    id: 'gemini',
    emoji: '🌷',
    name: 'Gemini Pro / Flow',
    price: 100,
    details: ['1K Credits', '18 Months'],
    note: '⚠️ No warranty after claim',
    deliveryType: 'link' // send link only
  },
  capcut: {
    id: 'capcut',
    emoji: '🎀',
    name: 'CapCut Pro',
    price: 150,
    details: ['1 Month'],
    note: '',
    deliveryType: 'email_password' // send email+password from stock
  },
  chatgpt: {
    id: 'chatgpt',
    emoji: '💕',
    name: 'ChatGPT Shared',
    price: 450,
    details: ['Shared by 4 persons', '1 device only', 'Stable account'],
    note: '🛡 Full warranty • Manual account delivery up to 12 hours',
    deliveryType: 'manual' // admin will deliver
  },
  canva: {
    id: 'canva',
    emoji: '🧁',
    name: 'Canva Pro',
    price: 30,
    details: ['1 Month+', 'Via invite'],
    note: '📧 Send Gmail after payment • Manual delivery',
    deliveryType: 'manual_invite' // ask for gmail and admin will invite
  }
}

// temporary in-memory pending orders while waiting for quantity confirmation
const pendingOrders = {}

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const fresh = { orders: [], stock: [] } // stock is a unified array of stock items
    fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2))
    return fresh
  }
  const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))

  // Migration: old format had stock as object keyed by product id.
  // Convert to unified array: { productId, type, email, password, link, addedAt }
  if (raw.stock && !Array.isArray(raw.stock)) {
    const unified = []
    for (const [pid, items] of Object.entries(raw.stock)) {
      if (Array.isArray(items)) {
        for (const it of items) {
          if (it && typeof it === 'object') {
            if (it.email && it.password) {
              unified.push({
                productId: pid,
                type: 'email_password',
                email: it.email,
                password: it.password,
                addedAt: it.addedAt || new Date().toISOString()
              })
            } else if (it.link) {
              unified.push({
                productId: pid,
                type: 'link',
                link: it.link,
                addedAt: it.addedAt || new Date().toISOString()
              })
            }
          }
        }
      }
    }
    raw.stock = unified
    fs.writeFileSync(DB_FILE, JSON.stringify(raw, null, 2))
  }

  // Ensure shape
  raw.stock = raw.stock || []
  raw.orders = raw.orders || []
  return raw
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
}

function orderId() {
  const part = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `HYU-${part}`
}

function isAdmin(ctx) {
  return Number(ctx.from?.id) === ADMIN_ID
}

function menuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🛍 Products', 'products'),
      Markup.button.callback('📦 My Orders', 'my_orders')
    ],
    [
      Markup.button.callback('💳 Payment Guide', 'payment_guide'),
      Markup.button.url('📢 Channel', CHANNEL_URL)
    ],
    [
      Markup.button.url('📩 Contact Admin', `https://t.me/${ADMIN_USERNAME}`)
    ]
  ])
}

async function sendHome(ctx) {
  const caption =
    '🌸 *Welcome to Hyuna Store!* 🌸\n' +
    'Your cute & trusted digital shop 💗\n\n' +
    'Choose an option below:'

  if (fs.existsSync(WELCOME_IMAGE)) {
    await ctx.replyWithPhoto(
      { source: WELCOME_IMAGE },
      { caption, parse_mode: 'Markdown', ...menuKeyboard() }
    )
  } else {
    await ctx.reply(caption, { parse_mode: 'Markdown', ...menuKeyboard() })
  }
}

bot.start(sendHome)
bot.command('menu', sendHome)

bot.action('products', async (ctx) => {
  await ctx.answerCbQuery()

  let text = '🌸✨ *HYUNA STORE — AVAILABLE PRODUCTS* ✨🌸\n'
  text += 'Choose your fave below 💗\n\n'

  for (const p of Object.values(PRODUCTS)) {
    text += `${p.emoji} *${p.name} — ₱${p.price}*\n`
    for (const d of p.details) text += `✦ ${d}\n`
    if (p.note) text += `${p.note}\n`
    text += '\n'
  }

  text += '🌸 _Please read the product details before ordering._'

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🌷 Buy Gemini', 'buy:gemini')],
      [Markup.button.callback('🎀 Buy CapCut', 'buy:capcut')],
      [Markup.button.callback('💕 Buy ChatGPT', 'buy:chatgpt')],
      [Markup.button.callback('🧁 Buy Canva', 'buy:canva')],
      [Markup.button.callback('⬅️ Back to Menu', 'home')]
    ])
  })
})

bot.action('home', async (ctx) => {
  await ctx.answerCbQuery()
  await sendHome(ctx)
})

bot.action(/^buy:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery()
  const productId = ctx.match[1]
  const product = PRODUCTS[productId]
  if (!product) return ctx.reply('Product not found.')

  // store pending purchase and ask for quantity
  pendingOrders[ctx.from.id] = {
    productId,
    createdAt: new Date().toISOString()
  }

  await ctx.reply('🛒 Ilan ang order? (1-50)\nHalimbawa: 5', {
    reply_markup: {
      force_reply: false
    }
  })
})

bot.action(/^cancel:(HYU-.+)$/, async (ctx) => {
  await ctx.answerCbQuery()
  const id = ctx.match[1]
  const db = loadDB()
  const order = db.orders.find(o => o.id === id && o.userId === ctx.from.id)

  if (!order) return ctx.reply('Order not found.')
  if (order.status !== 'waiting_payment') return ctx.reply('This order can no longer be cancelled.')

  order.status = 'cancelled'
  saveDB(db)
  await ctx.reply(`❌ Order \`${id}\` cancelled.`, { parse_mode: 'Markdown' })
})

bot.action('payment_guide', async (ctx) => {
  await ctx.answerCbQuery()

  const db = loadDB()
  // find latest waiting_payment order for this user
  const order = db.orders.filter(o => o.userId === ctx.from.id && o.status === 'waiting_payment').slice(-1)[0]

  let caption =
    '💳 *PAYMENT GUIDE* 🌸\n\n' +
    `📱 GCash Name: ${GCASH_NAME}\n` +
    `💰 GCash Number: ${GCASH_NUMBER}\n\n` +
    'Scan the QR code to pay.\n\n' +
    '💗 Keep your Order ID for reference.\n\n'

  if (order) {
    caption =
      `🧾 *PAYMENT SUMMARY*\n\n` +
      `Product: *${order.productName}*\n` +
      `Quantity: *${order.quantity}*\n` +
      `Price: *₱${order.pricePerItem} each*\n` +
      `Total: *₱${order.totalPrice}*\n\n` +
      caption
  }

  await ctx.replyWithPhoto(
    { source: './GCash-MyQR-08092026123724.PNG.jpg' },
    {
      caption,
      parse_mode: 'Markdown'
    }
  )
})

bot.action('my_orders', async (ctx) => {
  await ctx.answerCbQuery()
  const db = loadDB()
  const orders = db.orders.filter(o => o.userId === ctx.from.id).slice(-10).reverse()

  if (!orders.length) return ctx.reply('📦 You have no orders yet.')

  const lines = orders.map(o => {
    const statusMap = {
      waiting_payment: '⏳ Waiting for Payment',
      paid: '💗 Payment Confirmed',
      preparing: '🌸 Preparing — Manual Delivery',
      waiting_gmail: '📧 Waiting for Gmail',
      delivered: '✅ Delivered',
      cancelled: '❌ Cancelled',
      rejected: '🚫 Rejected'
    }
    const qty = o.quantity || 1
    const priceEach = o.pricePerItem || o.price || 0
    const total = o.totalPrice || priceEach * qty
    return `🧾 \`${o.id}\`\n${o.productName} — ${qty} x ₱${priceEach} = ₱${total}\n${statusMap[o.status] || o.status}`
  })

  await ctx.reply(`📦 *MY ORDERS*\n\n${lines.join('\n\n')}`, { parse_mode: 'Markdown' })
})

// Quantity confirmation handler — placed before the GMAIL handler
bot.on('text', async (ctx, next) => {
  const pending = pendingOrders[ctx.from.id]
  if (!pending) return next() // not a quantity reply for a purchase

  const text = (ctx.message.text || '').trim()
  const q = Number(text)
  if (!Number.isInteger(q) || q < 1 || q > 50) {
    return ctx.reply('❌ Invalid quantity. Please enter a number between 1 and 50.')
  }

  // create the order now
  const productId = pending.productId
  const product = PRODUCTS[productId]
  if (!product) {
    delete pendingOrders[ctx.from.id]
    return ctx.reply('Product not found.')
  }

  const db = loadDB()
  const order = {
    id: orderId(),
    userId: ctx.from.id,
    username: ctx.from.username || '',
    productId,
    productName: product.name,
    quantity: q,
    pricePerItem: product.price,
    totalPrice: product.price * q, // dynamic
    status: 'waiting_payment',
    createdAt: new Date().toISOString(),
    gmail: null,
    deliveredAt: null,
    deliveredItems: [] // will hold delivered stock items (unified format)
  }
  db.orders.push(order)
  saveDB(db)

  delete pendingOrders[ctx.from.id]

  const msg =
    `🎀 *ORDER CREATED!*\n\n` +
    `${product.emoji} Product: *${product.name}*\n` +
    `🔢 Quantity: *${order.quantity}*\n` +
    `💸 Price: *₱${order.pricePerItem} each*\n` +
    `💰 Total: *₱${order.totalPrice}*\n` +
    `🧾 Order ID: \`${order.id}\`\n` +
    `⏰ Status: *Waiting for Payment*\n\n` +
    `💗 Please complete your payment to continue.`

  await ctx.reply(msg, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('💳 Payment Guide', 'payment_guide')],
      [Markup.button.callback('❌ Cancel Order', `cancel:${order.id}`)]
    ])
  })

  if (ADMIN_ID) {
    await bot.telegram.sendMessage(
      ADMIN_ID,
      `🛎 New order\n\nOrder: ${order.id}\nProduct: ${product.name}\nQty: ${order.quantity}\nTotal: ₱${order.totalPrice}\nBuyer: @${order.username || 'no_username'} (${order.userId})`
    ).catch(() => {})
  }
})

bot.hears(/^GMAIL\s+(HYU-[A-Z0-9]+)\s+([^\s@]+@[^\s@]+\.[^\s@]+)$/i, async (ctx) => {
  const [, id, gmail] = ctx.match
  const db = loadDB()
  const order = db.orders.find(o => o.id === id && o.userId === ctx.from.id)

  if (!order) return ctx.reply('Order not found.')
  if (order.productId !== 'canva') return ctx.reply('This order does not require a Gmail address.')
  if (order.status !== 'waiting_gmail') return ctx.reply('This order is not waiting for Gmail.')

  order.gmail = gmail
  order.status = 'preparing'
  saveDB(db)

  await ctx.reply(
    `📧 Gmail received! 💗\n\nOrder: \`${id}\`\nGmail: \`${gmail}\`\n\n🌸 Your Canva invite is now being prepared.`,
    { parse_mode: 'Markdown' }
  )

  if (ADMIN_ID) {
    await bot.telegram.sendMessage(
      ADMIN_ID,
      `🧁 Canva Gmail received\nOrder: ${id}\nGmail: ${gmail}`
    ).catch(() => {})
  }
})

bot.action(/^received:(HYU-.+)$/, async (ctx) => {
  await ctx.answerCbQuery('Thank you! 💗')
  await ctx.reply('🌸 Thank you for confirming. Enjoy your order! 💕')
})

bot.action(/^show_items:(HYU-.+)$/, async (ctx) => {
  await ctx.answerCbQuery()
  const id = ctx.match[1]
  const db = loadDB()
  const order = db.orders.find(o => o.id === id && o.userId === ctx.from.id)
  if (!order || !order.deliveredItems || !order.deliveredItems.length) return ctx.reply('Items not available.')

  const items = order.deliveredItems
  let text = `📦 Delivered items for \`${order.id}\`:\n\n`
  if (items[0].type === 'link') {
    items.forEach((it, idx) => {
      text += `#${idx + 1}: ${it.link}\n`
    })
  } else if (items[0].type === 'email_password') {
    items.forEach((it, idx) => {
      text += `#${idx + 1} • 📧 ${it.email}\n    🔐 ${it.password}\n\n`
    })
  } else {
    items.forEach((it, idx) => {
      text += `#${idx + 1} • ${JSON.stringify(it)}\n`
    })
  }

  await ctx.reply(text, { parse_mode: 'Markdown' })
})

async function confirmPayment(order) {
  const db = loadDB()
  const live = db.orders.find(o => o.id === order.id)
  if (!live) return

  const product = PRODUCTS[live.productId]
  if (!product) return

  // Manual (admin will handle)
  if (product.deliveryType === 'manual') {
    live.status = 'preparing'
    saveDB(db)
    await bot.telegram.sendMessage(
      live.userId,
      `💗 *PAYMENT CONFIRMED!*\n\n` +
      `💕 Your *${product.name}* order is now being prepared.\n\n` +
      `🧾 Order: \`${live.id}\`\n` +
      `💸 Paid: *₱${live.totalPrice}*\n` +
      `📦 Status: *Preparing Account*\n\n` +
      `⏰ This product is manually delivered.\n` +
      `Please allow up to *12 hours* for your account details to arrive here.\n\n` +
      `🌷 No need to place another order while waiting. Thank you! 💕`,
      { parse_mode: 'Markdown' }
    )
    return
  }

  // Manual invite (Canva)
  if (product.deliveryType === 'manual_invite') {
    live.status = 'waiting_gmail'
    saveDB(db)
    await bot.telegram.sendMessage(
      live.userId,
      `💗 *PAYMENT CONFIRMED!*\n\n` +
      `🧁 ${product.name} — \`${live.id}\`\n\n` +
      `📧 Please send the Gmail address you want us to invite.\n` +
      `Send it in this format:\n\n` +
      `\`GMAIL ${live.id} yourname@gmail.com\``,
      { parse_mode: 'Markdown' }
    )
    return
  }

  // For stock-based products (link or email_password)
  const needed = live.quantity || 1
  // Find matching stock items for this product
  const available = db.stock.filter(s => s.productId === live.productId)
  if (available.length < needed) {
    live.status = 'preparing'
    saveDB(db)
    await bot.telegram.sendMessage(
      live.userId,
      `💗 Payment confirmed for \`${live.id}\`.\n\n🌸 Your ${product.name} is being prepared. We will deliver it here as soon as stock is ready.`,
      { parse_mode: 'Markdown' }
    )
    return
  }

  // Reserve (remove) the first 'needed' matching stock items
  const toDeliver = []
  let removed = 0
  const remainingStock = []
  for (const s of db.stock) {
    if (removed < needed && s.productId === live.productId) {
      toDeliver.push(s)
      removed++
    } else {
      remainingStock.push(s)
    }
  }
  db.stock = remainingStock
  live.status = 'delivered'
  live.deliveredAt = new Date().toISOString()
  live.deliveredItems = toDeliver
  saveDB(db)

  // deliver accordingly
  await deliverCredentials(live, toDeliver)
}

async function deliverCredentials(order, items) {
  // items: array of unified stock items (can contain link or email/password)
  if (!Array.isArray(items)) items = [items]

  const product = PRODUCTS[order.productId]

  let body = `💕 *YOUR ${product.name.toUpperCase()} ORDER IS READY!* 💕\n\n` +
    `🧾 Order: \`${order.id}\`\n` +
    `📦 Product: *${product.name}*\n` +
    `✅ Status: *Delivered*\n\n`

  if (items.length === 0) {
    body += '✅ Delivery completed.\n'
  } else {
    if (items[0].type === 'link') {
      body += '*LINKS*\n'
      items.forEach((it, idx) => {
        body += `#${idx + 1}: ${it.link}\n`
      })
      body += '\n'
    } else if (items[0].type === 'email_password') {
      body += '*ACCOUNTS*\n'
      items.forEach((it, idx) => {
        body += `#${idx + 1} • 📧 ${it.email}\n    🔐 ${it.password}\n`
      })
      body += '\n'
    } else {
      // generic print
      items.forEach((it, idx) => {
        body += `#${idx + 1}: ${JSON.stringify(it)}\n`
      })
      body += '\n'
    }
  }

  body += `💗 Please save your login details.\n` +
    `🌸 Thank you for ordering from Hyuna Store!`

  // Provide simple buttons: show_items and received
  await bot.telegram.sendMessage(
    order.userId,
    body,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📦 Show Items', `show_items:${order.id}`)],
        [Markup.button.callback('✅ Mark as Received', `received:${order.id}`)]
      ])
    }
  )
}

bot.hears(/^GMAIL\s+(HYU-[A-Z0-9]+)\s+([^\s@]+@[^\s@]+\.[^\s@]+)$/i, async (ctx) => {
  const [, id, gmail] = ctx.match
  const db = loadDB()
  const order = db.orders.find(o => o.id === id && o.userId === ctx.from.id)

  if (!order) return ctx.reply('Order not found.')
  if (order.productId !== 'canva') return ctx.reply('This order does not require a Gmail address.')
  if (order.status !== 'waiting_gmail') return ctx.reply('This order is not waiting for Gmail.')

  order.gmail = gmail
  order.status = 'preparing'
  saveDB(db)

  await ctx.reply(
    `📧 Gmail received! 💗\n\nOrder: \`${id}\`\nGmail: \`${gmail}\`\n\n🌸 Your Canva invite is now being prepared.`,
    { parse_mode: 'Markdown' }
  )

  if (ADMIN_ID) {
    await bot.telegram.sendMessage(
      ADMIN_ID,
      `🧁 Canva Gmail received\nOrder: ${id}\nGmail: ${gmail}`
    ).catch(() => {})
  }
})

// ADMIN: confirm payment
bot.command('paid', async (ctx) => {
  if (!isAdmin(ctx)) return
  const id = ctx.message.text.split(/\s+/)[1]
  if (!id) return ctx.reply('Usage: /paid HYU-XXXX')

  const db = loadDB()
  const order = db.orders.find(o => o.id === id)
  if (!order) return ctx.reply('Order not found.')
  if (!['waiting_payment', 'preparing'].includes(order.status)) {
    return ctx.reply(`Current status: ${order.status}`)
  }

  order.status = 'paid'
  saveDB(db)
  await ctx.reply(`✅ Payment confirmed for ${id}`)
  await confirmPayment(order)
})

// ADMIN: deliver manual account
// Usage:
// /deliver HYU-XXXX email@example.com password123
bot.command('deliver', async (ctx) => {
  if (!isAdmin(ctx)) return
  const parts = ctx.message.text.split(/\s+/)
  const [, id, email, ...passParts] = parts
  const password = passParts.join(' ')

  if (!id || !email || !password) {
    return ctx.reply('Usage: /deliver HYU-XXXX email@example.com password')
  }

  const db = loadDB()
  const order = db.orders.find(o => o.id === id)
  if (!order) return ctx.reply('Order not found.')

  order.status = 'delivered'
  order.deliveredAt = new Date().toISOString()
  order.deliveredItems = [{
    productId: order.productId,
    type: 'email_password',
    email,
    password,
    addedAt: new Date().toISOString()
  }]
  saveDB(db)

  await deliverCredentials(order, order.deliveredItems)
  await ctx.reply(`✅ Delivered ${id}`)
})

// ADMIN: mark Canva invite delivered
bot.command('canva_done', async (ctx) => {
  if (!isAdmin(ctx)) return
  const id = ctx.message.text.split(/\s+/)[1]
  if (!id) return ctx.reply('Usage: /canva_done HYU-XXXX')

  const db = loadDB()
  const order = db.orders.find(o => o.id === id)
  if (!order) return ctx.reply('Order not found.')

  order.status = 'delivered'
  order.deliveredAt = new Date().toISOString()
  saveDB(db)

  await bot.telegram.sendMessage(
    order.userId,
    `🧁💗 *CANVA PRO DELIVERED!*\n\n` +
    `🧾 Order: \`${order.id}\`\n` +
    `📧 Gmail: \`${order.gmail || 'submitted'}\`\n` +
    `✅ Status: *Invite Sent / Delivered*\n\n` +
    `🌸 Please check your Gmail and Canva account. Thank you!`,
    { parse_mode: 'Markdown' }
  )

  await ctx.reply(`✅ Canva marked delivered: ${id}`)
})

// ADMIN: add stock for Gemini/CapCut
// /stockadd gemini email@example.com password123
bot.command('stockadd', async (ctx) => {
  if (!isAdmin(ctx)) return
  const parts = ctx.message.text.split(/\s+/)
  const [, productId, firstParam, ...rest] = parts
  if (!productId || !firstParam) {
    return ctx.reply('Usage: /stockadd <productId> <email|link> [password if email_password]')
  }

  const product = PRODUCTS[productId]
  if (!product) return ctx.reply('Unknown productId.')

  const db = loadDB()
  db.stock = db.stock || []

  if (product.deliveryType === 'email_password') {
    const password = rest.join(' ')
    if (!password) return ctx.reply('Usage for email_password: /stockadd productId email password')
    db.stock.push({
      productId,
      type: 'email_password',
      email: firstParam,
      password,
      addedAt: new Date().toISOString()
    })
  } else if (product.deliveryType === 'link') {
    // for link-based products, firstParam is the link
    db.stock.push({
      productId,
      type: 'link',
      link: firstParam,
      addedAt: new Date().toISOString()
    })
  } else {
    // generic: store as raw item
    db.stock.push({
      productId,
      type: 'generic',
      value: [firstParam, ...rest].join(' '),
      addedAt: new Date().toISOString()
    })
  }

  saveDB(db)
  const totalForPid = db.stock.filter(s => s.productId === productId).length
  await ctx.reply(`✅ Added 1 ${productId} stock. Total: ${totalForPid}`)
})

bot.command('orders', async (ctx) => {
  if (!isAdmin(ctx)) return
  const db = loadDB()
  const recent = db.orders.slice(-20).reverse()
  if (!recent.length) return ctx.reply('No orders yet.')

  const text = recent.map(o =>
    `${o.id} | ${o.productName} | qty:${o.quantity || 1} | total:₱${o.totalPrice || (o.pricePerItem || 0)} | ${o.status} | ${o.userId}`
  ).join('\n')

  await ctx.reply(`📦 Recent Orders\n\n${text}`)
})

bot.catch((err) => {
  console.error('Bot error:', err)
})

bot.launch()
console.log('🌸 Hyuna Store bot is running...')

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
