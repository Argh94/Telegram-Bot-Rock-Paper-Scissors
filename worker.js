const TELEGRAM_TOKEN = 'TELEGRAM_TOKEN';
const BASE_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const emojiMap = {
    rock: '✊',
    paper: '✋',
    scissors: '✌️',
    win: '🏆',
    lose: '😞',
    draw: '🤝',
    game: '🎮',
    start: '🎉'
};

let gameData = {}; // ذخیره اطلاعات بازی برای هر کاربر
let timers = {}; // ذخیره تایمرهای بازی برای هر کاربر

// تابع برای ارسال درخواست به تلگرام
async function sendTelegramRequest(url, body) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return await response.json();
    } catch (error) {
        console.error("Error in sendTelegramRequest:", error);
        return { ok: false, description: error.message };
    }
}

// حذف پیام‌های قبلی
async function deletePreviousMessages(chatId, messageIds, api = sendTelegramRequest) {
    for (const messageId of messageIds) {
        const url = `${BASE_URL}/deleteMessage`;
        const result = await api(url, {
            chat_id: chatId,
            message_id: messageId
        });
        if (!result.ok) {
            console.error(`Failed to delete message ${messageId}:`, result.description);
        }
    }
}

// ارسال پیام با دکمه‌های inline
async function sendMessageWithButtons(chatId, text, buttons, api = sendTelegramRequest) {
    const url = `${BASE_URL}/sendMessage`;
    const result = await api(url, {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: buttons
        }
    });
    if (result.ok && result.result && result.result.message_id) {
        return result.result.message_id;
    } else {
        console.error("Error sending message:", result.description);
        return null;
    }
}

// ویرایش پیام با دکمه‌های inline
async function editMessageWithButtons(chatId, messageId, text, buttons, api = sendTelegramRequest) {
    const url = `${BASE_URL}/editMessageText`;
    const result = await api(url, {
        chat_id: chatId,
        message_id: messageId,
        text: text,
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: buttons
        }
    });
    return result.ok;
}

// انتخاب تصادفی ربات
function getBotChoice() {
    const choices = ['rock', 'paper', 'scissors'];
    return choices[Math.floor(Math.random() * choices.length)];
}

// پیام نتیجه بازی
function getResultMessage(playerChoice, botChoice) {
    if (playerChoice === botChoice) {
        return `مساوی شد! ${emojiMap['draw']}`;
    }
    if (
        (playerChoice === 'rock' && botChoice === 'scissors') ||
        (playerChoice === 'paper' && botChoice === 'rock') ||
        (playerChoice === 'scissors' && botChoice === 'paper')
    ) {
        return `شما برنده شدید! ${emojiMap['win']}`;
    }
    return `ربات برنده شد! ${emojiMap['lose']}`;
}

// به‌روزرسانی امتیازات بازی
function updateGameStats(gameState, resultMessage) {
    if (resultMessage.includes('شما برنده شدید')) {
        gameState.userWins += 1;
    } else if (resultMessage.includes('ربات برنده شد')) {
        gameState.botWins += 1;
    } else {
        gameState.draws += 1;
    }
}

// نتیجه نهایی بازی
function getFinalResult(gameState) {
    let resultMessage = `نتیجه بازی:\n\n`;
    resultMessage += `شما بردید: ${gameState.userWins} بار\n`;
    resultMessage += `ربات برد: ${gameState.botWins} بار\n`;
    resultMessage += `مساوی: ${gameState.draws} بار\n\n`;
    if (gameState.userWins > gameState.botWins) {
        resultMessage += `🎉 شما در مجموع برنده شدید! 🎉`;
    } else if (gameState.botWins > gameState.userWins) {
        resultMessage += `😞 ربات در مجموع برنده شد! 😞`;
    } else {
        resultMessage += `🤝 نتیجه نهایی مساوی شد! 🤝`;
    }
    return resultMessage;
}

// تایمر بی‌فعالی
function startInactivityTimer(chatId, callback, timeout = 60000) {
    if (timers[chatId]) {
        clearTimeout(timers[chatId]);
    }
    timers[chatId] = setTimeout(() => callback(chatId), timeout);
}

