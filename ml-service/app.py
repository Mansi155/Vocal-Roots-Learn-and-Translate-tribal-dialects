"""Vocal Roots ML service.

1. /detect     dialect identification  (char n-gram TF-IDF + logistic regression)
2. /suggest    fuzzy word suggestions   (char n-gram TF-IDF + cosine nearest neighbours)
3. /recommend  review plan              (forgetting-curve retention model over each learner's SM-2 data)

Models are trained from the MongoDB `words` collection at startup and whenever /retrain is called.
"""
import os
import re
import datetime as dt
from collections import defaultdict

from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from pymongo import MongoClient
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import NearestNeighbors

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))
MONGO_URI = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/vocalroots")
db = MongoClient(MONGO_URI).get_default_database()

app = FastAPI(title="Vocal Roots ML")
state = {"vec": None, "clf": None, "nn": None, "words": [], "labels": {}, "known": set()}
TOKEN = re.compile(r"[\w']+", re.UNICODE)


def train():
    words = list(db.words.find({}, {"roman": 1, "romanLower": 1, "dialect": 1, "dialectLabel": 1,
                                    "concept": 1, "hindi": 1}))
    if len(words) < 2:
        state.update(vec=None, clf=None, nn=None, words=[], labels={}, known=set())
        return {"words": len(words), "dialects": 0, "detector": False}

    texts = [(w.get("romanLower") or w["roman"]).lower() for w in words]
    dialects = [w["dialect"] for w in words]
    vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(1, 4), sublinear_tf=True)
    X = vec.fit_transform(texts)

    clf = None
    if len(set(dialects)) > 1:
        clf = LogisticRegression(max_iter=2000, C=8.0).fit(X, dialects)

    nn = NearestNeighbors(n_neighbors=min(25, len(words)), metric="cosine").fit(X)
    state.update(
        vec=vec, clf=clf, nn=nn, words=words,
        labels={w["dialect"]: w.get("dialectLabel", w["dialect"]) for w in words},
        known=set(texts),
    )
    return {"words": len(words), "dialects": len(set(dialects)), "detector": clf is not None}


@app.on_event("startup")
def startup():
    print("Trained:", train())


@app.get("/health")
def health():
    return {"ok": True, "detector": state["clf"] is not None, "words": len(state["words"])}


@app.post("/retrain")
def retrain():
    return train()


class DetectIn(BaseModel):
    text: str


@app.post("/detect")
def detect(body: DetectIn):
    if state["clf"] is None:
        raise HTTPException(503, "The detector needs words from at least two dialects to train")
    tokens = [t for t in TOKEN.findall(body.text.lower())][:30]
    if not tokens:
        raise HTTPException(400, "Type a word or short phrase to analyse")
    probs = state["clf"].predict_proba(state["vec"].transform(tokens)).mean(axis=0)
    preds = sorted(
        ({"dialect": c, "label": state["labels"].get(c, c), "probability": round(float(p), 4)}
         for c, p in zip(state["clf"].classes_, probs)),
        key=lambda r: -r["probability"],
    )
    known = sum(t in state["known"] for t in tokens) / len(tokens)
    return {"predictions": preds, "known_ratio": round(known, 3)}


@app.get("/suggest")
def suggest(token: str, dialect: str | None = None, k: int = Query(3, ge=1, le=10)):
    if state["nn"] is None:
        return {"suggestions": []}
    q = state["vec"].transform([token.lower()])
    dist, idx = state["nn"].kneighbors(q)
    out = []
    for d, i in zip(dist[0], idx[0]):
        w = state["words"][i]
        score = 1 - float(d)
        if score < 0.35 or (dialect and w["dialect"] != dialect):
            continue
        out.append({"roman": w["roman"], "concept": w["concept"], "dialect": w["dialect"], "score": round(score, 3)})
    return {"suggestions": out[:k]}


@app.get("/recommend/{user_id}")
def recommend(user_id: str, limit: int = Query(8, ge=1, le=30)):
    """Rank a learner's cards by predicted recall.

    SM-2 schedules reviews so retention is ~90% at the due date. We model decay as
    retention = 0.9 ** (days_since_review / stability), where stability grows with the card's
    interval and ease and shrinks with lapses. The lowest-retention cards are reviewed first.
    """
    try:
        uid = ObjectId(user_id)
    except InvalidId:
        raise HTTPException(400, "Invalid user id")

    cards = list(db.progress.find({"user": uid}))
    if not cards:
        return {"items": [], "weakCategories": []}

    words = {w["_id"]: w for w in db.words.find({"_id": {"$in": [c["word"] for c in cards]}})}
    now = dt.datetime.utcnow()
    items, by_cat = [], defaultdict(list)

    for c in cards:
        w = words.get(c["word"])
        if not w:
            continue
        last = c.get("lastReviewed") or c.get("updatedAt") or now
        elapsed = max((now - last).total_seconds() / 86400.0, 0.0)
        stability = max(c.get("interval", 0), 0.5) * (c.get("ease", 2.5) / 2.5) / (1 + 0.25 * c.get("lapses", 0))
        retention = 0.9 ** (elapsed / max(stability, 0.25))
        by_cat[w.get("category", "general")].append(retention)
        items.append({
            "wordId": str(w["_id"]), "roman": w["roman"], "native": w.get("native", ""),
            "concept": w["concept"], "hindi": w["hindi"], "dialectLabel": w.get("dialectLabel", ""),
            "retention": round(retention, 3),
        })

    items.sort(key=lambda r: r["retention"])
    weak = sorted(({"category": k, "retention": round(sum(v) / len(v), 3), "cards": len(v)} for k, v in by_cat.items()),
                  key=lambda r: r["retention"])[:3]
    return {"items": items[:limit], "weakCategories": weak}
