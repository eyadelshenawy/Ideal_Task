// A stored "[To customer] …" or "[Customer] …" comment ends each attached
// file's name on its own "📎 name" line (see email-customer + track POST).
// This resolves each "📎 name" line to the specific Attachment row it came
// from by walking oldest-first and consuming one candidate id per name —
// so two files with the same name from different messages each map to
// their own distinct row without needing IDs embedded in the message text.

export const ATTACHMENT_LINE_PREFIX = "📎 ";

interface HasIdMessageAndCreatedAt {
  id: string;
  message: string;
  createdAt: string;
}
interface HasIdNameAndCreatedAt {
  id: string;
  fileName: string;
  createdAt: string;
}

/** Returns a Map keyed by `${eventId}#${lineIndex}` → attachment id. */
export function matchAttachmentLines<E extends HasIdMessageAndCreatedAt, A extends HasIdNameAndCreatedAt>(
  events: E[],
  attachments: A[]
): Map<string, string> {
  const byName = new Map<string, string[]>();
  for (const a of [...attachments].sort((x, y) => x.createdAt.localeCompare(y.createdAt))) {
    const list = byName.get(a.fileName) ?? [];
    list.push(a.id);
    byName.set(a.fileName, list);
  }
  const result = new Map<string, string>();
  for (const e of [...events].sort((x, y) => x.createdAt.localeCompare(y.createdAt))) {
    const lines = e.message.split("\n");
    lines.forEach((line, i) => {
      if (!line.startsWith(ATTACHMENT_LINE_PREFIX)) return;
      const name = line.slice(ATTACHMENT_LINE_PREFIX.length);
      const candidates = byName.get(name);
      const id = candidates?.shift();
      if (id) result.set(`${e.id}#${i}`, id);
    });
  }
  return result;
}