// پردازش درخواست‌های Webhook
async function handleWebhook(request) {
    const { method } = request;
    if (method === 'POST') {
        const body = await request.json();
        const message = body.message;
        const callbackQuery = body.callback_query;

        if (message) {
            const chatId = message.chat.id;
            const text = message.text;

            if (text && text.toLowerCase() === '/start') {
                if (gameData[chatId]) {
                    await sendMessageWithButtons(chatId, 'بازی شما هنوز در حال اجراست. ابتدا آن را تمام کنید یا با دکمه "شروع بازی جدید" بازی را متوقف کنید.');
                    return new Response('OK');
                }

                gameData[chatId] = {
                    roundsLeft: 0,
                    userWins: 0,
                    botWins: 0,
                    draws: 0,
                    messageIds: []
                };

                const messageId = await sendMessageWithButtons(chatId, '🎮 سلام! به بازی سنگ، کاغذ، قیچی خوش آمدید!\nلطفاً تعداد دست‌های بازی را انتخاب کنید: 🖐️✊✌️', [
                    [{ text: ' ۳ دست ', callback_data: '3' }, { text: ' ۶ دست ', callback_data: '6' }]
                ]);
                if (messageId) {
                    gameData[chatId].messageIds.push(messageId);
                }

                startInactivityTimer(chatId, async (chatId) => {
                    if (gameData[chatId]) {
                        delete gameData[chatId];
                        await sendMessageWithButtons(chatId, 'بازی شما به دلیل عدم فعالیت در 60 ثانیه به پایان رسید.');
                    }
                });

                return new Response('OK');
            }
        }

        if (callbackQuery) {
            const chatId = callbackQuery.message.chat.id;
            const selectedChoice = callbackQuery.data;

            if (!gameData[chatId]) {
                gameData[chatId] = {
                    roundsLeft: 0,
                    userWins: 0,
                    botWins: 0,
                    draws: 0,
                    messageIds: []
                };
            }

            let gameState = gameData[chatId];

            if (selectedChoice === 'restart') {
                if (gameData[chatId] && gameData[chatId].messageIds.length > 0) {
                    await deletePreviousMessages(chatId, gameData[chatId].messageIds);
                    gameData[chatId].messageIds = [];
                }

                gameData[chatId] = {
                    roundsLeft: 0,
                    userWins: 0,
                    botWins: 0,
                    draws: 0,
                    messageIds: []
                };

                await editMessageWithButtons(chatId, callbackQuery.message.message_id, '🎮 سلام! به بازی سنگ، کاغذ، قیچی خوش آمدید!\nلطفاً تعداد دست‌های بازی را انتخاب کنید: 🖐️✊✌️', [
                    [{ text: ' ۳ دست ', callback_data: '3' }, { text: ' ۶ دست ', callback_data: '6' }]
                ]);

                startInactivityTimer(chatId, async (chatId) => {
                    if (gameData[chatId]) {
                        delete gameData[chatId];
                        await sendMessageWithButtons(chatId, 'بازی شما به دلیل عدم فعالیت در 60 ثانیه به پایان رسید.');
                    }
                });

                return new Response('OK');
            }

            if (!isNaN(parseInt(selectedChoice))) {
                gameState.roundsLeft = parseInt(selectedChoice);

                await editMessageWithButtons(chatId, callbackQuery.message.message_id, `
تعداد دست‌های بازی: ${selectedChoice}
حالا انتخاب خود را انجام دهید:
`, [
                    [
                        { text: ' سنگ ✊ ', callback_data: 'rock' },
                        { text: ' کاغذ ✋ ', callback_data: 'paper' },
                        { text: ' قیچی ✌️ ', callback_data: 'scissors' }
                    ],
                    [
                        { text: 'بازگشت به منوی اصلی ⬅️', callback_data: 'back_to_main_menu' }
                    ]
                ]);

                startInactivityTimer(chatId, async (chatId) => {
                    if (gameData[chatId]) {
                        delete gameData[chatId];
                        await sendMessageWithButtons(chatId, 'بازی شما به دلیل عدم فعالیت در 60 ثانیه به پایان رسید.');
                    }
                });

                return new Response('OK');
            }

            const userChoice = selectedChoice;
            const botChoice = getBotChoice();
            const resultMessage = getResultMessage(userChoice, botChoice);
            updateGameStats(gameState, resultMessage);

            if (gameState.roundsLeft > 1) {
                gameState.roundsLeft -= 1;
                await editMessageWithButtons(chatId, callbackQuery.message.message_id, `
شما انتخاب کردید: ${userChoice} ${emojiMap[userChoice]} 
ربات انتخاب کرد: ${botChoice} ${emojiMap[botChoice]} 
${resultMessage}
دست‌های باقی‌مانده: ${gameState.roundsLeft}
`, [
                    [
                        { text: ' سنگ ✊ ', callback_data: 'rock' },
                        { text: ' کاغذ ✋ ', callback_data: 'paper' },
                        { text: ' قیچی ✌️ ', callback_data: 'scissors' }
                    ],
                    [
                        { text: 'بازگشت به منوی اصلی ⬅️', callback_data: 'back_to_main_menu' }
                    ]
                ]);

                startInactivityTimer(chatId, async (chatId) => {
                    if (gameData[chatId]) {
                        delete gameData[chatId];
                        await sendMessageWithButtons(chatId, 'بازی شما به دلیل عدم فعالیت در 60 ثانیه به پایان رسید.');
                    }
                });

                return new Response('OK');
            } else {
                const finalResult = getFinalResult(gameState);
                delete gameData[chatId];

                await editMessageWithButtons(chatId, callbackQuery.message.message_id, `
${finalResult}
`, [
                    [{ text: ' شروع بازی جدید ', callback_data: 'restart' }]
                ]);

                startInactivityTimer(chatId, async (chatId) => {
                    if (gameData[chatId]) {
                        delete gameData[chatId];
                        await sendMessageWithButtons(chatId, 'بازی شما به دلیل عدم فعالیت در 60 ثانیه به پایان رسید.');
                    }
                });

                return new Response('OK');
            }
        }
        return new Response('Bad Request', { status: 400 });
    }
    return new Response('OK', { status: 200 });
}

// Webhook Handler
addEventListener('fetch', event => {
    event.respondWith(handleWebhook(event.request));
});