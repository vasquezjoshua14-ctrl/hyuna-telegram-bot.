const { Telegraf, Markup } = require('telegraf')
const fs = require('fs')
const path = require('path')
require('dotenv').config()
const OpenAI = require('openai')

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})
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

// temporary storage for admin stock adding flow
const adminStockFlow = {}

// temporary storage for admin stock deletion flow
const adminDelStockFlow = {}

// temporary storage for customers who are expected to send a receipt photo
const pendingReceiptOrders = {}

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
  const userId = Number(ctx.from?.id)
  const isAllowed = userId === ADMIN_ID
  // Debug: log admin check
  if (process.env.DEBUG_ADMIN) {
    console.log(`[ADMIN CHECK] User: ${userId}, ADMIN_ID: ${ADMIN_ID}, Allowed: ${isAllowed}`)
  }
  return isAllowed
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
      parse_mode: 'Markdown',
      ...(order
        ? Markup.inlineKeyboard([
            [Markup.button.callback('📸 Send Receipt', `send_receipt:${order.id}`)]
          ])
        : {})
    }
  )
})

// Ask the customer to send a receipt for a specific unpaid order.
bot.action(/^send_receipt:(HYU-.+)$/, async (ctx) => {
  await ctx.answerCbQuery()

  const id = ctx.match[1]
  const db = loadDB()
  const order = db.orders.find(o => o.id === id && o.userId === ctx.from.id)

  if (!order) return ctx.reply('Order not found.')
  if (order.status !== 'waiting_payment') {
    return ctx.reply('This order is no longer waiting for payment.')
  }

  pendingReceiptOrders[ctx.from.id] = id
  await ctx.reply(
    `📸 Please send your GCash receipt screenshot here.\n\n` +
    `🧾 Order ID: \`${id}\`\n\n` +
    `Your receipt will be reviewed manually. Payment will not be approved automatically.`,
    { parse_mode: 'Markdown' }
  )
})

// Save the customer's receipt and notify the admin without approving payment.
async function processReceiptMedia(ctx, media) {
  const id = pendingReceiptOrders[ctx.from.id]
  if (!id) return false

  if (media.type === 'document' && !media.mimeType?.startsWith('image/')) {
    await ctx.reply('❌ Please send the receipt as a photo or image file.')
    return true
  }

  const db = loadDB()
  const order = db.orders.find(o => o.id === id && o.userId === ctx.from.id)

if (order && order.paymentExpiresAt && Date.now() > order.paymentExpiresAt) {
  order.status = 'expired'
  saveDB(db)
  delete pendingReceiptOrders[ctx.from.id]

  await ctx.reply(
    '❌ Payment expired.\n\nPlease create a new order.'
  )

  return true
}

if (!order) {
  delete pendingReceiptOrders[ctx.from.id]
  await ctx.reply('❌ Order not found.')
  return true
}

if (order.status !== 'waiting_payment') {
  delete pendingReceiptOrders[ctx.from.id]
  await ctx.reply('❌ This order is no longer waiting for payment.')
  return true
}

order.receipt = {
  fileId: media.fileId,
  fileUniqueId: media.fileUniqueId,
  mediaType: media.type,
  receivedAt: new Date().toISOString(),
  caption: ctx.message.caption || ''
}
  order.receiptStatus = 'pending_verification'
  saveDB(db)
  delete pendingReceiptOrders[ctx.from.id]

  await ctx.reply(
    `✅ Receipt received for Order ID \`${id}\`.\n\n` +
    `⏳ It is waiting for manual verification. Please do not send another payment.`,
    { parse_mode: 'Markdown' }
  )

  if (ADMIN_ID) {
    const adminCaption =
      `📸 GCash receipt pending verification\n\n` +
      `Order: ${id}\n` +
      `Product: ${order.productName}\n` +
      `Total: ₱${order.totalPrice}\n` +
      `Buyer: @${order.username || 'no_username'} (${order.userId})`
    const keyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('✅ Approve', `approve_${id}`),
    Markup.button.callback('❌ Reject', `reject_${id}`)
  ]
])

const sendReceipt = media.type === 'document'
  ? bot.telegram.sendDocument(ADMIN_ID, media.fileId, {
      caption: adminCaption,
      ...keyboard
    })
  : bot.telegram.sendPhoto(ADMIN_ID, media.fileId, {
      caption: adminCaption,
      ...keyboard
    })
    await sendReceipt.catch(() => {})
  }
  return true
}
bot.action(/approve_(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Unauthorized');

  const id = ctx.match[1];
  const db = loadDB();

  const order = db.orders.find(o => o.id === id);
  if (!order) return ctx.answerCbQuery('Order not found');

  order.status = 'paid';
  saveDB(db);

  await ctx.answerCbQuery('Approved');

  await ctx.reply(`✅ Order ${id} approved. Processing delivery...`);

  await confirmPayment(order);
});


