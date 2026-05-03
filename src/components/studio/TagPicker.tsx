"use client";

export function TagPicker({ tagIds, onChange }: { tagIds: number[]; onChange: (tagIds: number[]) => void }) {
  return (
    <label className="grid gap-2">
      <span>Tag IDs</span>
      <input
        className="border border-[var(--rule)] bg-white p-3"
        value={tagIds.join(",")}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((value) => Number(value.trim()))
              .filter((value) => Number.isInteger(value) && value > 0),
          )
        }
      />
    </label>
  );
}
