import sanitizeHtml from "sanitize-html";

export function sanitize(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
  });
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };
  for (const key in result) {
    if (typeof result[key] === "string") {
      (result as Record<string, unknown>)[key] = sanitize(result[key] as string);
    }
  }
  return result;
}
