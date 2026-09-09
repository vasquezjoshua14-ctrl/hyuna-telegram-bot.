const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function checkPaymentReceipt(imageUrl) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
You are a payment receipt verification AI.

Analyze payment receipt images from GCash, Maya, MariBank,
banks, and other e-wallets.

Do not require one fixed receipt format.
Do not reject a receipt only because a recipient name is masked,
abbreviated, contains dots, spaces, or has a different display format.

Determine whether the image appears to show a completed payment transaction.

Extract:
- payment method
- recipient
- recipient number if visible
- amount
- transaction date and time
- reference number / transaction ID
- transaction status

IMPORTANT:
- Never invent information that cannot be read.
- Use an empty string for unreadable/missing fields.
- "confidence" must be a number from 0 to 1.
- "is_receipt" should be true only when the image appears to be a payment receipt.
- For datetime, return ISO 8601 including timezone when you can determine it.
- If you are uncertain, lower the confidence instead of inventing data.

Return JSON only:

{
  "is_receipt": true,
  "payment_method": "",
  "recipient": "",
  "recipient_number": "",
  "amount": "",
  "datetime": "",
  "reference_number": "",
  "status": "",
  "confidence": 0
}
`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analyze this payment receipt.",
          },
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
            },
          },
        ],
      },
    ],
  });

  return response.choices[0].message.content;
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID || 0);
const CHANNEL_URL = process.env.CHANNEL_URL || "https://t.me/YOUR_CHANNEL";
const CHANNEL_ID = process.env.CHANNEL_ID || "";
const ADMIN_USERNAME =
  process.env.ADMIN_USERNAME || "YOUR_ADMIN_USERNAME";

const GCASH_NAME = process.env.GCASH_NAME || "GCash Account";
const GCASH_NUMBER = process.env.GCASH_NUMBER || "09XXXXXXXXX";

if (!BOT_TOKEN) throw new Error("Missing BOT_TOKEN in .env");

const bot = new Telegraf(BOT_TOKEN);

const DB_FILE = path.join(__dirname, "db.json");
const WELCOME_IMAGE = path.join(__dirname, "hyuna-welcome.png");

const PRODUCTS = {
  gemini: {
    id: "gemini",
    emoji: "🌷",
    name: "Gemini Pro / Flow",
    price: 100,
    details: ["1K Credits", "18 Months"],
    note: "⚠️ No warranty after claim",
    deliveryType: "link",
  },

  capcut: {
    id: "capcut",
    emoji: "🎀",
    name: "CapCut Pro",
    price: 150,
    details: ["1 Month"],
    note: "",
    deliveryType: "email_password",
  },
      chatgpt: {
    id: "chatgpt",
    emoji: "💕",
    name: "ChatGPT Shared",
    price: 450,
    details: [
      "Shared by 4 persons",
      "1 device only",
      "Stable account",
    ],
    note: "🛡 Full warranty • Manual account delivery up to 12 hours",
    deliveryType: "manual",
  },

  canva: {
    id: "canva",
    emoji: "🧁",
    name: "Canva Pro",
    price: 30,
    details: [
      "1 Month+",
      "Via invite",
    ],
    note: "📧 Send Gmail after payment • Manual delivery",
    deliveryType: "manual_invite",
  },
};

const pendingOrders = {};
const adminStockFlow = {};
const adminDelStockFlow = {};
const pendingReceiptOrders = {};

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const fresh = {
      orders: [],
      stock: [],
      users: [],
    };

    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(fresh, null, 2)
    );

    return fresh;
  }

  const raw = JSON.parse(
    fs.readFileSync(DB_FILE, "utf8")
  );

  if (raw.stock && !Array.isArray(raw.stock)) {
    const unified = [];

    for (const [pid, items] of Object.entries(raw.stock)) {
      if (!Array.isArray(items)) continue;

      for (const it of items) {
        if (!it || typeof it !== "object") continue;

        if (it.email && it.password) {
          unified.push({
            productId: pid,
            type: "email_password",
            email: it.email,
            password: it.password,
            addedAt:
              it.addedAt ||
              new Date().toISOString(),
          });
        } else if (it.link) {
          unified.push({
            productId: pid,
            type: "link",
            link: it.link,
            addedAt:
              it.addedAt ||
              new Date().toISOString(),
          });
        }
      }
    }

    raw.stock = unified;

    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(raw, null, 2)
    );
  }

  raw.stock = raw.stock || [];
  raw.orders = raw.orders || [];
  raw.users = raw.users || [];

  return raw;
}

function saveDB(db) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(db, null, 2)
  );
}

async function notifyAllUsers(message) {
  const db = loadDB();

  for (const user of db.users) {
    await bot.telegram
      .sendMessage(user.id, message)
      .catch(() => {});
  }

  if (CHANNEL_ID) {
    await bot.telegram
      .sendMessage(CHANNEL_ID, message)
      .catch(() => {});
  }
}

function orderId() {
  const part = Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase();

  return `HYU-${part}`;
}

function isAdmin(ctx) {
  const userId = Number(ctx.from?.id);

  const isAllowed =
    userId === ADMIN_ID;

  return isAllowed;
}

function normalizeReference(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim();
}

function normalizePhone(value) {
  return String(value || "")
    .replace(/\D/g, "");
}

function parseReceiptAmount(value) {
  const cleaned = String(value ?? "")
    .replace(/,/g, "")
    .replace(/[^0-9.-]/g, "");

  if (!cleaned) return NaN;

  return Number(cleaned);
}
function menuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        "🛍 Products",
        "products"
      ),
      Markup.button.callback(
        "📦 My Orders",
        "my_orders"
      ),
    ],
    [
      Markup.button.callback(
        "💳 Payment Guide",
        "payment_guide"
      ),
      Markup.button.url(
        "📢 Channel",
        CHANNEL_URL
      ),
    ],
    [
      Markup.button.url(
        "📩 Contact Admin",
        `https://t.me/${ADMIN_USERNAME}`
      ),
    ],
  ]);
}

