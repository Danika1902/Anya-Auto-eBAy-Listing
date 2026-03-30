# 🧶 HeltMade – eBay Listing Eszköz

Automatikus eBay listing készítő eszköz horgolt termékekhez.

## Funkciók

- **Listing létrehozása** – Képek, leírás, anyag, mérettáblázat, ár, szállítás
- **Drag & Drop képfeltöltés** – Húzd rá a képeket vagy kattints a feltöltéshez
- **Szép siker oldal** – 10 másodperces visszaszámlálás, automatikus átirányítás
- **Állapot követő** – Listing státusz nyomonkövetése (Beküldve → Feldolgozás → Létrehozva → Élő)
- **n8n integráció** – Automatikus küldés az n8n workflow-ba

## Tech Stack

- React + Vite
- n8n webhook backend
- Vercel hosting

## Telepítés

```bash
npm install
npm run dev
```

## Deploy Vercel-re

1. Push a GitHub repo-ba
2. Importáld a Vercel-en: [vercel.com/new](https://vercel.com/new)
3. Framework: **Vite** (automatikusan felismeri)
4. Deploy!

## Konfiguráció

Az n8n form URL a `src/App.jsx` fájlban található:

```js
const N8N_FORM_URL = "https://n8n.srv1249219.hstgr.cloud/form/b2fb852d-...";
```

---

Készítette a **HeltAIum** 🤖
