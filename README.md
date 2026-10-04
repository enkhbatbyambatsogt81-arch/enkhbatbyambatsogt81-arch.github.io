# CV ба хичээлүүд — хувийн сайт

Хувийн танилцуулга, CV болон их сургуульд үзсэн хичээлүүдийг харуулах сайт.
Хичээлийн файлуудыг та хэнд үзүүлэхээ Google и-мэйлээр нь сонгоно.

- **Сайт:** энгийн HTML/JS (`index.html`, `app.js`, `config.js`), GitHub Pages дээр үнэгүй байрлана.
- **Өгөгдөл, файл, нэвтрэлт:** Supabase (үнэгүй багц: 1 GB файл, 500 MB өгөгдөл).
- **Хандах эрх:** `supabase/schema.sql` доторх дүрмүүд хамгаална. CV, хичээлийн жагсаалтыг хүн бүр харна;
  хичээлийн файлыг зөвхөн та болон таны эрх өгсөн хүмүүс үзнэ.

## Тохируулах алхмууд (нэг удаа)

### 1. Supabase төсөл
1. <https://supabase.com> → **Start your project** → GitHub бүртгэлээрээ нэвтэрнэ.
2. **New project** → нэр: `portfolio`, Region: **Northeast Asia (Tokyo)** эсвэл **Southeast Asia (Singapore)**,
   Database password-аа хадгалж аваарай → **Create**.
3. Зүүн цэс → **SQL Editor** → **New query** → `supabase/schema.sql` файлын бүх агуулгыг хуулж тавиад → **Run**.
   («Success. No rows returned» гарвал болсон.)
4. **Project Settings → API** хэсгээс **Project URL** болон **anon public** түлхүүрийг хуулна.
   Эдгээрийг `config.js`-д оруулна. **service_role** түлхүүрийг хэзээ ч хаана ч бүү оруул.

### 2. Google-ээр нэвтрэх
1. Supabase → **Authentication → Sign In / Providers → Google** нээгээд доорх **Callback URL**-ийг хуулна
   (`https://….supabase.co/auth/v1/callback` хэлбэртэй).
2. <https://console.cloud.google.com> → шинэ төсөл үүсгэнэ.
3. **APIs & Services → OAuth consent screen**: User type **External**, App name, support email бөглөөд хадгална.
   Дараа нь **Publish app** дарж «In production» болгоно (эс тэгвээс зөвхөн таны нэмсэн хүмүүс нэвтэрнэ).
4. **Credentials → Create credentials → OAuth client ID** → Application type **Web application** →
   **Authorized redirect URIs** хэсэгт 1-р алхамд хуулсан Callback URL-ийг нэмнэ → **Create**.
5. Гарч ирсэн **Client ID** болон **Client secret**-ийг Supabase-ийн Google тохиргоонд оруулж, **Enable** болгоод **Save**.

### 3. GitHub Pages дээр байршуулах
1. <https://github.com/new> → Repository name: **`enkhbatbyambatsogt81-arch.github.io`** → **Public** → **Create repository**.
2. **uploading an existing file** холбоос → `index.html`, `app.js`, `config.js` файлуудыг чирж оруулаад → **Commit changes**.
3. Repository → **Settings → Pages** → Source: **Deploy from a branch**, Branch: **main / (root)** → **Save**.
   Хэдэн минутын дараа сайт <https://enkhbatbyambatsogt81-arch.github.io> хаягаар нээгдэнэ.
4. Supabase → **Authentication → URL Configuration**: **Site URL** = `https://enkhbatbyambatsogt81-arch.github.io`,
   **Redirect URLs**-д мөн тэр хаягийг нэмнэ.

### 4. Файлуудаа оруулах
1. Сайт руу орж **Google-ээр нэвтрэх** (`schema.sql`-д бичсэн эзний хаягаар).
2. **Хичээлүүд** таб → «Бүх хичээлийн файлыг нэг дор оруулах» хэсэг рүү
   `Documents\Сайтад оруулах` хавтсыг чирж тавина. Хавтас бүр нэрэн дэх кодоороо (ECEN213…) өөрийн хичээл рүү орно.

## Өдөр тутмын хэрэглээ
- **Хүнд эрх өгөх:** **Хандах эрх** таб → **Хүн нэмэх** → тэр хүний Google хаяг + хичээлүүд.
- **Файл нэмэх:** хичээл дээр дарж, файл/хавтсаа чирж оруулна. Ижил замтай файл оруулбал шинээр солигдоно.
- **Эзэн нэмэх/солих:** Supabase → SQL Editor:
  `insert into public.owners (email) values ('шинэ@gmail.com');`

## Анхаарах
- Supabase-ийн үнэгүй төсөл 7 хоног огт ашиглагдаагүй бол түр унтардаг; самбараас нь **Restore** дарж сэргээнэ.
- Нэг файл 50 MB хүртэл. Нийт файлын сан 1 GB.
- Эрхийг хассан хүн хуучин холбоосоороо файл нээж чадахгүй: файлын холбоос 5 минутын дотор хүчингүй болно.
