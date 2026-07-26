export const MAX_PROJECT_INSTRUCTION_CHARS = 16_000;

export function applyProjectInstructions(text: string, instructions?: string): string {
  const cleanInstructions = instructions?.trim().slice(0, MAX_PROJECT_INSTRUCTION_CHARS);
  if (!cleanInstructions || text.startsWith("/")) return text;
  return `<project-instructions>\n${cleanInstructions}\n</project-instructions>\n\n${text}`;
}
