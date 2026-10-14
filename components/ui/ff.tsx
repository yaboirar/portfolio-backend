"use client"

// AsciiArt — "ff", made with the 21st ASCII editor and baked
// to its exact rendered output (looping video + poster). Zero dependencies:
// one <video> that fills its parent. Drop it behind or inside your content:
// <div className="relative h-96"><AsciiArt className="absolute inset-0" /></div>
// Remix the source recipe (styles, animation, palette) in the editor:
// https://21st.dev/community/ascii/editor?from=bd0afe0b-7bf7-4f6d-96ac-ec517d799380
export function AsciiArt({ className }: { className?: string }) {
  return (
    <video
      className={className}
      src={"https://assets.21st.dev/ascii-recipes/videos/user_3KdmTXVNHcnn8gD1TnCiv0f9VYC/01acff7a-f26b-46bd-8058-fdd094d621c9.mp4"}
      poster={"https://assets.21st.dev/ascii-recipes/thumbnails/user_3KdmTXVNHcnn8gD1TnCiv0f9VYC/fae6ae2c-8ef9-415c-b6e8-f426f3b31597.webp"}
      autoPlay
      loop
      muted
      playsInline
      aria-label={"ff — animated ASCII art"}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "cover",
      }}
    />
  )
}
