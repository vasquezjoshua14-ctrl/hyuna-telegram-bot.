
const { Telegraf, Markup } = require('telegraf')
const fs = require('fs')
const path = require('path')
require('dotenv').config()

const BOT_TOKEN = process.env.BOT_TOKEN
const ADMIN_ID = Number(process.env.ADMIN_ID || 0)
const CHANNEL_URL = process.env.CHANNEL_URL || 'https://t.me/YOUR_CHANNEL'
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'YOUR_ADMIN_USERNAME'

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
    delivery: 'stock'
  },
  capcut: {
    id: 'capcut',
    emoji: '🎀',
    name: 'CapCut Pro',
    price: 150,
    details: ['1 Month'],
    note: '',
    delivery: 'stock'
  },
  chatgpt: {
    id: 'chatgpt',
    emoji: '💕',
    name: 'ChatGPT Shared',
    price: 450,
    details: ['Shared by 4 persons', '1 device only', 'Stable account'],
    note: '🛡 Full warranty • Manual account delivery up to 12 hours',
    delivery: 'manual_account'
  },
  canva: {
    id: 'canva',
    emoji: '🧁',
    name: 'Canva Pro',
    price: 30,
    details: ['1 Month+', 'Via invite'],
    note: '📧 Send Gmail after payment • Manual delivery',
    delivery: 'manual_gmail'
  }
}

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const fresh = { orders: [], stock: { gemini: [], capcut: [] } }
    fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2))
    return fresh
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
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

  const db = loadDB()
  const order = {
    id: orderId(),
    userId: ctx.from.id,
    username: ctx.from.username || '',
    productId,
    productName: product.name,
    price: product.price,
    status: 'waiting_payment',
    createdAt: new Date().toISOString(),
    gmail: null,
    deliveredAt: null
  }
  db.orders.push(order)
  saveDB(db)

  const msg =
    `🎀 *ORDER CREATED!*\n\n` +
    `${product.emoji} Product: *${product.name}*\n` +
    `💸 Total: *₱${product.price}*\n` +
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
      `🛎 New order\n\nOrder: ${order.id}\nProduct: ${product.name}\nPrice: ₱${product.price}\nBuyer: @${order.username || 'no_username'} (${order.userId})`
    ).catch(() => {})
  }
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
  await ctx.reply(
    '💳 *PAYMENT GUIDE* 🌸\n\n' +
    '1. Choose a product and create an order.\n' +
    '2. Pay using the payment details provided by the admin/store.\n' +
    '3. Once payment is confirmed, your order status will update automatically.\n' +
    '4. Manual products will be prepared and delivered here.\n\n' +
    '💗 Keep your Order ID for reference.',
    { parse_mode: 'Markdown' }
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
    return `🧾 \`${o.id}\`\n${o.productName} — ₱${o.price}\n${statusMap[o.status] || o.status}`
  })

  await ctx.reply(`📦 *MY ORDERS*\n\n${lines.join('\n\n')}`, { parse_mode: 'Markdown' })
})

