"use client";

import dynamic from "next/dynamic";

// These interaction-heavy overlays are not needed for the first workspace
// paint. Loading them on demand keeps the dashboard shell smaller and avoids
// hydrating chat/search code before the user can interact with it.
const CommandPalette = dynamic(
  () => import("./CommandPalette").then((module) => module.CommandPalette),
  { ssr: false },
);
const AiChat = dynamic(() => import("./AiChat").then((module) => module.AiChat), {
  ssr: false,
});
const KeyboardShortcuts = dynamic(
  () => import("./KeyboardShortcuts").then((module) => module.KeyboardShortcuts),
  { ssr: false },
);

export function WorkspaceOverlays() {
  return (
    <>
      <CommandPalette />
      <AiChat />
      <KeyboardShortcuts />
    </>
  );
}
