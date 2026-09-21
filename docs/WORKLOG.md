# uz-az-frontend — bajarilgan ishlar ro'yxati

O'zbekiston–Ozarbayjon investitsiya loyihalari sayti. Bo'sh repodan (faqat
`FRONTEND.md` bor edi) hozirgi holatgacha qilingan ishlar.

- **Stack**: Nuxt 4.5 (SSR), Vue 3, TypeScript, Vite 8, Nitro, Pinia, Naive UI
  (`@bg-dev/nuxt-naiveui`), Tailwind 3, `@nuxtjs/i18n`, VueUse
- **Backend**: IRCP — `https://apircp.miit.uz/api/v1` (kontrakt: `FRONTEND.md`)
- **Repo**: `git.miit.uz/dc/registration/uz-az-frontend`, branch `main`
- **Dev**: `pnpm dev` → `http://localhost:3001`

---

## 1-bosqich — Autentifikatsiya va skelet

| #   | Task                                    | Holat |
| --- | --------------------------------------- | ----- |
| 1.1 | PMI uslubidagi login sahifasi (`/auth`) | ✅    |
| 1.2 | Guest sifatida ko'rish, login ixtiyoriy | ✅    |
| 1.3 | Sessiyani cookie'da saqlash va tiklash  | ✅    |
| 1.4 | HTTP qatlami va xatolar bilan ishlash   | ✅    |

**1.1 — Login sahifasi.** PMI hozir OneID ishlatadi, lekin undan oldingi
versiyada ochiq "Kirish" tugmasi bo'lgan — aynan o'sha variant takrorlandi.
`app/modules/auth/` ichida: `views/Index.vue` (hero + Kirish), `components/Login.vue`
(forma), `components/LoginModal.vue`, `components/Advantages.vue` (karusel).

**1.2 — Guest rejimi.** Sayt to'liq ochiq ko'riladi; `middleware/auth.ts` faqat
o'zi so'ragan sahifalarga qo'llanadi (`definePageMeta({ middleware: 'auth' })`),
`middleware/guest.ts` esa login qilganni login sahifasidan uzoqlashtiradi.

**1.3 — Sessiya.** Token `ircp_token` cookie'da, 24 soat (backend token umri
bilan bir xil). `plugins/init.client.ts` `app:mounted` hook'ida `getMe()` ni
**bloklamasdan** chaqiradi (`.catch(() => {})`) — sahifa yuklanishini
kechiktirmaydi. Refresh endpoint **yo'q**, shuning uchun har qanday 401 tokenni
tozalaydi.

**1.4 — HTTP.** `plugins/http.ts` — API chaqiruvlari sozlanadigan yagona joy:
`Authorization: Bearer`, `Accept-Language`, `Content-Type`. 401 ishlovchisi
to'liq `try/catch` ichida va `useNuxtApp().$router?.currentRoute?.value` dan
foydalanadi (`useRoute()` emas — plugin kontekstida u ishonchsiz).
`services/` orqali chaqiriladi, komponentlarda `$fetch` ishlatilmaydi.

---

## 2-bosqich — Figma landing (piksel-aniq)

Dizayn Figma REST API orqali o'qildi (`/v1/files/:key/nodes`,
`/v1/images/:key`) — skrinshotdan chamalab emas, fayldagi haqiqiy
qiymatlardan: geometriya, ranglar, shrift o'lchamlari, matnlar.

| #   | Task                                  | Holat |
| --- | ------------------------------------- | ----- |
| 2.1 | Dizayn tokenlari (ranglar, shriftlar) | ✅    |
| 2.2 | Navbar                                | ✅    |
| 2.3 | Hero (progressive blur)               | ✅    |
| 2.4 | Partnership + naqsh lentalari         | ✅    |
| 2.5 | Projects (jadval)                     | ✅    |
| 2.6 | News                                  | ✅    |
| 2.7 | Contact                               | ✅    |
| 2.8 | Footer                                | ✅    |