bot.action(/reject_(.+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('Unauthorized');

  const id = ctx.match[1];
  const db = loadDB();

  const order = db.orders.find(o => o.id === id);
  if (!order) return ctx.answerCbQuery('Order not found');

  order.status = 'rejected';
  saveDB(db);

  await ctx.answerCbQuery('Rejected');

  await bot.telegram.sendMessage(
    order.userId,
    `❌ Your payment for Order ${id} was rejected. Please contact admin.`
  );
});
bot.on('photo', async (ctx, next) => {
  const photo = ctx.message.photo[ctx.message.photo.length - 1]
  const handled = await processReceiptMedia(ctx, {
    type: 'photo',
    fileId: photo.file_id,
    fileUniqueId: photo.file_unique_id
  })
  if (!handled) return next()
})

bot.on('document', async (ctx, next) => {
  const document = ctx.message.document
  const handled = await processReceiptMedia(ctx, {
    type: 'document',
    fileId: document.file_id,
    fileUniqueId: document.file_unique_id,
    mimeType: document.mime_type || ''
  })
  if (!handled) return next()
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
    const receiptNote = o.receiptStatus === 'pending_verification'
      ? '\n📸 Receipt Pending Verification'
      : ''
    return `🧾 \`${o.id}\`\n${o.productName} — ${qty} x ₱${priceEach} = ₱${total}\n${statusMap[o.status] || o.status}${receiptNote}`
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
    totalPrice: product.price * q, // dynamic total price
    status: 'waiting_payment',
    createdAt: new Date().toISOString(),
    paymentExpiresAt: Date.now() + 
      (10 * 60 * 1000),
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

// UNIFIED GMAIL handler (removed duplicate)
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

// ADMIN: confirm payment
bot.command('paid', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('❌ Unauthorized')
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
  if (!isAdmin(ctx)) return ctx.reply('❌ Unauthorized')
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
  if (!isAdmin(ctx)) return ctx.reply('❌ Unauthorized')
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

// ADMIN: view recent orders with detailed summary
bot.command('orders', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('❌ Unauthorized')
  const db = loadDB()
  const recent = db.orders.slice(-20).reverse()
  if (!recent.length) return ctx.reply('No orders yet.')

  const text = recent.map(o => {
    const statusEmoji = {
      'waiting_payment': '⏳',
      'paid': '💗',
      'preparing': '🌸',
      'waiting_gmail': '📧',
      'delivered': '✅',
      'cancelled': '❌',
      'rejected': '🚫'
    }
    return `${statusEmoji[o.status] || '•'} ${o.id} | ${o.productName} | qty:${o.quantity || 1} | ₱${o.totalPrice || (o.pricePerItem || 0)} | ${o.status} | ${o.userId}`
  }).join('\n')

  await ctx.reply(`📦 *Recent Orders (Last 20)*\n\n${text}`, { parse_mode: 'Markdown' })
})

// ADMIN: view stock levels
bot.command('stock', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('❌ Unauthorized')
  const db = loadDB()
  if (!db.stock || !db.stock.length) return ctx.reply('No stock available.')

  const stockByProduct = {}
  for (const s of db.stock) {
    if (!stockByProduct[s.productId]) {
      stockByProduct[s.productId] = []
    }
    stockByProduct[s.productId].push(s)
  }

  let text = '📦 *STOCK LEVELS*\n\n'
  for (const [pid, items] of Object.entries(stockByProduct)) {
    const product = PRODUCTS[pid]
    text += `${product?.emoji || '•'} *${product?.name || pid}*: ${items.length} item(s)\n`
  }

  await ctx.reply(text, { parse_mode: 'Markdown' })
})

// ADMIN: add stock with button menu flow
bot.command('addstock', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('❌ Unauthorized')

  await ctx.reply('📦 *Select a product to add stock:*', {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🌷 Gemini', 'addstock:gemini')],
      [Markup.button.callback('🎀 CapCut', 'addstock:capcut')],
      [Markup.button.callback('💕 ChatGPT', 'addstock:chatgpt')],
      [Markup.button.callback('🧁 Canva', 'addstock:canva')]
    ])
  })
})

