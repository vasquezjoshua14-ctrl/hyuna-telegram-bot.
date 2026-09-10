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

Analyze payment receipt images.

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

const ADMIN_ID = Number(
  process.env.ADMIN_ID || 0
);

const CHANNEL_URL =
  process.env.CHANNEL_URL ||
  "https://t.me/YOUR_CHANNEL";

const CHANNEL_ID =
  process.env.CHANNEL_ID || "";


const ADMIN_USERNAME =
  process.env.ADMIN_USERNAME ||
  "YOUR_ADMIN_USERNAME";


const ADMIN_TG_LINK =
  `https://t.me/${ADMIN_USERNAME}`;


const GCASH_NAME =
  process.env.GCASH_NAME ||
  "GCash Account";


const GCASH_NUMBER =
  process.env.GCASH_NUMBER ||
  "09XXXXXXXXX";


if (!BOT_TOKEN) {
  throw new Error(
    "Missing BOT_TOKEN in .env"
  );
}


const bot = new Telegraf(
  BOT_TOKEN
);


// DATABASE FILE
const DB_FILE =
  path.join(
    __dirname,
    "db.json"
  );


const WELCOME_IMAGE =
  path.join(
    __dirname,
    "hyuna-welcome.png"
  );
const PRODUCTS = {

  gemini: {
    id: "gemini",
    emoji: "💫",
    name: "Gemini Pro / Flow",
    price: 100,
    details: [
      "1K Credits",
      "18 Months"
    ],
    note: "⚠️ No warranty after claim",
    deliveryType: "link"
  },


  capcut: {
    id: "capcut",
    emoji: "🎬",
    name: "CapCut Pro",
    price: 150,
    details: [
      "1 Month"
    ],
    note: "",
    deliveryType: "email_password"
  },


  chatgpt: {
    id: "chatgpt",
    emoji: "🤖",
    name: "ChatGPT Shared",
    price: 450,
    details: [
      "Shared account",
      "1 device only"
    ],
    note:
      "💬 Manual delivery - Message admin",
    deliveryType: "manual"
  },


  canva: {
    id: "canva",
    emoji: "🎨",
    name: "Canva Pro",
    price: 30,
    details: [
      "1 Month+",
      "Via invite"
    ],
    note:
      "📩 Gmail required for invite",
    deliveryType: "manual_invite"
  }

};



const pendingOrders = {};

const adminStockFlow = {};

const pendingReceiptOrders = {};



function loadDB() {

  if (!fs.existsSync(DB_FILE)) {

    const fresh = {

      orders: [],

      stock: [],

      users: []

    };


    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(
        fresh,
        null,
        2
      )
    );


    return fresh;

  }


  const raw =
    JSON.parse(
      fs.readFileSync(
        DB_FILE,
        "utf8"
      )
    );


  raw.orders =
    raw.orders || [];


  raw.stock =
    raw.stock || [];


  raw.users =
    raw.users || [];


  return raw;

}



function saveDB(db) {

  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(
      db,
      null,
      2
    )
  );

}



function getProductStockCount(productId) {

  const db = loadDB();

  return db.stock.filter(
    item =>
      item.productId === productId
  ).length;

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
      )
    ],
    [
      Markup.button.callback(
        "💸 Payment Guide",
        "payment_guide"
      ),
      Markup.button.url(
        "📢 Channel",
        CHANNEL_URL
      )
    ],
    [
      Markup.button.url(
        "💬 Contact Admin",
        ADMIN_TG_LINK
      )
    ]
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
        source: WELCOME_IMAGE
      },
      {
        caption,
        parse_mode: "Markdown",
        ...menuKeyboard()
      }
    );

  } else {

    await ctx.reply(
      caption,
      {
        parse_mode: "Markdown",
        ...menuKeyboard()
      }
    );

  }
}


bot.start(sendHome);

bot.command(
  "menu",
  sendHome
);


bot.action(
  "home",
  async (ctx) => {

    await ctx.answerCbQuery();

    await sendHome(ctx);

  }
);