**2.1 — Tokenlar.** `app/assets/scss/app.scss` da CSS o'zgaruvchilar:
`--uz-green: #51855a`, `--uz-red: #b8202c`, `--uz-cream: #fcf4e9`,
`--uz-navy: #002335`, `--uz-link-blue: #003fa5`, jadval ranglari va h.k.
Shriftlar: **Meditative** (hero) va **Collingar** (sarlavhalar) — litsenziyali,
`public/fonts` dan self-hosted; qolganlari Google Fonts.

**2.2 — Navbar.** `position: fixed`, emblema 60×60, skrol qilinganda faqat
**fon rangi** o'zgaradi — `rgba(1, 162, 201, 0.88)` + `backdrop-filter: blur(16px)`.
Bu rang alohida "Primary Button" node'idan (`50:5434`, fill `#01A2C9`) olingan.
`solid` prop ichki sahifalar uchun (hero rasmi yo'q joyda fon birinchi
pikseldan bo'lishi kerak).

**2.3 — Hero.** Figma'da rasmga _progressive_ layer blur qo'yilgan (yuqori ~30%
tiniq, pastga qarab 16px gacha). CSS'da bunday effekt yo'q, shuning uchun bir
xil rasmning **3 ta niqoblangan nusxasi** turli blur radiusi bilan qo'yildi
(5px / 10px / 16px, `mask-image: linear-gradient`). Bitta crossfade bilan
sinaganda tiniq nusxa juda erta ko'rinib qolar edi.

**2.4 — Partnership.** Yashil `#51855a` fon, islimi vatermark (SVG'ning o'zida
3% `color-dodge`), yuqori va pastki chegaralarda naqsh lentalari, rasm
`0 32px 0 32px` radiusli ramkada, 4 ta statistika `space-between` bilan.

**2.5 — Projects.** Jadval + sahifalash. Ichki skrol yo'q (talab bo'yicha),
qatorlar orasidagi gorizontal chiziqlar qatorni kesib o'tmaydi.

**2.6–2.8 — News / Contact / Footer.** Figma matnlari, o'lchamlari va
radiuslari bilan.

---

## 3-bosqich — Animatsiyalar va shrift

| #   | Task                                | Holat |
| --- | ----------------------------------- | ----- |
| 3.1 | Scroll reveal (`useReveal`)         | ✅    |
| 3.2 | Raqamlar 0 dan sanaladi (`CountUp`) | ✅    |
| 3.3 | Jadval qatorlari pastdan chiqadi    | ✅    |
| 3.4 | Navbar'dan smooth scroll            | ✅    |
| 3.5 | Shrift "sakrashi" ni yo'qotish      | ✅    |

**3.1 — `composables/useReveal.ts`.** IntersectionObserver. Yashirin holat
**faqat client'da** qo'shiladi, ya'ni JS ishlamasa ham SSR markup ko'rinadi.
Xavfsizlik uchun CSS'da 2.5s dan keyin majburan ko'rsatuvchi
`uz-reveal-fallback` animatsiyasi bor.

**3.2 — `components/landing/CountUp.vue`.** `"$3.3B"` ni `"$"` / `3.3` / `"B"`
ga ajratadi va faqat raqamni animatsiya qiladi. Yakuniy matn **serverda**
render qilinadi — hidratsiyada sakramaydi. `prefers-reduced-motion` hurmat
qilinadi.

**3.4 — `composables/useSmoothScroll.ts`.** Navbar balandligini _jonli_ o'qiydi
(fixed navbar ostiga kirib ketmasligi uchun), `prefers-reduced-motion` da
o'chadi.

**3.5 — `composables/useFontsReady.ts`.** `document.fonts.ready` ni 1500ms
timeout bilan poyga qiladi; hero va reveal shu promise'ga bog'landi, shuning
uchun sarlavha zaxira shriftda ko'rinib keyin sakramaydi.

---

## 4-bosqich — API'ga ulash