// Handle product selection for adding stock
bot.action(/^addstock:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('❌ Unauthorized', true)
  
  await ctx.answerCbQuery()
  const productId = ctx.match[1]
  const product = PRODUCTS[productId]
  
  if (!product) return ctx.reply('Product not found.')

  // Initialize admin stock flow
  adminStockFlow[ctx.from.id] = {
    productId,
    deliveryType: product.deliveryType,
    items: []
  }

  if (product.deliveryType === 'link') {
    await ctx.reply(
      `🌷 *Adding stock for ${product.name}*\n\n` +
      `Send stock links. You can send multiple links (one per line or each in a separate message).\n\n` +
      `Formats accepted:\n` +
      `• Plain links:\n  https://link1.com\n  https://link2.com\n\n` +
      `• Numbered format:\n  Link 1: https://link1.com\n  Link 2: https://link2.com`,
      { parse_mode: 'Markdown' }
    )
  } else if (product.deliveryType === 'email_password') {
    await ctx.reply(
      `🎀 *Adding stock for ${product.name}*\n\n` +
      `Send accounts in format: \`email|password\`\n\n` +
      `You can send multiple accounts (one per line or each in a separate message).`,
      { parse_mode: 'Markdown' }
    )
  } else {
    await ctx.reply(
      `📦 *Adding stock for ${product.name}*\n\n` +
      `Send the required stock information for this product.`,
      { parse_mode: 'Markdown' }
    )
  }
})

// Extract every Gemini activation URL from the complete message. Copy/paste
// sometimes adds zero-width characters inside a URL, so remove them first.
function parseGeminiActivationLinks(text) {
  const cleaned = String(text || '')
    .replace(/[\u007F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180D\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFE00-\uFE0F\uFEFF]/g, '')

  const matches = cleaned.match(
    /https?:\/\/serviceactivation\.google\.com\/subscription\/new\/[^\s<>"'`]+/gi
  ) || []

  // Punctuation is commonly pasted immediately after a URL in a numbered
  // list. It is not part of the activation link.
  return matches.map(link => link.replace(/[),.;!?]+$/g, ''))
}

// Keep the existing parser available for any future non-Gemini link products.
function parseBulkLinks(text) {
  const links = []
  for (const line of String(text || '').split('\n').filter(l => l.trim())) {
    const trimmed = line.replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
    const match = trimmed.match(/^[Ll]ink\s+\d+:\s*(https?:\/\/.+)$/i)
    if (match) {
      links.push(match[1].trim())
    } else if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      links.push(trimmed)
    }
  }
  return links
}

// Handle admin stock submission
bot.on('text', async (ctx, next) => {
  const flow = adminStockFlow[ctx.from.id]
  if (!flow || !isAdmin(ctx)) return next()

  const text = (ctx.message.text || '').trim()
  if (!text) return next()

  // Check if this is a command (skip admin stock flow if it's a command)
  if (text.startsWith('/')) {
    delete adminStockFlow[ctx.from.id]
    return next()
  }

  const productId = flow.productId
  const product = PRODUCTS[productId]
  const db = loadDB()
  db.stock = db.stock || []

  let addedCount = 0
  let duplicateCount = 0

  // Parse input based on delivery type
  if (product.deliveryType === 'link') {
    // Gemini links are extracted from the entire message, regardless of
    // labels, numbering, line breaks, spaces, or blank lines.
    const links = productId === 'gemini'
      ? parseGeminiActivationLinks(text)
      : parseBulkLinks(text)
    const existingGeminiLinks = new Set(
      db.stock
        .filter(stock => stock.productId === 'gemini' && stock.type === 'link')
        .map(stock => stock.link)
    )
    const seenInMessage = new Set()
    
    for (const link of links) {
      if (productId === 'gemini' && (existingGeminiLinks.has(link) || seenInMessage.has(link))) {
        duplicateCount++
        continue
      }

      db.stock.push({
        productId,
        type: 'link',
        link,
        addedAt: new Date().toISOString()
      })
      flow.items.push(link)
      addedCount++
      if (productId === 'gemini') {
        seenInMessage.add(link)
        existingGeminiLinks.add(link)
      }
    }
    
    if (addedCount === 0) {
      if (productId === 'gemini' && duplicateCount > 0) {
        const totalForPid = db.stock.filter(s => s.productId === productId).length
        delete adminStockFlow[ctx.from.id]
        return ctx.reply(
          `♻️ Skipped ${duplicateCount} duplicate link${duplicateCount === 1 ? '' : 's'}\n\n` +
          `📦 Total ${product.name} stock: ${totalForPid}`
        )
      }
      return ctx.reply(
        productId === 'gemini'
          ? '❌ No valid Gemini activation links found. Please send serviceactivation.google.com/subscription/new/ links.'
          : '❌ No valid links found. Please send links starting with http:// or https://'
      )
    }
  } else if (product.deliveryType === 'email_password') {
    // Accept email|password format
    const lines = text.split('\n').filter(l => l.trim())
    for (const line of lines) {
      const [email, password] = line.split('|').map(s => s.trim())
      if (email && password && email.includes('@')) {
        db.stock.push({
          productId,
          type: 'email_password',
          email,
          password,
          addedAt: new Date().toISOString()
        })
        flow.items.push(`${email}|${password}`)
        addedCount++
      }
    }
    if (addedCount === 0) {
      return ctx.reply('❌ Invalid format. Use: email@example.com|password')
    }
  } else {
    // For manual products, just store as is
    db.stock.push({
      productId,
      type: 'generic',
      value: text,
      addedAt: new Date().toISOString()
    })
    flow.items.push(text)
    addedCount = 1
  }

  saveDB(db)

  // Confirm save
  const totalForPid = db.stock.filter(s => s.productId === productId).length
  const duplicateSummary = productId === 'gemini' && duplicateCount > 0
    ? `\n♻️ Skipped ${duplicateCount} duplicate link${duplicateCount === 1 ? '' : 's'}`
    : ''
  await ctx.reply(
    `✅ Added ${addedCount} ${product.name} stock${duplicateSummary}\n\n📦 Total ${product.name} stock: ${totalForPid}`,
    { parse_mode: 'Markdown' }
  )

  // Clear flow
  delete adminStockFlow[ctx.from.id]
})

