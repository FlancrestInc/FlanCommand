export function buildUnifiedDiff(beforeText, afterText) {
  const before = lines(beforeText);
  const after = lines(afterText);
  const table = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));
  for (let oldIndex = before.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = after.length - 1; newIndex >= 0; newIndex -= 1) {
      table[oldIndex][newIndex] =
        before[oldIndex] === after[newIndex]
          ? table[oldIndex + 1][newIndex + 1] + 1
          : Math.max(table[oldIndex + 1][newIndex], table[oldIndex][newIndex + 1]);
    }
  }
  const result = [];
  let oldIndex = 0;
  let newIndex = 0;
  let oldLine = 1;
  let newLine = 1;
  while (oldIndex < before.length || newIndex < after.length) {
    if (
      oldIndex < before.length &&
      newIndex < after.length &&
      before[oldIndex] === after[newIndex]
    ) {
      result.push({ kind: "context", text: before[oldIndex], oldLine, newLine });
      oldIndex += 1;
      newIndex += 1;
      oldLine += 1;
      newLine += 1;
    } else if (
      oldIndex < before.length &&
      (newIndex >= after.length || table[oldIndex + 1][newIndex] >= table[oldIndex][newIndex + 1])
    ) {
      result.push({ kind: "remove", text: before[oldIndex], oldLine });
      oldIndex += 1;
      oldLine += 1;
    } else {
      result.push({ kind: "add", text: after[newIndex], newLine });
      newIndex += 1;
      newLine += 1;
    }
  }
  return result;
}

function lines(value) {
  const result = String(value || "").split("\n");
  if (result.at(-1) === "") result.pop();
  return result;
}