| #   | Task                             | Holat |
| --- | -------------------------------- | ----- |
| 4.1 | IRCP tiplar (`types/project.ts`) | ✅    |
| 4.2 | `project.service.ts`             | ✅    |
| 4.3 | Landing jadvali — jonli ma'lumot | ✅    |
| 4.4 | Sign-in bo'lmagandagi ko'rinish  | ✅    |
| 4.5 | Loyiha sahifasi `/projects/:id`  | ✅    |
| 4.6 | Vazifalar va izohlar             | ✅    |

**4.2 — Servis.** `GET /project/list`, `GET /project/:id?year=`,
`POST /task/comment/create`. `user_id` hech qachon yuborilmaydi (backend uni
baribir olib tashlaydi).

**4.4 — Qulf (lock).** Login qilinmaganda jadval blur ostida va ustida
"Sign in to view the full project portfolio" kartasi. Muhim nuqta: qulf
**cookie'ga** qarab ishlaydi (`hasSession = Boolean(userStore.token)`),
`/auth/me` javobiga emas — cookie SSR'da o'qiladi, shuning uchun login qilgan
foydalanuvchi profil kelguncha qulflangan holatni ko'rmaydi.

**4.5 — Loyiha sahifasi.** `layout: 'app'`, `middleware: 'auth'`.
Passport kalitlari: Project name, Country, Region, District,
Project cost mln $, Sphere, Network, Partner.
404 → "bu loyiha mavjud emas" deb **yozilmaydi**, chunki backend "yo'q" va
"sizning doirangizdan tashqarida" ni ataylab farqlamaydi.

**4.6 — Vazifalar.** `components/project/TasksTimeline.vue` — har bir vazifa
alohida karta, holati `calculated_status` bo'yicha ranglanadi
(`constants/project.ts`). Sanalar `DD.MM.YYYY` **matn** — hech qachon
`new Date()` ga berilmaydi, saralash uchun qo'lda parse qilinadi.

---

## 5-bosqich — Dizayn yangilanishlari (Projects-MIIT fayli)

| #   | Task                                   | Holat |
| --- | -------------------------------------- | ----- |
| 5.1 | Hero'dan qizil shakllar olib tashlandi | ✅    |
| 5.2 | Navbar fon rangi Primary Button'dan    | ✅    |
| 5.3 | Ministry nomi va emblema yangilandi    | ✅    |
| 5.4 | "Cooperation updates & news" → "News"  | ✅    |
| 5.5 | News kartalari yangi ko'rinishda       | ✅    |
| 5.6 | Jadval ustunlari almashtirildi         | ✅    |
| 5.7 | Sign-out jadval ko'rinishi             | ✅    |
| 5.8 | Partnership rasmi yangilandi           | ✅    |

**5.3.** `MINISTRY OF INVESTMENTS, INDUSTRY & TRADE` →
`Ministry of Investment, Industry and Trade of the Republic of Uzbekistan`,
emblema `/svg/emblem-uz.svg`. Uzun bo'lgani uchun `max-width: 230px`.

**5.6.** `Project cost in million $`, `Responsible employee`,
`Project category` olib tashlandi; o'rniga **Sphere / Region / Initiator**.

---

## 6-bosqich — Haqiqiy yangiliklar

`president.uz` dan 3 ta maqola, rasmlari yuklab olinib webp qilindi:

| Maqola                                                                        | ID   |
| ----------------------------------------------------------------------------- | ---- |
| O'zbekiston va Ozarbayjon o'rtasidagi yangi qo'shma loyihalarga start berildi | 9525 |
| Ozarbayjon Prezidenti Yangi Toshkent loyihasi bilan tanishdi                  | 9529 |
| Yangi Toshkentda "Ozarbayjon" bog'i barpo etiladi                             | 9531 |

Nashr sanalari `president.uz` ning statik HTML'ida yo'q, shuning uchun sana
o'rniga manba (`president.uz`) ko'rsatiladi — taxminiy sana yozilmadi.

---

## 7-bosqich — Country scoping (yangilangan `FRONTEND.md`)

