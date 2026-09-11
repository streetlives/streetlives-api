export function extractCommentContent(content) {
  try {
    const parsed = JSON.parse(content);
    // Ensure parsed value is actually an object
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return content;
  } catch (e) {
    // If parsing fails, return the original string
    return content;
  }
}
