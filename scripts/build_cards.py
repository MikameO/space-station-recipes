# scripts/build_cards.py — promo/cards-src/<id>.png -> promo/cards/<id>.webp (720 px wide).
# Run: python scripts/build_cards.py   (after scripts/shoot_cards.mjs)
import pathlib, sys
from PIL import Image

SRC = pathlib.Path('promo/cards-src')
DST = pathlib.Path('promo/cards')
WIDTH = 720
TARGET_KB = 25

def build(png: pathlib.Path) -> int:
    im = Image.open(png).convert('RGB')
    w, h = im.size
    im = im.resize((WIDTH, round(WIDTH * h / w)), Image.LANCZOS)
    out = DST / (png.stem + '.webp')
    for q in (72, 64, 56, 48):
        im.save(out, 'WEBP', quality=q, method=6)
        kb = out.stat().st_size // 1024
        if kb <= TARGET_KB:
            break
    print(f'{out} {im.size[0]}x{im.size[1]} q={q} {kb} KB')
    return kb

def main() -> int:
    DST.mkdir(parents=True, exist_ok=True)
    pngs = sorted(SRC.glob('*.png'))
    if not pngs:
        print('no sources in promo/cards-src — run node scripts/shoot_cards.mjs first'); return 1
    worst = max(build(p) for p in pngs)
    return 0 if worst <= TARGET_KB else 1

if __name__ == '__main__':
    sys.exit(main())
