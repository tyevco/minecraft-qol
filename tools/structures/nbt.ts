/**
 * Minimal NBT writer, Bedrock flavour: little-endian, uncompressed, a single
 * root compound with an empty name. Enough to write a .mcstructure.
 */
export type Tag =
  | { type: "byte"; value: number }
  | { type: "int"; value: number }
  | { type: "string"; value: string }
  | { type: "list"; items: Tag[] }
  | { type: "compound"; value: Record<string, Tag> };

const TAG_ID = {
  end: 0,
  byte: 1,
  int: 3,
  string: 8,
  list: 9,
  compound: 10,
} as const;

export const byte = (value: number): Tag => ({ type: "byte", value });
export const int = (value: number): Tag => ({ type: "int", value });
export const string = (value: string): Tag => ({ type: "string", value });
export const list = (items: Tag[]): Tag => ({ type: "list", items });
export type CompoundTag = Extract<Tag, { type: "compound" }>;
export const compound = (value: Record<string, Tag>): CompoundTag => ({
  type: "compound",
  value,
});

class Writer {
  private chunks: Buffer[] = [];

  u8(v: number): void {
    this.chunks.push(Buffer.from([v & 0xff]));
  }
  i32(v: number): void {
    const b = Buffer.alloc(4);
    b.writeInt32LE(v);
    this.chunks.push(b);
  }
  str(s: string): void {
    const bytes = Buffer.from(s, "utf8");
    const len = Buffer.alloc(2);
    len.writeUInt16LE(bytes.length);
    this.chunks.push(len, bytes);
  }
  payload(tag: Tag): void {
    switch (tag.type) {
      case "byte":
        this.u8(tag.value);
        break;
      case "int":
        this.i32(tag.value);
        break;
      case "string":
        this.str(tag.value);
        break;
      case "list": {
        const first = tag.items[0];
        this.u8(first ? TAG_ID[first.type] : TAG_ID.end);
        this.i32(tag.items.length);
        for (const item of tag.items) {
          if (first && item.type !== first.type)
            throw new Error("NBT list items must share a type");
          this.payload(item);
        }
        break;
      }
      case "compound":
        for (const [name, child] of Object.entries(tag.value)) {
          this.u8(TAG_ID[child.type]);
          this.str(name);
          this.payload(child);
        }
        this.u8(TAG_ID.end);
        break;
    }
  }
  bytes(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

/** Encode a root compound (empty name), the form every Bedrock NBT file takes. */
export function encodeRoot(root: CompoundTag): Buffer {
  const w = new Writer();
  w.u8(TAG_ID.compound);
  w.str("");
  w.payload(root);
  return w.bytes();
}
