// Confirmation words: short, no two alike by ear over a noisy radio, no squad
// names (Альфа…Эхо) and no NATO letters.
export const WORDS_RU = ['ФАЗАН', 'КЛЁН', 'РУБИН', 'ЯКОРЬ', 'ГРОМ', 'ЛИМОН', 'ТУМАН', 'КОМЕТА', 'САПФИР', 'ОРЁЛ',
  'БАРСУК', 'ПЕСОК', 'ЖУРАВЛЬ', 'ЧАЙКА', 'ЛЕДНИК', 'МАЯК', 'КЕДР', 'ШТОРМ', 'ИРИС', 'ЮПИТЕР',
  'КАНАТ', 'МОСТ', 'ЗУБР', 'ЛУНА', 'ПИОН', 'СОКОЛ', 'ТИГР', 'ХОЛМ', 'ЩИТ', 'АЛМАЗ', 'БЕРЁЗА', 'ПАРУС'];
export const WORDS_EN = ['FALCON', 'MAPLE', 'ANCHOR', 'THUNDER', 'LEMON', 'HARBOR', 'COMET', 'SAPPHIRE', 'BADGER', 'CRANE',
  'GLACIER', 'BEACON', 'CEDAR', 'STORM', 'IRIS', 'JUPITER', 'CANYON', 'BRIDGE', 'BISON', 'MOON',
  'PEONY', 'TIGER', 'HILL', 'SHIELD', 'DIAMOND', 'BIRCH', 'HEATHER', 'COBRA', 'SAIL', 'SIGNAL', 'POPLAR', 'SAGE'];
export function wordFor(fork, rnd) {
  const list = fork === 'stories_cm' ? WORDS_RU : WORDS_EN;
  return list[Math.floor(rnd() * list.length)];
}