| #   | Task                           | Holat |
| --- | ------------------------------ | ----- |
| 7.1 | Login'da `country_id` yuborish | ✅    |
| 7.2 | Izohda to'g'ri `country_id`    | ✅    |
| 7.3 | Yangilangan kontrakt hujjati   | ✅    |

**7.1.** `constants/auth.ts` da `SITE_COUNTRY_ID = 65` (Ozarbayjon; Turkiya
sayti 177 yuboradi). `auth.service.ts` uni login body'siga o'zi biriktiradi —
forma faqat `username`/`password` yig'adi, shuning uchun chaqiruvchi uni
unutib qololmaydi. Tiplar ajratildi: `IAuthSchema` (forma) → `ILoginRequest`
(simda ketadigan).

**7.2.** Avval izohga loyihaning _birinchi hamkor davlati_
(`project.countries[0].country_id`) yuborilardi. Yangilangan hujjatga ko'ra
`country_id` foydalanuvchining **write set** ida (`permissions.country_ids`)
bo'lishi shart, aks holda `403 "country not permitted"`. Loyihada bir nechta
hamkor davlat bo'lsa bu xato berardi — endi `SITE_COUNTRY_ID` yuboriladi.

---

## Hal qilingan muammolar

| #   | Muammo                                                          | Sabab                                                                                                    | Yechim                                                                                     |
| --- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| B1  | Login tugmasi bosilmayapti                                      | `.hero__content` (full-width, `z-index: 4`) header ustiga chizilardi                                     | header → `z-index: 6`                                                                      |
| B2  | `localhost:3001` ochilmaydi, network IP ishlaydi                | `--host 0.0.0.0` faqat IPv4 ga bog'lanadi, Windows `localhost` ni `::1` ga yechadi                       | `nuxt dev --port 3001 --host` (bo'sh `--host` oxirida → `::` dual-stack)                   |
| B3  | Bo'sh `3001/` papka va default Nuxt sahifasi                    | citty `--port` ni `--host` qiymati deb o'qigan                                                           | flag tartibi to'g'rilandi, papka o'chirildi                                                |
| B4  | `<ConfigProvider>` da hydration mismatch                        | `app.vue` `theme-overrides` ni fallthrough attr sifatida berardi, `NaiveConfig` esa o'zinikini bog'lardi | overrides `nuxt.config.ts` ga ko'chdi, providerlar `LayoutNaiveProviders.vue` ga ajratildi |
| B5  | Shriftlar umuman qo'llanmaydi                                   | `font-display: optional` — ~100ms oynani o'tkazib yuborsa shrift **butunlay** tashlanadi                 | `swap` + `useFontsReady` bilan sakrashni yashirish                                         |
| B6  | Naqsh lentalarida uzilishlar                                    | 187.5px kasrli birlik tiling'da brauzer har takrorni boshqacha yaxlitlardi                               | oldindan yig'ilgan 12000×440 lossless webp, butun pitch: `background-size: 1500px 55px`    |
| B7  | Loyiha sahifasi "Loading…" da qotib qoladi + hydration mismatch | `useAsyncData` faqat `true` qaytarardi, ma'lumot SSR payload'ga tushmasdi                                | `useAsyncData` ma'lumotning **egasi** qilindi                                              |
| B8  | `useProjectService` topilmaydi                                  | `app/services/` auto-import papkasi emas                                                                 | `import { useProjectService } from '~/services'`                                           |
| B9  | Navbar rangi ikki marta noto'g'ri                               | avval tugma **matni** rangi (`#003fa5`), keyin oq ishlatildi                                             | Primary Button node fill `#01A2C9`                                                         |
| B10 | Figma rasm eksporti 429                                         | kunlik limit                                                                                             | ikkinchi token bilan davom etildi                                                          |

### Rasm bilan ishlashdagi nozikliklar

- Figma'ning image-fill filtrlari (exposure / contrast / shadows) CSS'da yo'q —
  ular assetning o'ziga **pishirildi**. `out = 0.828·in − 13.8` mos keldi;
  yorqinlik bandlari tekshirildi (Figma `139/157/119/67/66/78/97/99`,
  bizniki `141/155/119/75/74/81/98/99`).