bot.action(
  "products",
  async (ctx) => {

    await ctx.answerCbQuery();


    const geminiStock =
      getProductStockCount(
        "gemini"
      );


    const capcutStock =
      getProductStockCount(
        "capcut"
      );


    let text =
      "🌸✨ *HYUNA STORE — AVAILABLE PRODUCTS* ✨🌸\n" +
      "Choose your fave below 💗\n\n";


    for (
      const product
      of Object.values(PRODUCTS)
    ) {

      text +=
        `${product.emoji} *${product.name} — ₱${product.price}*\n`;


      for (
        const detail
        of product.details
      ) {

        text +=
          `✅ ${detail}\n`;

      }


      if (product.note) {

        text +=
          `${product.note}\n`;

      }


      text += "\n";

    }


    text +=
      "🌸 _Please read the product details before ordering._";


    await ctx.reply(
      text,
      {
        parse_mode: "Markdown",

        ...Markup.inlineKeyboard([

          [
            Markup.button.callback(
              `💫 Buy Gemini 👉 (${geminiStock})`,
              "buy:gemini"
            )
          ],

          [
            Markup.button.callback(
              `🎬 Buy CapCut 👉 (${capcutStock})`,
              "buy:capcut"
            )
          ],

          [
            Markup.button.callback(
              "🤖 Buy ChatGPT",
              "buy:chatgpt"
            )
          ],

          [
            Markup.button.callback(
              "🎨 Buy Canva",
              "buy:canva"
            )
          ],

          [
            Markup.button.callback(
              "⬅️ Back to Menu",
              "home"
            )
          ]

        ])

      }
    );

  }
);


bot.action(
  /^buy:(.+)$/,
  async (ctx) => {

    await ctx.answerCbQuery();


    const productId =
      ctx.match[1];


    const product =
      PRODUCTS[productId];


    if (!product) {

      return ctx.reply(
        "Product not found."
      );

    }


    /*
      Check stock BEFORE asking quantity
      for automatic-delivery products.
    */

    if (
      product.deliveryType === "link" ||
      product.deliveryType === "email_password"
    ) {

      const available =
        getProductStockCount(
          product.id
        );


      if (available <= 0) {

        return ctx.reply(
          `❌ ${product.name} is currently out of stock.`
        );

      }

    }


    pendingOrders[ctx.from.id] = {

      productId,

      createdAt:
        new Date().toISOString()

    };


    await ctx.reply(
      "🛒 Ilan ang order? (1-50)\n" +
      "Halimbawa: 5"
    );

  }
);
// ===============================
// ORDER QUANTITY + CREATE ORDER
// PART 4/6
// ===============================


