/**
 * Filling a template's placeholder ("Your video here") with the user's own
 * video or photo. Call from a click: it opens the file picker.
 */
import { fillPlaceholder } from "@motion/core";
import { importFiles } from "./media.ts";

export function pickForPlaceholder(placeholderId: string): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "video/*,image/*,.mov,.mkv";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    void importFiles([file], {
      place: (d, assetId) => void fillPlaceholder(d, placeholderId, assetId),
    });
  };
  input.click();
}
