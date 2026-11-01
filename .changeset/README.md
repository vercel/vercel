<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="theme-color" content="#4C1D95">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <title>Kotak Hadiah Misteri</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        * { -webkit-tap-highlight-color: transparent; }
        body { overflow-x: hidden; }
        .box-hover:hover { transform: scale(1.05) translateY(-8px); transition: all 0.5s; }
        .box-hover:active { transform: scale(0.95); }
        .box-selected { transform: scale(1.1) rotate(6deg); transition: all 0.5s; }
        .box-opened { opacity: 0.3; transform: scale(0.9); cursor: not-allowed; }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        .fade-in { animation: fadeIn 0.5s ease-out; }
        @keyframes bounce { 0%, 100% { transform: translateY(-5px); } 50% { transform: translateY(5px); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 0%, 50%, 100% { opacity: 1; } 25%, 75% { opacity: 0.3; } }
        @keyframes glow { 0%, 100% { box-shadow: 0 0 20px rgba(251, 191, 36, 0.5), 0 0 40px rgba(251, 191, 36, 0.3); } 50% { box-shadow: 0 0 40px rgba(251, 191, 36, 0.8), 0 0 80px rgba(251, 191, 36, 0.5); } }
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
        .animate-bounce { animation: bounce 1s infinite; }
        .animate-pulse { animation: pulse 2s infinite; }
        .animate-spin { animation: spin 3s linear infinite; }
        .animate-blink { animation: blink 1.5s infinite; }
        .animate-glow { animation: glow 2s infinite; }
        .animate-float { animation: float 3s ease-in-out infinite; }
        button { -webkit-touch-callout: none; user-select: none; }
        input { font-size: 16px !important; }
    </style>
</head>
<body class="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900">
    
    <div id="bg-stars"></div>
    <div id="app" class="min-h-screen flex items-center justify-center p-4 relative z-10"></div>
    
    <a href="https://static.zdassets.com/web_widget/latest/liveChat.html?v=10#key=https://app.chaport.com&settings=JTdCJTIyd2ViV2lkZ2V0JTIyJTNBJTdCJTIyY2hhdCUyMiUzQSU3QiUyMnRpdGxlJTIyJTNBbnVsbCUyQyUyMm1lbnVPcHRpb25zJTIyJTNBJTdCJTIyZW1haWxUcmFuc2NyaXB0JTIyJTNBdHJ1ZSU3RCUyQyUyMmRlcGFydG1lbnRzJTIyJTNBJTdCJTdEJTJDJTIycHJlY2hhdEZvcm0lMjIlM0ElN0IlMjJkZXBhcnRtZW50TGFiZWwlMjIlM0FudWxsJTJDJTIyZ3JlZXRpbmclMjIlM0FudWxsJTdEJTJDJTIyb2ZmbGluZUZvcm0lMjIlM0ElN0IlMjJncmVldGluZyUyMiUzQW51bGwlN0QlMkMlMjJjb25jaWVyZ2UlMjIlM0ElN0IlMjJhdmF0YXJQYXRoJTIyJTNBbnVsbCUyQyUyMm5hbWUlMjIlM0FudWxsJTJDJTIydGl0bGUlMjIlM0FudWxsJTdEJTdEJTJDJTIyY29sb3IlMjIlM0ElN0IlMjJhcnRpY2xlTGlua3MlMjIlM0ElMjIlMjIlMkMlMjJidXR0b24lMjIlM0ElMjIlMjIlMkMlMjJoZWFkZXIlMjIlM0ElMjIlMjIlMkMlMjJsYXVuY2hlciUyMiUzQSUyMiUyMiUyQyUyMmxhdW5jaGVyVGV4dCUyMiUzQSUyMiUyMiUyQyUyMnJlc3VsdExpc3RzJTIyJTNBJTIyJTIyJTJDJTIydGhlbWUlMjIlM0FudWxsJTdEJTdEJTdE&&locale=id-id&title=Widget%20Web%20Percakapan%20Langsung" 
       target="_blank"
       id="liveChatBtn"
       class="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full shadow-2xl flex items-center justify-center text-white hover:from-green-600 hover:to-emerald-700 transition-all duration-300 hover:scale-110 active:scale-95"
       style="animation: pulse 2s infinite;">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7 sm:w-8 sm:h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        <span class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
        <span class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
    </a>

    <script>
        var emojis = {
            gift: String.fromCodePoint(0x1F381),
            money1: String.fromCodePoint(0x1F4B5),
            money2: String.fromCodePoint(0x1F4B8),
            money3: String.fromCodePoint(0x1F4B0),
            party1: String.fromCodePoint(0x1F389),
            party2: String.fromCodePoint(0x1F38A),
            star: String.fromCodePoint(0x2B50),
            sparkle: String.fromCodePoint(0x2728),
            check: String.fromCodePoint(0x2713),
            game: String.fromCodePoint(0x1F3AE),
            wave: String.fromCodePoint(0x1F44B),
            back: String.fromCodePoint(0x2190),
            refresh: String.fromCodePoint(0x1F501)
        };
        
        var prizes = [
            { id: 1, title: "Rp 50.000", content: "SCREENSHOT & KIRIM BUKTI KE LIVECHAT", category: "Uang Tunai", icon: emojis.money1, color: "from-green-400 to-emerald-500" },
            { id: 2, title: "Rp 75.000", content: "SCREENSHOT & KIRIM BUKTI KE LIVECHAT", category: "Uang Tunai", icon: emojis.money1, color: "from-green-500 to-emerald-600" },
            { id: 3, title: "Rp 100.000", content: "SCREENSHOT & KIRIM BUKTI KE LIVECHAT", category: "Uang Tunai", icon: emojis.money1, color: "from-green-600 to-teal-600" },
            { id: 4, title: "Rp 150.000", content: "SCREENSHOT & KIRIM BUKTI KE LIVECHAT", category: "Uang Tunai", icon: emojis.money2, color: "from-blue-500 to-cyan-500" },
            { id: 5, title: "Rp 200.000", content: "SCREENSHOT & KIRIM BUKTI KE LIVECHAT", category: "Uang Tunai", icon: emojis.money2, color: "from-blue-600 to-cyan-600" },
            { id: 6, title: "Rp 250.000", content: "SCREENSHOT & KIRIM BUKTI KE LIVECHAT", category: "Uang Tunai", icon: emojis.money3, color: "from-purple-500 to-pink-500" },
            { id: 7, title: "Rp 300.000", content: "SCREENSHOT & KIRIM BUKTI KE LIVECHAT", category: "Hadiah Spesial", icon: emojis.money3, color: "from-yellow-400 to-amber-500" },
            { id: 8, title: "Rp 350.000", content: "SCREENSHOT & KIRIM BUKTI KE LIVECHAT", category: "Grand Prize", icon: emojis.money3, color: "from-indigo-600 to-purple-700" }
        ];
        
        var state = {
            showWelcome: true,
            userId: '',
            isLoggedIn: false,
            shuffledPrizes: [],
            openedBoxes: [],
            selectedBox: null,
            revealedPrize: null,
            showAllPrizes: false,
            isAnimating: false
        };

        function shuffle(arr) {
            var array = arr.slice();
            for (var i = array.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = array[i];
                array[i] = array[j];
                array[j] = temp;
            }
            return array;
        }

        function el(tag, className, content) {
            var element = document.createElement(tag);
            if (className) element.className = className;
            if (content) element.innerHTML = content;
            return element;
        }

        function renderBg() {
            var bg = document.getElementById('bg-stars');
            bg.innerHTML = '<div class="absolute top-20 left-10 text-yellow-300 opacity-20 text-4xl animate-pulse">' + emojis.star + '</div>' +
                '<div class="absolute top-40 right-20 text-purple-300 opacity-20 text-5xl animate-pulse">' + String.fromCodePoint(0x1F319) + '</div>' +
                '<div class="absolute bottom-20 left-1/4 text-pink-300 opacity-20 text-4xl animate-pulse">' + String.fromCodePoint(0x26A1) + '</div>' +
                '<div class="absolute bottom-40 right-1/3 text-blue-300 opacity-20 text-4xl animate-pulse">' + emojis.sparkle + '</div>';
        }

        function render() {
            var app = document.getElementById('app');
            app.innerHTML = '';
            
            if (state.showWelcome) {
                var container = el('div', 'max-w-2xl w-full text-center relative z-10 px-4');
                container.innerHTML = '<div class="mb-6 sm:mb-8">' +
                    '<div class="inline-block bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 p-1 rounded-3xl animate-glow mb-4">' +
                    '<div class="bg-gradient-to-br from-purple-900 to-indigo-900 px-6 sm:px-8 md:px-12 py-3 sm:py-4 md:py-6 rounded-3xl">' +
                    '<h1 class="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-black text-yellow-400 animate-blink" style="text-shadow: 0 0 30px rgba(251, 191, 36, 0.8), 0 0 60px rgba(251, 191, 36, 0.5);">WADAH4D</h1>' +
                    '</div></div></div>' +
                    '<div class="mb-6 animate-float"><div class="text-6xl sm:text-7xl md:text-8xl mb-3 filter drop-shadow-2xl">' + emojis.gift + '</div>' +
                    '<h2 class="text-3xl sm:text-4xl md:text-5xl font-black text-yellow-400 mb-2" style="text-shadow: 0 0 20px rgba(251, 191, 36, 0.5);">MYSTERY BOX</h2></div>' +
                    '<div class="max-w-md mx-auto bg-gradient-to-br from-yellow-500/20 to-orange-500/20 backdrop-blur-lg rounded-3xl p-6 sm:p-8 shadow-2xl border-2 border-yellow-400/50 mb-6 animate-pulse">' +
                    '<p class="text-white text-base sm:text-lg font-bold mb-2">' + emojis.gift + ' Selamat Datang di Mystery Box ' + emojis.gift + '</p>' +
                    '<p class="text-yellow-200 text-sm mb-3">Claim Sekarang & Masukkan UserID  		ID</p>' +
                 '<p class="text-white/80 text-xs">Menangkan Hadiah Fantastis!</p></div>' +
                 '<button id="startBtn" class="block w-full max-w-md mx-auto px-8 sm:px-10 		py-4 sm:py-5 bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 text-		black font-black rounded-full hover:from-yellow-500 hover:via-orange-600 		hover:to-red-600 active:scale-95 transition-all duration-300 shadow-2xl 		hover:shadow-yellow-500/50 text-lg sm:text-xl animate-pulse" style="box-shadow: 		0 10px 40px rgba(251, 191, 36, 0.5);">' + String.fromCodePoint(0x1F680) + ' 		CLAIM SEKARANG</button>';
                
                app.appendChild(container);
                
                document.getElementById('startBtn').onclick = function() {
                    state.showWelcome = false;
                    render();
                };
                return;
            }
            
            if (!state.isLoggedIn) {
                var container = el('div', 'max-w-6xl w-full text-center relative z-10 px-4');
                container.innerHTML = '<h1 class="text-3xl sm:text-4xl md:text-6xl font-bold text-white mb-4">' + emojis.gift + ' Kotak Hadiah Misteri ' + emojis.gift + '</h1>' +
                    '<p class="text-purple-200 mb-6 sm:mb-8 text-base sm:text-lg">Masukkan User ID Anda untuk mulai bermain! ' + emojis.sparkle + '</p>' +
                    '<div class="max-w-md mx-auto bg-white/10 backdrop-blur-lg rounded-3xl p-6 sm:p-8 shadow-2xl border-2 border-white/20">' +
                    '<label class="block text-white text-base sm:text-lg font-semibold mb-4 text-left">User ID:</label>' +
                    '<input type="text" id="userInput" placeholder="Masukkan User ID Anda" class="w-full px-4 sm:px-6 py-3 sm:py-4 rounded-full text-center text-base sm:text-lg font-semibold bg-white text-purple-700 placeholder-purple-300 focus:outline-none focus:ring-4 focus:ring-yellow-300 transition-all" maxlength="50"/>' +
                    '<button id="loginBtn" class="w-full mt-6 px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold rounded-full hover:from-yellow-500 hover:to-orange-600 active:scale-95 transition-all duration-300 shadow-xl text-base sm:text-lg">' + emojis.game + ' Mulai Bermain</button>' +
                    '<p class="text-white/60 text-xs sm:text-sm mt-4">* User ID akan digunakan untuk identifikasi hadiah Anda</p></div>';
                
                app.appendChild(container);
                document.getElementById('loginBtn').onclick = handleLogin;
                document.getElementById('userInput').onkeypress = function(e) {
                    if (e.key === 'Enter') handleLogin();
                };
                return;
            }

            if (state.showAllPrizes) {
                var container = el('div', 'max-w-6xl w-full px-4');
                var html = '<h2 class="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-6 text-center">' + emojis.gift + ' Semua Hadiah Yang Tersedia ' + emojis.gift + '</h2>' +
                    '<p class="text-yellow-300 text-center mb-4 sm:mb-6 text-base sm:text-lg">Setiap kotak berisi hadiah yang berbeda!</p>' +
                    '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">';
                
                for (var i = 0; i < prizes.length; i++) {
                    html += '<div class="bg-gradient-to-br ' + prizes[i].color + ' rounded-2xl p-6 shadow-xl border-4 border-yellow-300/50">' +
                        '<div class="flex items-center justify-between mb-4">' +
                        '<span class="px-3 py-1 bg-white/30 text-white text-xs font-bold rounded-full">Hadiah Asli ' + emojis.check + '</span>' +
                        '<span class="text-5xl">' + prizes[i].icon + '</span></div>' +
                        '<h3 class="text-2xl font-bold text-white mb-2">' + prizes[i].title + '</h3>' +
                        '<p class="text-white/90 text-sm font-semibold">SCREENSHOT & KIRIM BUKTI KE LIVECHAT</p></div>';
                }
                
                html += '</div><button id="backBtn" class="px-6 sm:px-8 py-3 sm:py-4 bg-white text-purple-700 font-bold rounded-full hover:bg-yellow-300 hover:text-purple-900 active:scale-95 transition-all duration-300 shadow-xl text-base sm:text-lg mx-auto block">' + emojis.back + ' Kembali</button>';
                container.innerHTML = html;
                app.appendChild(container);
                document.getElementById('backBtn').onclick = function() { 
                    state.showAllPrizes = false;
                    if (!state.isLoggedIn) {
                        state.showWelcome = true;
                    }
                    render(); 
                };
                return;
            }

            if (state.revealedPrize) {
                var p = state.revealedPrize;
                var container = el('div', 'max-w-2xl w-full px-4');
                container.innerHTML = '<div class="bg-gradient-to-br ' + p.color + ' rounded-3xl p-6 sm:p-8 md:p-12 shadow-2xl border-4 border-yellow-300 relative fade-in">' +
                    '<div class="absolute top-0 left-1/4 text-yellow-300 text-3xl sm:text-4xl animate-bounce">' + emojis.party1 + '</div>' +
                    '<div class="absolute top-0 right-1/4 text-yellow-300 text-3xl sm:text-4xl animate-bounce">' + emojis.party2 + '</div>' +
                    '<div class="absolute bottom-1/4 left-1/3 text-white text-2xl sm:text-3xl animate-bounce">' + emojis.star + '</div>' +
                    '<div class="absolute top-1/2 right-1/4 text-white text-2xl sm:text-3xl animate-bounce">' + emojis.sparkle + '</div>' +
                    '<div class="mb-4 text-white/80 text-sm sm:text-base font-semibold relative z-10">User ID: ' + state.userId + '</div>' +
                    '<div class="flex items-center justify-between mb-4 sm:mb-6 relative z-10">' +
                    '<span class="px-3 sm:px-4 py-2 bg-white/30 rounded-full text-white text-xs sm:text-sm font-bold backdrop-blur-sm border-2 border-white/50 shadow-lg">' + p.category + '</span>' +
                    '<span class="text-5xl sm:text-6xl md:text-7xl drop-shadow-lg animate-bounce">' + p.icon + '</span></div>' +
                    '<h2 class="text-2xl sm:text-3xl md:text-5xl font-black text-white mb-4 sm:mb-6 drop-shadow-lg text-center relative z-10">' + p.title + '</h2>' +
                    '<div class="bg-white/20 rounded-2xl p-4 sm:p-6 mb-6 sm:mb-8 backdrop-blur-sm border-2 border-white/30 shadow-xl relative z-10">' +
                    '<p class="text-white text-base sm:text-lg md:text-xl leading-relaxed font-semibold text-center">' + p.content + '</p></div>' +
                    '<div class="relative z-10 text-center">' +
                    '<a href="https://wawasankini.com/" target="_blank" class="inline-block px-8 sm:px-10 py-4 sm:py-5 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black rounded-full hover:from-green-600 hover:to-emerald-700 active:scale-95 transition-all duration-300 shadow-2xl text-lg sm:text-xl">' + emojis.gift + ' Claim Hadiah Sekarang!</a></div>' +
                    '<p class="text-white/80 text-xs sm:text-sm mt-4 sm:mt-6 text-center relative z-10">* Klik tombol di atas untuk claim hadiah Anda</p></div>';
                app.appendChild(container);
                return;
            }

            var container = el('div', 'max-w-6xl w-full text-center px-4');
            var html = '<h1 class="text-3xl sm:text-4xl md:text-6xl font-bold text-white mb-2">' + emojis.gift + ' Kotak Hadiah Misteri ' + emojis.gift + '</h1>' +
                '<p class="text-yellow-300 mb-2 sm:mb-3 text-base sm:text-lg font-semibold">Selamat datang, <span class="text-white">' + state.userId + '</span>! ' + emojis.wave + '</p>' +
                '<p class="text-purple-200 mb-6 sm:mb-8 text-sm sm:text-base md:text-lg">Pilih salah satu kotak dan menangkan hadiah menarik! ' + emojis.sparkle + '</p>' +
                '<div id="boxGrid" class="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-6"></div>' +
                '<div class="flex gap-3 sm:gap-4 justify-center flex-wrap">';
            
            if (state.openedBoxes.length > 0) {
                html += '<button id="resetBtn" class="px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold rounded-full hover:from-pink-600 hover:to-purple-700 active:scale-95 transition-all duration-300 shadow-xl text-sm sm:text-base">' + emojis.refresh + ' Reset Semua Kotak</button>';
            }
            
            html += '<button id="showAllBtn" class="px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold rounded-full hover:from-yellow-500 hover:to-orange-600 active:scale-95 transition-all duration-300 shadow-xl text-sm sm:text-base">' + emojis.gift + ' Tampilkan Semua Hadiah</button></div>';
            
            container.innerHTML = html;
            app.appendChild(container);
            
            var grid = document.getElementById('boxGrid');
            for (var i = 0; i < state.shuffledPrizes.length; i++) {
                var prize = state.shuffledPrizes[i];
                var isOpened = state.openedBoxes.indexOf(prize.id) !== -1;
                var isSelected = state.selectedBox === prize.id && state.isAnimating;
                
                var box = el('div', 'relative transition-all duration-500 ' + (isOpened ? 'box-opened' : 'box-hover cursor-pointer') + (isSelected ? ' box-selected' : ''));
                box.setAttribute('data-id', prize.id);
                
                var inner = '<div class="aspect-square bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl shadow-2xl flex flex-col items-center justify-center relative overflow-hidden border-4 border-yellow-300">';
                if (isOpened) {
                    inner += '<div class="text-5xl md:text-6xl mb-2">' + prize.icon + '</div><div class="text-white font-bold text-xs md:text-sm px-2">' + prize.title + '</div>';
                } else {
                    inner += '<div class="text-5xl md:text-6xl text-white mb-2">' + emojis.gift + '</div><div class="text-white font-bold text-2xl">?</div>' +
                        '<div class="absolute top-2 right-2 text-yellow-200 text-xl animate-spin">' + emojis.sparkle + '</div>' +
                        '<div class="absolute bottom-2 left-2 text-yellow-200 text-xl animate-spin">' + emojis.sparkle + '</div>';
                }
                inner += '</div>';
                box.innerHTML = inner;
                
                (function(idx) {
                    box.onclick = function() { handleBoxClick(state.shuffledPrizes[idx]); };
                })(i);
                
                grid.appendChild(box);
            }
            
            if (document.getElementById('resetBtn')) {
                document.getElementById('resetBtn').onclick = handleReset;
            }
            document.getElementById('showAllBtn').onclick = function() { state.showAllPrizes = true; render(); };
        }

        function handleLogin() {
            var input = document.getElementById('userInput');
            var userId = input.value.trim();
            
            if (!userId) { alert('Silakan masukkan User ID Anda!'); return; }

            var usedIds = JSON.parse(localStorage.getItem('usedUserIds') || '[]');
            if (usedIds.indexOf(userId) !== -1) {
                alert('User ID "' + userId + '" sudah pernah digunakan! Silakan gunakan User ID yang berbeda.');
                input.value = '';
                return;
            }

            usedIds.push(userId);
            localStorage.setItem('usedUserIds', JSON.stringify(usedIds));
            
            state.userId = userId;
            state.shuffledPrizes = shuffle(prizes);
            state.isLoggedIn = true;
            render();
        }

        function handleBoxClick(prize) {
            if (state.isAnimating || state.openedBoxes.indexOf(prize.id) !== -1) return;
            
            state.isAnimating = true;
            state.selectedBox = prize.id;
            render();
            
            setTimeout(function() {
                state.openedBoxes.push(prize.id);
                state.revealedPrize = prize;
                state.isAnimating = false;
                render();
            }, 800);
        }

        function handleReset() {
            state.openedBoxes = [];
            state.revealedPrize = null;
            state.selectedBox = null;
            render();
        }

        renderBg();
        render();
    </script>
</body>
</html>
