"use client";

/**
 * Placeholder shown while the WebGL chunk and the atlas meshes load.
 * The glbs are several megabytes, so this state is real, not theoretical.
 */
export function AtlasSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-void">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-select" />
        <p className="ident">Loading atlas meshes</p>
      </div>
    </div>
  );
}