async function sendHome(ctx) {
  const caption =
    "🌸 *Welcome to Hyuna Store!* 🌸\n" +
    "Your cute & trusted digital shop 💗\n\n" +
    "Choose an option below:";

  if (fs.existsSync(WELCOME_IMAGE)) {
    await ctx.replyWithPhoto(
      {
        source: WELCOME_IMAGE,
      },
      {
        caption,
        parse_mode: "Markdown",
        ...menuKeyboard(),
      }
    );
  } else {
    await ctx.reply(caption, {
      parse_mode: "Markdown",
      ...menuKeyboard(),
    });
  }
}

bot.start(sendHome);
bot.command("menu", sendHome);

bot.action("products", async (ctx) => {
  await ctx.answerCbQuery();

  let text =
    "🌸✨ *HYUNA STORE — AVAILABLE PRODUCTS* ✨🌸\n" +
    "Choose your fave below 💗\n\n";

  for (const p of Object.values(PRODUCTS)) {
    text += `${p.emoji} *${p.name} — ₱${p.price}*\n`;

    for (const d of p.details) {
      text += `✦ ${d}\n`;
    }

    if (p.note) {
      text += `${p.note}\n`;
    }

    text += "\n";
  }

  text +=
    "🌸 _Please read the product details before ordering._";

  await ctx.reply(text, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "🌷 Buy Gemini",
          "buy:gemini"
        ),
      ],
      [
        Markup.button.callback(
          "🎀 Buy CapCut",
          "buy:capcut"
        ),
      ],
      [
        Markup.button.callback(
          "💕 Buy ChatGPT",
          "buy:chatgpt"
        ),
      ],
      [
        Markup.button.callback(
          "🧁 Buy Canva",
          "buy:canva"
        ),
      ],
      [
        Markup.button.callback(
          "⬅️ Back to Menu",
          "home"
        ),
      ],
    ]),
  });
});

bot.action("home", async (ctx) => {
  await ctx.answerCbQuery();
  await sendHome(ctx);
});

bot.action(/^buy:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const productId = ctx.match[1];

  const product =
    PRODUCTS[productId];

  if (!product) {
    return ctx.reply(
      "Product not found."
    );
  }

  pendingOrders[ctx.from.id] = {
    productId,
    createdAt:
      new Date().toISOString(),
  };

  await ctx.reply(
    "🛒 Ilan ang order? (1-50)\nHalimbawa: 5"
  );
});
bot.action(/^cancel:(HYU-.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const id = ctx.match[1];

  const db = loadDB();

  const order = db.orders.find(
    (o) =>
      o.id === id &&
      o.userId === ctx.from.id
  );

  if (!order) {
    return ctx.reply("Order not found.");
  }

  if (order.status !== "waiting_payment") {
    return ctx.reply(
      "This order can no longer be cancelled."
    );
  }

  order.status = "cancelled";

  saveDB(db);

  delete pendingReceiptOrders[ctx.from.id];

  await ctx.reply(
    `❌ Order \`${id}\` cancelled.`,
    {
      parse_mode: "Markdown",
    }
  );
});


bot.action("payment_guide", async (ctx) => {
  await ctx.answerCbQuery();

  const db = loadDB();

  const order = db.orders
    .filter(
      (o) =>
        o.userId === ctx.from.id &&
        o.status === "waiting_payment"
    )
    .slice(-1)[0];

  let caption =
    "💳 *PAYMENT GUIDE* 🌸\n\n" +
    `📱 GCash Name: ${GCASH_NAME}\n` +
    `💰 GCash Number: ${GCASH_NUMBER}\n\n` +
    "Scan the QR code to pay.\n\n" +
    "💗 Keep your Order ID for reference.\n\n";

  if (order) {
    caption =
      `🧾 *PAYMENT SUMMARY*\n\n` +
      `Product: *${order.productName}*\n` +
      `Quantity: *${order.quantity}*\n` +
      `Price: *₱${order.pricePerItem} each*\n` +
      `Total: *₱${order.totalPrice}*\n\n` +
      caption;
  }

  await ctx.replyWithPhoto(
    {
      source:
        "./GCash-MyQR-08092026123724.PNG.jpg",
    },
    {
      caption,
      parse_mode: "Markdown",
      ...(order
        ? Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "📸 Send Receipt",
                `send_receipt:${order.id}`
              ),
            ],
          ])
        : {}),
    }
  );
});