- Figma burchak radiusini eng qisqa tomonning yarmiga cheklaydi, CSS esa
  proporsional kichraytiradi — farqi hisobga olindi.
- Figma'ning `backdrop blur` i qatlam alfasini hurmat qiladi,
  CSS `backdrop-filter` esa yo'q — bitta qatlam o'rniga 3 ta niqoblangan
  qadam ishlatildi (qattiq chekkali to'rtburchak yo'qoldi).

---

## Fayl tuzilishi

```
app/
  assets/scss/app.scss     # @font-face, dizayn tokenlari, .uz-ornament, reveal
  components/landing/      # Navbar, Hero, Partnership, Projects, News,
                           # Contact, SiteFooter, CountUp
  components/layout/       # Header, Footer, NaiveProviders
  components/project/      # TasksTimeline
  components/ui/           # Naive UI o'ramlari
  composables/             # useHttp, useReveal, useFontsReady,
                           # useSmoothScroll, useI18nT, useToast
  constants/               # auth.ts (token cookie, SITE_COUNTRY_ID),
                           # project.ts (status ranglari/matnlari)
  layouts/                 # landing, app, auth, default
  locales/                 # uz (default), oz, ru, en
  middleware/              # auth (ixtiyoriy), guest
  modules/auth/            # login forma, modal, karusel
  pages/                   # index.vue, auth/index.vue, projects/[id].vue
  plugins/                 # http.ts, init.client.ts
  services/                # auth.service.ts, project.service.ts
  stores/                  # user.store.ts
  types/                   # api.ts, auth.ts, project.ts
public/
  images/                  # hero, partnership, news, naqsh lentalari (webp)
  svg/                     # emblema, naqshlar, jadval ikonkalari
  fonts/                   # Meditative, Collingar (litsenziyali), Cera Pro
```

---

## Ochiq qolgan ishlar

| #   | Nima                                | Izoh                                                                                                                                      |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | Jadvaldagi 2 ta tab                 | "Included in the state program" / "Projects included in the roadmap" — faqat vizual. `FRONTEND.md` da bunga mos filtr parametri **yo'q**. |
| O2  | `403 "no countries assigned"`       | Yangilangan hujjatda paydo bo'ldi. Login'da bu xato chiqsa "administratorga murojaat qiling" deyish kerak, "parol xato" emas.             |
| O3  | `sez_addresses`                     | Endi API'da bor — passportga qo'shsa bo'ladi. Avval yo'q edi, shuning uchun tashlab ketilgan.                                             |
| O4  | Vazifa fayllari                     | Yangi API'da `work_id`, `work`, `files[]` (ilovalar) bor — UI'da hali ko'rsatilmaydi.                                                     |
| O5  | `project_type`                      | API faqat `project_type_id` qaytaradi (IRCP uchun doim 1), nomi yo'q — passportda ko'rsatilmaydi.                                         |
| O6  | News kategoriya yorlig'i            | Figma'da cream-on-cream, ya'ni ko'rinmaydi. Shundayligicha qoldirilgan.                                                                   |
| O7  | `nuxt.config.ts` dagi eskirgan izoh | `font-display: optional` haqida yozilgan, aslida `swap` (B5 ga qarang).                                                                   |
| O8  | Davlat ruxsatlari o'zgarsa          | Tokenga yozilgani uchun PMI'da o'zgargani **qayta login** dan keyin kuchga kiradi. Foydalanuvchiga tushuntirish kerak bo'lishi mumkin.    |

---

## Turkiya versiyasi

Alohida repo: `d:\projects\uz-tr-frontend` (`git.miit.uz/dc/registration/uz-tr-frontend`),
port `3002`. Backend bir xil, faqat `SITE_COUNTRY_ID = 177` va dizayn palitrasi
boshqa (qizil `#c8102e` bandlar, navy `#385486` accent, naqsh tugunlari o'rniga
to'lqin). Batafsil: o'sha repodagi `README.md`.
