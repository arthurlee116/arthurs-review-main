const segmenter = new Intl.Segmenter("zh-Hans", { granularity: "word" });

function length(value: string) {
  return Array.from(value).length;
}

export function splitOgTitle(title: string) {
  const titleLength = length(title);
  const hanLength = Array.from(title).filter((character) => /\p{Script=Han}/u.test(character)).length;
  if (titleLength < 12 || hanLength < titleLength / 2) return [title];

  const segments = Array.from(segmenter.segment(title), ({ segment }) => segment);
  const lineCount = titleLength > 36 ? 4 : titleLength > 20 ? 3 : 2;
  const lines: string[] = [];
  let cursor = 0;
  let remainingLength = titleLength;

  for (let lineIndex = 0; lineIndex < lineCount - 1; lineIndex += 1) {
    const remainingLines = lineCount - lineIndex;
    const target = Math.ceil((remainingLength / remainingLines) * 1.1);
    let bestEnd = cursor + 1;
    let bestDistance = Number.POSITIVE_INFINITY;
    let candidateLength = 0;

    for (let segmentIndex = cursor; segmentIndex < segments.length - (remainingLines - 1); segmentIndex += 1) {
      candidateLength += length(segments[segmentIndex]);
      const distance = Math.abs(candidateLength - target);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestEnd = segmentIndex + 1;
      }
    }

    const line = segments.slice(cursor, bestEnd).join("");
    lines.push(line);
    cursor = bestEnd;
    remainingLength -= length(line);
  }

  lines.push(segments.slice(cursor).join(""));
  return lines.filter(Boolean);
}