bot.action(
  /^send_receipt:(HYU-.+)$/,
  async (ctx) => {
    await ctx.answerCbQuery();

    const id = ctx.match[1];

    const db = loadDB();

    const order = db.orders.find(
      (o) =>
        o.id === id &&
        o.userId === ctx.from.id
    );

    if (!order) {
      return ctx.reply(
        "Order not found."
      );
    }

    if (order.status !== "waiting_payment") {
      return ctx.reply(
        "This order is no longer waiting for payment."
      );
    }

    pendingReceiptOrders[ctx.from.id] = id;

    await ctx.reply(
      `📸 Please send your payment receipt screenshot here.\n\n` +
      `🧾 Order ID: \`${id}\`\n\n` +
      `🤖 Your receipt will be checked automatically.`,
      {
        parse_mode: "Markdown",
      }
    );
  }
);
async function processReceiptMedia(ctx, media) {
  const id = pendingReceiptOrders[ctx.from.id];

  if (!id) return false;

  const db = loadDB();

  const order = db.orders.find(
    (o) =>
      o.id === id &&
      o.userId === ctx.from.id
  );

  if (!order) {
    delete pendingReceiptOrders[ctx.from.id];
    return true;
  }

  let receiptData = null;

  try {
    const fileLink =
      await bot.telegram.getFileLink(
        media.fileId
      );

    const receiptCheck =
      await checkPaymentReceipt(
        fileLink.href
      );

    const cleaned =
      String(receiptCheck || "")
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

    receiptData = JSON.parse(cleaned);

  } catch (error) {
    console.error(
      "Receipt AI verification error:",
      error
    );
  }


  let receiptTimeValid = false;

  if (receiptData?.datetime) {
    const receiptDate =
      new Date(receiptData.datetime);

    if (
      Number.isFinite(
        receiptDate.getTime()
      )
    ) {

      const nowPH =
        new Date(
          new Date().toLocaleString(
            "en-US",
            {
              timeZone:
                "Asia/Manila",
            }
          )
        );

      const receiptPH =
        new Date(
          receiptDate.toLocaleString(
            "en-US",
            {
              timeZone:
                "Asia/Manila",
            }
          )
        );

      const ageMs =
        nowPH - receiptPH;

      receiptTimeValid =
        ageMs >= 0 &&
        ageMs <=
          10 * 60 * 1000;
    }
  }


  order.receipt = {
    fileId: media.fileId,
    reference:
      receiptData?.reference_number || "",
    amount:
      receiptData?.amount || "",
    datetime:
      receiptData?.datetime || "",
  };


  if (receiptTimeValid) {

    order.status = "paid";

    order.receiptStatus =
      "verified";

    saveDB(db);

    await ctx.reply(
      "✅ Payment verified automatically! Your order is now processing."
    );

    await confirmPayment(order);

    return true;
  }


  order.receiptStatus =
    "pending_verification";

  saveDB(db);

  await ctx.reply(
    "⏳ Receipt received. Waiting for admin verification."
  );


  if (ADMIN_ID) {

    await bot.telegram.sendPhoto(
      ADMIN_ID,
      media.fileId,
      {
        caption:
          `🧾 FOR MANUAL VERIFICATION\n\n` +
          `Order: ${id}\n` +
          `Product: ${order.productName}\n` +
          `AI date/time: ${receiptData?.datetime || "Unreadable"} (Philippine Time)`,
      }
    );
  }

  return true;
}


bot.on("photo", async (ctx, next) => {

  const photo =
    ctx.message.photo[
      ctx.message.photo.length - 1
    ];

  const handled =
    await processReceiptMedia(
      ctx,
      {
        type: "photo",
        fileId: photo.file_id,
      }
    );

  if (!handled) {
    return next();
  }
});


bot.on("document", async (ctx, next) => {

  const document =
    ctx.message.document;

  const handled =
    await processReceiptMedia(
      ctx,
      {
        type: "document",
        fileId: document.file_id,
      }
    );

  if (!handled) {
    return next();
  }
});


bot.catch((err) => {
  console.error(
    "BOT ERROR:",
    err
  );
});


bot.launch();

console.log(
  "🌸 Hyuna Store Bot Started"
);


process.once(
  "SIGINT",
  () => bot.stop("SIGINT")
);

process.once(
  "SIGTERM",
  () => bot.stop("SIGTERM")
);
