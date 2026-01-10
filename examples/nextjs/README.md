<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Mini App Store</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #0f172a;
      color: white;
      margin: 0;
      padding: 16px;
    }
    h1 {
      text-align: center;
      margin-bottom: 20px;
    }
    .card {
      background: #1e293b;
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 12px;
    }
    .card h3 {
      margin: 0 0 6px;
    }
    .card p {
      font-size: 14px;
      opacity: 0.8;
    }
    button {
      margin-top: 10px;
      width: 100%;
      padding: 10px;
      border: none;
      border-radius: 8px;
      background: #3b82f6;
      color: white;
      font-size: 16px;
      cursor: pointer;
    }
  </style>
</head>
<body>

<h1>🚀 Mini App Market</h1>

<div class="card">
  <h3>🔥 VPN PRO</h3>
  <p>Безопасный и быстрый VPN</p>
  <button onclick="openLink('https://example.com')">Открыть</button>
</div>

<div class="card">
  <h3>🤖 AI Tool</h3>
  <p>ИИ для текста и идей</p>
  <button onclick="openLink('https://example.com')">Открыть</button>
</div>

<div class="card">
  <h3>💸 Crypto App</h3>
  <p>Зарабатывай на крипте</p>
  <button onclick="openLink('https://example.com')">Открыть</button>
</div>

<script>
  const tg = window.Telegram.WebApp;
  tg.expand();

  function openLink(url) {
    tg.openLink(url);
  }
</script>

</body>
</html>
