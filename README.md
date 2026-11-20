# Vocal Roots

Convert between English, Hindi and tribal dialects, hear the words, and learn them with spaced repetition.

```
frontend/     HTML, CSS, vanilla JS (served by the API)
backend/      Node.js, Express, MongoDB (Mongoose), JWT auth, audio uploads
ml-service/   Python, FastAPI, scikit-learn (reads the same MongoDB)
```

## Run it

1. **MongoDB**: `docker compose up -d` (or use a local install / MongoDB Atlas and set `MONGO_URI`).
2. **API + website**
   ```
   cd backend
   cp .env.example .env        # set JWT_SECRET to a long random string
   npm install
   npm run seed                # loads the 20 dialects and starter words (also runs on start when SEED_ON_START=true)
   npm start                   # http://localhost:5000
   ```
3. **ML service** (second terminal)
   ```
   cd ml-service
   python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn app:app --port 8001
   ```
   Translation, flashcards and the quiz work without it. Dialect detection and the review plan need it.

## The 20 dialects

| Dialect | Family | Spoken in | Starter words |
|---|---|---|---|
| Santali | Austroasiatic | Jharkhand, Odisha, West Bengal, Bihar, Assam | 8 |
| Mundari | Austroasiatic | Jharkhand, Odisha, West Bengal | 3 |
| Ho | Austroasiatic | Jharkhand, Odisha | 5 |
| Kurukh (Oraon) | Dravidian | Jharkhand, Chhattisgarh, Odisha, West Bengal | 0 |
| Gondi | Dravidian | Madhya Pradesh, Chhattisgarh, Maharashtra, Telangana, Odisha | 1 |
| Bhili | Indo-Aryan | Rajasthan, Gujarat, Madhya Pradesh, Maharashtra | 1 |
| Khasi | Austroasiatic | Meghalaya | 10 |
| Garo (A·chik) | Tibeto-Burman | Meghalaya, Assam | 5 |
| Mizo | Tibeto-Burman | Mizoram | 12 |
| Bodo (Boro) | Tibeto-Burman | Assam | 4 |
| Kokborok | Tibeto-Burman | Tripura | 5 |
| Adi | Tibeto-Burman | Arunachal Pradesh | 2 |
| Ao Naga | Tibeto-Burman | Nagaland | 0 |
| Lepcha (Rong) | Tibeto-Burman | Sikkim, West Bengal | 0 |
| Jaunsari | Indo-Aryan | Uttarakhand | 0 |
| Kui (Khond) | Dravidian | Odisha, Andhra Pradesh | 0 |
| Koya | Dravidian | Telangana, Chhattisgarh, Odisha, Andhra Pradesh | 0 |
| Sora (Savara) | Austroasiatic | Odisha, Andhra Pradesh | 0 |
| Angami Naga | Tibeto-Burman | Nagaland, Manipur | 0 |
| Nyishi | Tibeto-Burman | Arunachal Pradesh | 0 |

Starter words are unverified. Kurukh, Ao Naga, Lepcha, Jaunsari, Kui, Koya, Sora, Angami Naga and Nyishi are listed but have no words yet. Fill them in `backend/seed/vocabulary.json` (format: dialect id, then English meaning, then the word) or through the Contribute form. Dialect details are in `backend/seed/dialects.json`.

Seeding is safe to repeat. `npm run seed` adds anything missing and never overwrites community words. `npm run seed -- --reset` also refreshes the starter words from the JSON files. The old two-dialect demo words are removed automatically. Restart the ML service after seeding so it retrains on the new words.

## ML features

| Feature | Model | Where |
|---|---|---|
| Dialect detector | TF-IDF on character 1-4 grams + logistic regression, probabilities averaged across words | `POST /api/ml/detect` |
| Typo-tolerant lookup | Cosine nearest neighbours on the same n-gram vectors (Levenshtein fallback in Node if the service is offline) | used inside `POST /api/translate` |
| Review plan | Forgetting-curve model over each learner's SM-2 data (interval, ease, lapses, time since review) ranks cards by predicted recall | `GET /api/ml/recommend` |

Models train from the `words` collection on startup. After adding many words, call `POST /api/ml/retrain` (reviewer account).

## Data and consent

- **The seeded words are starter entries, not verified vocabulary.** Have fluent speakers check them, then set `verified: true`.
- To make an account a reviewer (can verify words, retrain models), set `role: "reviewer"` on the user document in MongoDB.
- Browser text-to-speech has no tribal-dialect voices. Where a word has no recording it falls back to a Hindi voice, which is only an approximation. Native-speaker recordings are the real audio source.
- Get consent from speakers and their community before recording or publishing voices and words.

## API summary

```
POST /api/auth/register | /login
GET  /api/words/stats | /dialects | /categories | ?dialect=&category=&q=
POST /api/words                 (login)  add an unverified word
POST /api/words/:id/audio       (login)  upload a recording (audio/*, 3 MB)
PATCH /api/words/:id/verify     (reviewer)
POST /api/translate             { text, from, to }  from/to: "english" | "hindi" | dialect id
GET  /api/learn/deck | /quiz | /stats
POST /api/learn/review          (login)  { wordId, quality 0-5 }  SM-2 update
POST /api/learn/quiz/finish     (login)
POST /api/ml/detect | GET /api/ml/recommend (login) | POST /api/ml/retrain (reviewer)
```

## Before going public

Set a strong `JWT_SECRET`, restrict `CLIENT_ORIGIN`, serve over HTTPS, store uploads in object storage instead of local disk, and add moderation for contributed words and audio.