// ADMIN: delete stock - product selection
bot.command('delstock', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('❌ Unauthorized')

  await ctx.reply('📦 *Select a product to manage stock:*', {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🌷 Gemini', 'delstock:gemini')],
      [Markup.button.callback('🎀 CapCut', 'delstock:capcut')],
      [Markup.button.callback('💕 ChatGPT', 'delstock:chatgpt')],
      [Markup.button.callback('🧁 Canva', 'delstock:canva')]
    ])
  })
})

// Handle product selection for deleting stock - show options
bot.action(/^delstock:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('❌ Unauthorized', true)
  
  await ctx.answerCbQuery()
  const productId = ctx.match[1]
  const product = PRODUCTS[productId]
  
  if (!product) return ctx.reply('Product not found.')

  const db = loadDB()
  const productStocks = db.stock.filter(s => s.productId === productId)
  
  if (!productStocks.length) return ctx.reply(`📦 No stock available for ${product.name}.`)

  // Show options: Delete one or Delete all
  await ctx.reply(
    `📦 *${product.name}* - ${productStocks.length} stock item(s)\n\nWhat would you like to do?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🗑️ Delete One', `delstockone:${productId}`)],
        [Markup.button.callback('🗑️🗑️ Delete All', `delstockall:${productId}`)]
      ])
    }
  )
})

// Handle delete one stock
bot.action(/^delstockone:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('❌ Unauthorized', true)
  
  await ctx.answerCbQuery()
  const productId = ctx.match[1]
  const product = PRODUCTS[productId]
  
  if (!product) return ctx.reply('Product not found.')

  const db = loadDB()
  const productStocks = db.stock.filter(s => s.productId === productId)
  
  if (!productStocks.length) return ctx.reply(`📦 No stock available for ${product.name}.`)

  // Show stocks numbered
  let text = `📦 *${product.name} Stock (${productStocks.length} items)*\n\n`
  productStocks.forEach((stock, idx) => {
    if (stock.type === 'link') {
      text += `Stock ${idx + 1}\n${stock.link}\n\n`
    } else if (stock.type === 'email_password') {
      text += `Stock ${idx + 1}\n📧 ${stock.email}\n🔐 ${stock.password}\n\n`
    } else {
      text += `Stock ${idx + 1}\n${JSON.stringify(stock)}\n\n`
    }
  })
  
  text += `Reply with the stock number to delete (1-${productStocks.length})`

  adminDelStockFlow[ctx.from.id] = {
    action: 'deleteone',
    productId,
    productStocks,
    product
  }

  await ctx.reply(text, { parse_mode: 'Markdown' })
})

// Handle delete all stock for product
bot.action(/^delstockall:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('❌ Unauthorized', true)
  
  await ctx.answerCbQuery()
  const productId = ctx.match[1]
  const product = PRODUCTS[productId]
  
  if (!product) return ctx.reply('Product not found.')

  const db = loadDB()
  const count = db.stock.filter(s => s.productId === productId).length

  if (!count) return ctx.reply(`📦 No stock available for ${product.name}.`)

  await ctx.reply(
    `⚠️ *Confirm deletion*\n\nDelete ALL ${count} stock item(s) of ${product.name}?\n\nReply: YES or NO`,
    { parse_mode: 'Markdown' }
  )

  adminDelStockFlow[ctx.from.id] = {
    action: 'deleteall',
    productId,
    product
  }
})

// Handle stock deletion by number
bot.on('text', async (ctx, next) => {
  const flow = adminDelStockFlow[ctx.from.id]
  if (!flow || !isAdmin(ctx)) return next()

  const text = (ctx.message.text || '').trim()
  
  // Skip if it's a command
  if (text.startsWith('/')) {
    delete adminDelStockFlow[ctx.from.id]
    return next()
  }

  // Handle delete one stock
  if (flow.action === 'deleteone') {
    const num = Number(text)
    if (!Number.isInteger(num) || num < 1 || num > flow.productStocks.length) {
      return ctx.reply(`❌ Please enter a number between 1 and ${flow.productStocks.length}.`)
    }

    const db = loadDB()
    const selectedStock = flow.productStocks[num - 1]
    
    // Find and remove the exact matching stock item
    let removed = false
    db.stock = db.stock.filter((s, idx) => {
      if (!removed && s.productId === flow.productId) {
        // Check if this is the stock item we want to delete
        if (JSON.stringify(s) === JSON.stringify(selectedStock)) {
          removed = true
          return false // Remove this item
        }
      }
      return true // Keep this item
    })
    
    saveDB(db)
    const remaining = db.stock.filter(s => s.productId === flow.productId).length

    await ctx.reply(
      `✅ Deleted stock ${num} from ${flow.product.name}\n\n📦 Remaining ${flow.product.name} stock: ${remaining}`,
      { parse_mode: 'Markdown' }
    )

    delete adminDelStockFlow[ctx.from.id]
    return
  }

  // Handle delete all confirmation
  if (flow.action === 'deleteall') {
    const response = text.toLowerCase()

    if (response !== 'yes' && response !== 'no') {
      return ctx.reply('❌ Please reply with YES or NO')
    }

    if (response === 'no') {
      await ctx.reply('❌ Cancelled.')
      delete adminDelStockFlow[ctx.from.id]
      return
    }

    if (response === 'yes') {
      const db = loadDB()
      const count = db.stock.filter(s => s.productId === flow.productId).length
      db.stock = db.stock.filter(s => s.productId !== flow.productId)
      saveDB(db)
      await ctx.reply(
        `✅ Deleted ${count} stock item(s) from ${flow.product.name}`,
        { parse_mode: 'Markdown' }
      )
      delete adminDelStockFlow[ctx.from.id]
      return
    }
  }

  return next()
})

// ADMIN: clear all stock for all products
bot.command('clearallstock', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('❌ Unauthorized')

  const db = loadDB()
  const totalCount = db.stock.length

  if (!totalCount) return ctx.reply('📦 No stock available.')

  await ctx.reply(
    `⚠️ *Confirm deletion*\n\nDelete ALL ${totalCount} stock item(s) from ALL products?\n\nReply: YES or NO`,
    { parse_mode: 'Markdown' }
  )

  adminDelStockFlow[ctx.from.id] = {
    action: 'clearallstock'
  }
})

// Handle confirmation for clear all stock
bot.hears(/^(yes|no)$/i, async (ctx) => {
  const flow = adminDelStockFlow[ctx.from.id]
  if (!flow || !isAdmin(ctx)) return

  const response = ctx.message.text.toLowerCase()

  if (response === 'no') {
    await ctx.reply('❌ Cancelled.')
    delete adminDelStockFlow[ctx.from.id]
    return
  }

  if (response === 'yes' && flow.action === 'clearallstock') {
    const db = loadDB()
    const count = db.stock.length
    db.stock = []
    saveDB(db)
    await ctx.reply(
      `✅ Deleted ALL ${count} stock item(s) from all products`,
      { parse_mode: 'Markdown' }
    )
    delete adminDelStockFlow[ctx.from.id]
  }
})

bot.catch((err) => {
  console.error('Bot error:', err)
})
bot.telegram.setMyCommands([
  { command: 'start', description: '🏠 Open Menu' },
  { command: 'menu', description: '🛍 Show Products Menu' }
])
bot.launch()
console.log('🌸 Hyuna Store bot is running...')
console.log(`ADMIN_ID configured: ${ADMIN_ID}`)

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
