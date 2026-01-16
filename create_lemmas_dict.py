#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Create a lexeme dictionary that stores lemma + morphology metadata."""

import gzip
import struct
import sys
import time
from pathlib import Path

import pymorphy2

ROOT_DIR = Path(__file__).resolve().parent
DESTINATION_BIN = ROOT_DIR / "public" / "assets" / "lemmas.bin"


def ensure_assets_dirs():
    DESTINATION_BIN.parent.mkdir(parents=True, exist_ok=True)


def build_entry(tag_or_none, lemma):
    grammemes = sorted(str(g) for g in getattr(tag_or_none, "grammemes", []))
    grammemes = [g for g in grammemes if g]
    return {
        "lemma": lemma or "",
        "grammemes": grammemes,
    }


def build_dictionary():
    morph = pymorphy2.MorphAnalyzer()
    lemmas = {}
    last_log = time.monotonic()

    for idx, word_info in enumerate(morph.dictionary.iter_known_words(), start=1):
        word, tag, lemma = word_info[:3]
        if word in lemmas:
            continue
        lemmas[word] = build_entry(tag, lemma)
        if idx % 100_000 == 0 or time.monotonic() - last_log >= 10:
            print(f"Processed {idx} entries")
            last_log = time.monotonic()
    print(f"Built dictionary with {len(lemmas)} unique entries")
    return lemmas


def write_binary(lemmas, path: Path):
    print("Preparing binary dump...")
    grammeme_set = set()
    for entry in lemmas.values():
        grammeme_set.update(entry["grammemes"])
    grammemes = sorted(grammeme_set)
    index_map = {gram: idx for idx, gram in enumerate(grammemes)}
    with gzip.open(path, "wb", compresslevel=9) as f:
        f.write(b"LMDB")
        f.write(struct.pack("<B", 1))
        f.write(struct.pack("<I", len(lemmas)))
        f.write(struct.pack("<H", len(grammemes)))
        for gram in grammemes:
            encoded = gram.encode("utf-8")
            if len(encoded) > 255:
                raise ValueError(f"Grammeme is too long: {gram}")
            f.write(struct.pack("B", len(encoded)))
            f.write(encoded)
        for word, entry in lemmas.items():
            word_bytes = word.encode("utf-8")
            lemma_bytes = entry["lemma"].encode("utf-8")
            if len(word_bytes) > 0xFFFF or len(lemma_bytes) > 0xFFFF:
                raise ValueError(f"Word or lemma is too long: {word}")
            f.write(struct.pack("<H", len(word_bytes)))
            f.write(word_bytes)
            f.write(struct.pack("<H", len(lemma_bytes)))
            f.write(lemma_bytes)
            indexes = [index_map[g] for g in entry["grammemes"]]
            if len(indexes) > 0xFF:
                raise ValueError("Too many grammemes for a single entry")
            f.write(struct.pack("B", len(indexes)))
            for idx in indexes:
                f.write(struct.pack("<H", idx))


def main():
    print("Starting lemma dictionary build...")
    ensure_assets_dirs()
    lemmas = build_dictionary()
    print(f"Built dictionary with {len(lemmas)} entries")
    print(f"Writing compressed binary dictionary to {DESTINATION_BIN}")
    write_binary(lemmas, DESTINATION_BIN)
    print("Dictionary build complete")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Interrupted by user", file=sys.stderr)
        sys.exit(1)