async function confirmPayment(order) {
  const db = loadDB()
  const live = db.orders.find(o => o.id === order.id)
  if (!live) return

  const product = PRODUCTS[live.productId]
  if (!product) return

  if (product.delivery === 'manual_account') {
    live.status = 'preparing'
    saveDB(db)
    await bot.telegram.sendMessage(
      live.userId,
      `💗 *PAYMENT CONFIRMED!*\n\n` +
      `💕 Your *${product.name}* order is now being prepared.\n\n` +
      `🧾 Order: \`${live.id}\`\n` +
      `💸 Paid: *₱${live.price}*\n` +
      `📦 Status: *Preparing Account*\n\n` +
      `⏰ This product is manually delivered.\n` +
      `Please allow up to *12 hours* for your account details to arrive here.\n\n` +
      `🌷 No need to place another order while waiting. Thank you! 💕`,
      { parse_mode: 'Markdown' }
    )
    return
  }

  if (product.delivery === 'manual_gmail') {
    live.status = 'waiting_gmail'
    saveDB(db)
    await bot.telegram.sendMessage(
      live.userId,
      `💗 *PAYMENT CONFIRMED!*\n\n` +
      `🧁 Canva Pro — \`${live.id}\`\n\n` +
      `📧 Please send the Gmail address you want us to invite.\n` +
      `Send it in this format:\n\n` +
      `\`GMAIL ${live.id} yourname@gmail.com\``,
      { parse_mode: 'Markdown' }
    )
    return
  }

  const stock = db.stock[product.id] || []
  const item = stock.shift()

  if (!item) {
    live.status = 'preparing'
    saveDB(db)
    await bot.telegram.sendMessage(
      live.userId,
      `💗 Payment confirmed for \`${live.id}\`.\n\n🌸 Your ${product.name} is being prepared. We will deliver it here as soon as stock is ready.`,
      { parse_mode: 'Markdown' }
    )
    return
  }

  live.status = 'delivered'
  live.deliveredAt = new Date().toISOString()
  live.deliveredEmail = item.email
  live.deliveredPassword = item.password
  saveDB(db)

  await deliverCredentials(live, item.email, item.password)
}

async function deliverCredentials(order, email, password) {
  await bot.telegram.sendMessage(
    order.userId,
    `💕 *YOUR ACCOUNT IS READY!* 💕\n\n` +
    `🧾 Order: \`${order.id}\`\n` +
    `📦 Product: *${order.productName}*\n` +
    `✅ Status: *Delivered*\n\n` +
    `📧 *EMAIL*\n\`${email}\`\n\n` +
    `🔐 *PASSWORD*\n\`${password}\`\n\n` +
    `💗 Please save your login details.\n` +
    `🌸 Thank you for ordering from Hyuna Store!`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📧 Show Email', `show_email:${order.id}`)],
        [Markup.button.callback('🔐 Show Password', `show_pass:${order.id}`)],
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

bot.action(/^received:(HYU-.+)$/, async (ctx) => {
  await ctx.answerCbQuery('Thank you! 💗')
  await ctx.reply('🌸 Thank you for confirming. Enjoy your order! 💕')
})

bot.action(/^show_email:(HYU-.+)$/, async (ctx) => {
  await ctx.answerCbQuery()
  const id = ctx.match[1]
  const db = loadDB()
  const order = db.orders.find(o => o.id === id && o.userId === ctx.from.id)
  if (!order || !order.deliveredEmail) return ctx.reply('Email not available.')
  await ctx.reply(`📧 \`${order.deliveredEmail}\``, { parse_mode: 'Markdown' })
})

bot.action(/^show_pass:(HYU-.+)$/, async (ctx) => {
  await ctx.answerCbQuery()
  const id = ctx.match[1]
  const db = loadDB()
  const order = db.orders.find(o => o.id === id && o.userId === ctx.from.id)
  if (!order || !order.deliveredPassword) return ctx.reply('Password not available.')
  await ctx.reply(`🔐 \`${order.deliveredPassword}\``, { parse_mode: 'Markdown' })
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
  order.deliveredEmail = email
  order.deliveredPassword = password
  saveDB(db)

  await deliverCredentials(order, email, password)
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
  const [, productId, email, ...passParts] = parts
  const password = passParts.join(' ')

  if (!['gemini', 'capcut'].includes(productId) || !email || !password) {
    return ctx.reply('Usage: /stockadd gemini|capcut email password')
  }

  const db = loadDB()
  db.stock[productId] = db.stock[productId] || []
  db.stock[productId].push({ email, password, addedAt: new Date().toISOString() })
  saveDB(db)

  await ctx.reply(`✅ Added 1 ${productId} stock. Total: ${db.stock[productId].length}`)
})

bot.command('orders', async (ctx) => {
  if (!isAdmin(ctx)) return
  const db = loadDB()
  const recent = db.orders.slice(-20).reverse()
  if (!recent.length) return ctx.reply('No orders yet.')

  const text = recent.map(o =>
    `${o.id} | ${o.productName} | ₱${o.price} | ${o.status} | ${o.userId}`
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