bot.on(
  "text",
  async (ctx, next) => {


    if (
      ctx.message.text?.startsWith("/")
    ) {
      return next();
    }


    const pending =
      pendingOrders[ctx.from.id];


    if (!pending) {

      return next();

    }


    const quantity =
      Number(
        ctx.message.text.trim()
      );


    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 50
    ) {

      return ctx.reply(
        "❌ Invalid quantity. Enter 1-50."
      );

    }


    const product =
      PRODUCTS[pending.productId];


    if (!product) {

      delete pendingOrders[ctx.from.id];

      return ctx.reply(
        "❌ Product not found."
      );

    }



    const db =
      loadDB();



    if (
      product.deliveryType === "link" ||
      product.deliveryType === "email_password"
    ) {


      const available =
        db.stock.filter(
          item =>
            item.productId === product.id
        ).length;



      if (
        quantity > available
      ) {

        return ctx.reply(
          `❌ Not enough stock.\n\nAvailable: ${available}\nRequested: ${quantity}`
        );

      }

    }




    const order = {

      id:
        "HYU-" +
        Math.random()
          .toString(36)
          .slice(2,8)
          .toUpperCase(),


      userId:
        ctx.from.id,


      username:
        ctx.from.username || "",


      firstName:
        ctx.from.first_name || "",


      lastName:
        ctx.from.last_name || "",


      productId:
        product.id,


      productName:
        product.name,


      quantity,


      pricePerItem:
        product.price,


      totalPrice:
        product.price * quantity,


      status:
        "waiting_payment",


      createdAt:
        new Date().toISOString(),


      paymentExpiresAt:
        Date.now() +
        (10 * 60 * 1000),


      gmail:
        null,


      deliveredItems:
        []

    };



    db.orders.push(
      order
    );



    const userExists =
      db.users.find(
        user =>
          user.id === ctx.from.id
      );



    if (!userExists) {

      db.users.push({

        id:
          ctx.from.id,

        username:
          ctx.from.username || "",

        firstName:
          ctx.from.first_name || "",

        lastName:
          ctx.from.last_name || "",

        createdAt:
          new Date().toISOString()

      });

    }



    saveDB(db);



    delete pendingOrders[ctx.from.id];



    await ctx.reply(

      `🛒 *ORDER CREATED!*\n\n` +

      `${product.emoji} Product: *${product.name}*\n` +

      `📦 Quantity: *${quantity}*\n` +

      `💰 Price: *₱${product.price} each*\n` +

      `💵 Total: *₱${order.totalPrice}*\n\n` +

      `🧾 Order ID: \`${order.id}\`\n\n` +

      `⏳ Waiting for Payment`,

      {

        parse_mode:
          "Markdown",

        ...Markup.inlineKeyboard([

          [
            Markup.button.callback(
              "💸 Payment Guide",
              "payment_guide"
            )
          ],

          [
            Markup.button.callback(
              "❌ Cancel Order",
              `cancel:${order.id}`
            )
          ]

        ])

      }

    );



    if (ADMIN_ID) {

      await bot.telegram.sendMessage(

        ADMIN_ID,

        `🛒 New Order\n\n` +

        `Order: ${order.id}\n` +

        `Product: ${product.name}\n` +

        `Qty: ${quantity}\n` +

        `Total: ₱${order.totalPrice}\n` +

        `Buyer: @${order.username || "no_username"} (${order.userId})`

      ).catch(
        () => {}
      );

    }


  }
);
// ===============================
// PAYMENT GUIDE + MANUAL DELIVERY
// PART 5/6
// ===============================


bot.action(
  "payment_guide",
  async (ctx) => {

    await ctx.answerCbQuery();


    const db =
      loadDB();


    const order =
      db.orders
        .filter(
          o =>
            o.userId === ctx.from.id &&
            o.status === "waiting_payment"
        )
        .slice(-1)[0];



    let message =

      "💸 *PAYMENT GUIDE*\n\n" +

      `📱 GCash Name: ${GCASH_NAME}\n` +

      `💵 GCash Number: ${GCASH_NUMBER}\n\n` +

      "Send payment then press Send Receipt.\n\n";



    if (order) {

      message =

        `🧾 *PAYMENT SUMMARY*\n\n` +

        `Product: *${order.productName}*\n` +

        `Quantity: *${order.quantity}*\n` +

        `Total: *₱${order.totalPrice}*\n\n` +

        message;

    }



    await ctx.reply(

      message,

      {

        parse_mode:
          "Markdown",

        ...Markup.inlineKeyboard([

          [

            Markup.button.callback(

              "📸 Send Receipt",

              order
                ? `send_receipt:${order.id}`
                : "home"

            )

          ]

        ])

      }

    );

  }
);





// CHATGPT MANUAL DELIVERY
// After payment confirmed

async function sendManualDelivery(order) {


  await bot.telegram.sendMessage(

    order.userId,


    `✅ Payment confirmed!\n\n` +

    `🧾 Order: ${order.id}\n\n` +

    `🤖 Your ChatGPT account is being prepared manually.\n\n` +

    `💬 Message admin for delivery:\n` +

    `${ADMIN_TG_LINK}`

  );

}





// CANVA MANUAL INVITE

