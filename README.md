# Password Vault 🔐

একটি Single Page Application — ওয়েবসাইটের username, email, password সংরক্ষণের জন্য।
কোনো server লাগে না, সব ডেটা browser-এর localStorage-এ থাকে।

## ফিচার

- প্রথমবার Admin Register (একবারই — এরপর শুধু Login)
- **GitHub Gist-এ ডেটা sync** — যেকোনো browser/device থেকে login করে সব ডেটা পাবেন
- ওয়েবসাইট, URL, username, email, password, note সেভ করা
- এন্ট্রি এডিট / মুছে ফেলা / সার্চ
- পাসওয়ার্ড দেখা-লুকানো ও এক-ক্লিকে কপি
- শক্তিশালী random password generator
- সম্পূর্ণ responsive ডিজাইন

## সেটআপ (৫ মিনিট)

### ধাপ ১: GitHub Token বানান
1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. **Generate new token (classic)** → নাম দিন (যেমন: password-vault)
3. Scope: শুধু **`gist`** চেক দিন
4. Generate করে token কপি করে নিরাপদ জায়গায় রাখুন (আর দেখা যাবে না!)

### ধাপ ২: ওয়েবসাইটে Register
1. প্রথমবার সাইট খুললে Register ফর্ম আসবে
2. ইউজারনেম, মাস্টার পাসওয়ার্ড এবং GitHub Token দিন
3. অটোমেটিক একটি **secret Gist** তৈরি হবে — এখানেই আপনার সব ডেটা থাকবে

### নতুন browser/device-এ login
- ইউজারনেম + পাসওয়ার্ড + **Gist ID** + **Token** দিন (একবারই)
- Gist ID পাবেন আপনার Gist পেজের URL-এ: `https://gist.github.com/username/এই-অংশটা-Gist-ID`

## GitHub Pages-এ Host করার নিয়ম

1. GitHub-এ নতুন repository তৈরি করুন (public)
2. এই ফোল্ডারের ফাইলগুলো push করুন:
   ```bash
   git init
   git add .
   git commit -m "Password Vault"
   git branch -M main
   git remote add origin https://github.com/আপনার-username/repo-নাম.git
   git push -u origin main
   ```
3. Repository → **Settings** → **Pages** → Source: `main` branch, `/ (root)` → Save
4. কয়েক মিনিট পর `https://আপনার-username.github.io/repo-নাম/` এ সাইট চালু হবে

## গুরুত্বপূর্ণ সতর্কতা

- ডেটা আপনার secret Gist-এ থাকে — token কারো হাতে পেলে ডেটা দেখতে/পাল্টাতে পারবে
- Gist-এ ডেটা plain text-এ থাকে (encrypted নয়) — তাই ব্যাংকিং ইত্যাদি খুব সংবেদনশীল পাসওয়ার্ড এখানে রাখবেন না
- Token হারিয়ে গেলে নতুন token বানিয়ে login করুন; Gist মুছে গেলে সব ডেটা হারাবেন
- খুব গুরুত্বপূর্ণ পাসওয়ার্ডের জন্য Bitwarden-এর মতো password manager ব্যবহার করাই নিরাপদ
