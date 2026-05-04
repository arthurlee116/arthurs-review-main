"use client";

type Tag = { id: number; name: string; slug: string };

export function TagPicker({ tags, tagIds, onChange }: { tags: Tag[]; tagIds: number[]; onChange: (tagIds: number[]) => void }) {
  function toggle(id: number, checked: boolean) {
    if (checked) {
      onChange([...new Set([...tagIds, id])]);
    } else {
      onChange(tagIds.filter((tagId) => tagId !== id));
    }
  }

  return (
    <fieldset className="grid gap-2">
      <legend>Tags</legend>
      {tags.length ? (
        <div className="flex flex-wrap gap-3">
          {tags.map((tag) => (
            <label key={tag.id} className="flex items-center gap-2 border border-[var(--rule)] px-3 py-2">
              <input type="checkbox" checked={tagIds.includes(tag.id)} onChange={(event) => toggle(tag.id, event.target.checked)} />
              {tag.name}
            </label>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--muted)]">No tags yet.</p>
      )}
    </fieldset>
  );
}