async function requestCanvaGmail(order) {


  const gmailLink =

    `https://mail.google.com/mail/?view=cm&fs=1` +

    `&su=Canva%20Invite%20${order.id}` +

    `&body=Order%20ID:%20${order.id}%0A%0AMy%20Gmail:%20`;



    await bot.telegram.sendMessage(
    order.userId,

    `🎨 Payment confirmed!\n\n` +
    `🧾 Order: ${order.id}\n\n` +
    `Please send your Gmail for Canva invite.\n\n` +
    `After sending, wait for admin invite.`,

    {
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.url(
            "📩 Open Gmail",
            gmailLink
          )
        ]
      ])
    }
  );

}
// ===============================
// STOCK DELIVERY + UNIVERSAL ACCOUNT
// PART 6/6
// ===============================



// ADMIN ADD ACCOUNT FLOW
// Format:
// email | password


bot.command(
  "addaccount",
  async (ctx) => {


    if (
      Number(ctx.from.id) !== ADMIN_ID
    ) {

      return ctx.reply(
        "❌ Unauthorized"
      );

    }


    adminStockFlow[ctx.from.id] = {

      type:
        "email_password"

    };


    await ctx.reply(

      "Send email | password\n\n" +

      "Example:\n" +

      "t35v56f3oy@uberip.com | AITOOLS123"

    );


  }
);





bot.on(
  "text",
  async (ctx, next) => {


    const flow =
      adminStockFlow[ctx.from.id];


    if (!flow) {

      return next();

    }



    if (
      flow.type === "email_password"
    ) {


      const lines =
        ctx.message.text
          .split("\n")
          .map(
            x => x.trim()
          )
          .filter(Boolean);



      const db =
        loadDB();



      let added = 0;



      for (
        const line of lines
      ) {


        const data =
          line
            .split("|")
            .map(
              x => x.trim()
            );



        if (
          data.length === 2 &&
          data[0].includes("@")
        ) {


          db.stock.push({

            productId:
              "capcut",

            type:
              "email_password",

            email:
              data[0],

            password:
              data[1],

            addedAt:
              new Date()
                .toISOString()

          });



          added++;

        }

      }



      saveDB(db);



      delete adminStockFlow[
        ctx.from.id
      ];



      return ctx.reply(

        `✅ Added ${added} account stock.`

      );

    }



    return next();

  }
);






// DELIVERY FUNCTION


async function confirmPayment(order) {


  const db =
    loadDB();


  const fresh =
    db.orders.find(
      o =>
        o.id === order.id
    );


  if (!fresh) {

    return;

  }



  const product =
    PRODUCTS[
      fresh.productId
    ];




  // CHATGPT MANUAL

  if (
    product.deliveryType === "manual"
  ) {


    fresh.status =
      "preparing";


    saveDB(db);



    return sendManualDelivery(
      fresh
    );


  }




  // CANVA

  if (
    product.deliveryType ===
    "manual_invite"
  ) {


    fresh.status =
      "waiting_gmail";


    saveDB(db);



    return requestCanvaGmail(
      fresh
    );


  }





  // STOCK DELIVERY


  const items =

    db.stock.filter(

      s =>
        s.productId ===
        fresh.productId

    )
    .slice(
      0,
      fresh.quantity
    );



  if (
    items.length <
    fresh.quantity
  ) {


    fresh.status =
      "preparing";


    saveDB(db);


    return;

  }




  fresh.deliveredItems =
    items;



  db.stock =
    db.stock.filter(

      item =>
        !items.includes(item)

    );



  fresh.status =
    "delivered";



  fresh.deliveredAt =
    new Date()
      .toISOString();



  saveDB(db);



  let delivery =

    `✅ PAYMENT CONFIRMED!\n\n` +

    `🧾 Order: ${fresh.id}\n\n`;




  for (
    const item of items
  ) {


    if (
      item.link
    ) {

      delivery +=

        `🔗 Link:\n${item.link}\n\n`;

    }



    if (
      item.type ===
      "email_password"
    ) {

      delivery +=

        `📧 Email: ${item.email}\n` +

        `🔑 Password: ${item.password}\n\n`;

    }

  }




  await bot.telegram.sendMessage(

    fresh.userId,

    delivery

  );


}





bot.catch(
  (err) => {

    console.error(
      "BOT ERROR:",
      err
    );

  }
);



bot.launch();



console.log(
  "🌸 Hyuna Bot Started"
);
