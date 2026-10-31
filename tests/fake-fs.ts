/**
 * An in-memory folder with the File System Access calls the review uses. Like the real one, a writable stream
 * replaces the file only when it is closed.
 */
export class FakeDir {
  readonly kind = 'directory';
  readonly entries = new Map<string, FakeDir | Blob>();

  constructor(readonly name: string) {}

  get handle(): FileSystemDirectoryHandle {
    return this as unknown as FileSystemDirectoryHandle;
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDir> {
    const entry = this.entries.get(name);
    if (entry instanceof FakeDir) return entry;
    if (entry) throw new DOMException(name, 'TypeMismatchError');
    if (!options?.create) throw new DOMException(name, 'NotFoundError');
    const dir = new FakeDir(name);
    this.entries.set(name, dir);
    return dir;
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    const entry = this.entries.get(name);
    if (entry instanceof FakeDir) throw new DOMException(name, 'TypeMismatchError');
    if (!entry) {
      if (!options?.create) throw new DOMException(name, 'NotFoundError');
      this.entries.set(name, new Blob([]));
    }
    const dir = this;
    return {
      kind: 'file' as const,
      name,
      getFile: async () => new File([dir.entries.get(name) as Blob], name),
      createWritable: async () => {
        const parts: BlobPart[] = [];
        return {
          write: async (data: BlobPart) => void parts.push(data),
          close: async () => void dir.entries.set(name, new Blob(parts)),
        };
      },
    };
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.entries.delete(name)) throw new DOMException(name, 'NotFoundError');
  }

  async *values() {
    for (const [name, entry] of this.entries) {
      yield entry instanceof FakeDir ? entry : { kind: 'file' as const, name, getFile: async () => new File([entry], name) };
    }
  }
}
